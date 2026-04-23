import { jest } from '@jest/globals';

// Mock Anthropic before any dynamic imports
let mockCreate;
jest.unstable_mockModule('@anthropic-ai/sdk', () => {
  mockCreate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Hello from Claude.' }],
    usage: { input_tokens: 10, output_tokens: 5 },
  });
  return {
    default: jest.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

let pool, complete, clearOrgConfigCache, encrypt;
const TEST_ORG_ID = '10000000-0000-0000-0000-000000000001';
let testConfigId;

beforeAll(async () => {
  ({ pool }              = await import('../db/pool.js'));
  ({ complete, clearOrgConfigCache } = await import('./modelRouter.js'));
  ({ encrypt }           = await import('../lib/encryption.js'));

  // Insert a test org config with primary provider = claude
  const encKey = encrypt('test-api-key-ROUTER');
  const { rows } = await pool.query(
    `INSERT INTO organisation_ai_config
       (organisation_id, primary_provider, primary_model, primary_api_key_encrypted,
        challenger_provider, challenger_model, challenger_api_key_encrypted,
        challenger_percentage, tokenisation_enabled, data_agreement_tier)
     VALUES ($1, 'claude', 'claude-model-primary', $2,
             'claude', 'claude-model-challenger', $2,
             0, false, 'standard')
     RETURNING id`,
    [TEST_ORG_ID, encKey]
  );
  testConfigId = rows[0].id;
});

afterAll(async () => {
  clearOrgConfigCache();
  if (testConfigId) {
    await pool.query('DELETE FROM organisation_ai_config WHERE id = $1', [testConfigId]);
  }
});

beforeEach(() => {
  mockCreate.mockClear();
  clearOrgConfigCache(TEST_ORG_ID);
  // Reset mock to default response
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'Hello from Claude.' }],
    usage: { input_tokens: 10, output_tokens: 5 },
  });
});

// ─── ROUTER-001 ───────────────────────────────────────────────────────────────

test('ROUTER-001: Routes to Claude when provider is claude', async () => {
  const result = await complete(
    { systemMessage: 'You are a helper.', userMessage: 'Hello.' },
    TEST_ORG_ID
  );

  expect(result.provider).toBe('claude');
  expect(mockCreate).toHaveBeenCalledTimes(1);
});

// ─── ROUTER-002 ───────────────────────────────────────────────────────────────

test('ROUTER-002: Returns standardised response object with all required fields', async () => {
  const result = await complete(
    { systemMessage: 'System.', userMessage: 'User.' },
    TEST_ORG_ID
  );

  expect(typeof result.content).toBe('string');
  expect(typeof result.provider).toBe('string');
  expect(typeof result.model).toBe('string');
  expect(typeof result.tokenisationApplied).toBe('boolean');
  expect(typeof result.lowConfidenceFlags).toBe('number');
  expect(typeof result.promptTokens).toBe('number');
  expect(typeof result.completionTokens).toBe('number');
});

// ─── ROUTER-003 ───────────────────────────────────────────────────────────────

test('ROUTER-003: Calls piiTokeniser.tokenise before sending — PII absent from prompt to AI', async () => {
  // Enable tokenisation for this test by updating the row
  await pool.query(
    'UPDATE organisation_ai_config SET tokenisation_enabled = true WHERE id = $1',
    [testConfigId]
  );
  clearOrgConfigCache(TEST_ORG_ID);

  let capturedUserMessage;
  mockCreate.mockImplementationOnce(async ({ messages }) => {
    capturedUserMessage = messages[0].content;
    return { content: [{ type: 'text', text: 'Acknowledged.' }], usage: { input_tokens: 5, output_tokens: 2 } };
  });

  await complete(
    { systemMessage: 'System.', userMessage: 'Contact me at john@example.com please.' },
    TEST_ORG_ID
  );

  expect(capturedUserMessage).not.toContain('john@example.com');
  expect(capturedUserMessage).toMatch(/\[EMAIL-\d+\]/);

  // Reset tokenisation
  await pool.query(
    'UPDATE organisation_ai_config SET tokenisation_enabled = false WHERE id = $1',
    [testConfigId]
  );
  clearOrgConfigCache(TEST_ORG_ID);
});

// ─── ROUTER-004 ───────────────────────────────────────────────────────────────

test('ROUTER-004: Calls piiTokeniser.detokenise on response — PII restored in final content', async () => {
  await pool.query(
    'UPDATE organisation_ai_config SET tokenisation_enabled = true WHERE id = $1',
    [testConfigId]
  );
  clearOrgConfigCache(TEST_ORG_ID);

  // The mock returns the tokenised user message back (simulating Claude echoing it)
  // so we can verify detokenise restores the original PII
  mockCreate.mockImplementationOnce(async ({ messages }) => ({
    content: [{ type: 'text', text: messages[0].content }], // echo tokenised text
    usage: { input_tokens: 5, output_tokens: 5 },
  }));

  const result = await complete(
    { systemMessage: 'System.', userMessage: 'Email john@example.com about this.' },
    TEST_ORG_ID
  );

  expect(result.content).toContain('john@example.com');
  expect(result.content).not.toMatch(/\[EMAIL-\d+\]/);
  expect(result.tokenisationApplied).toBe(true);

  await pool.query(
    'UPDATE organisation_ai_config SET tokenisation_enabled = false WHERE id = $1',
    [testConfigId]
  );
  clearOrgConfigCache(TEST_ORG_ID);
});

// ─── ROUTER-005 ───────────────────────────────────────────────────────────────

test('ROUTER-005: A/B routing sends to challenger when challenger_percentage = 100', async () => {
  await pool.query(
    'UPDATE organisation_ai_config SET challenger_percentage = 100 WHERE id = $1',
    [testConfigId]
  );
  clearOrgConfigCache(TEST_ORG_ID);

  const result = await complete(
    { systemMessage: 'System.', userMessage: 'Test.' },
    TEST_ORG_ID
  );

  expect(result.model).toBe('claude-model-challenger');

  await pool.query(
    'UPDATE organisation_ai_config SET challenger_percentage = 0 WHERE id = $1',
    [testConfigId]
  );
  clearOrgConfigCache(TEST_ORG_ID);
});

// ─── ROUTER-006 ───────────────────────────────────────────────────────────────

test('ROUTER-006: Falls back to ANTHROPIC_API_KEY env var when no org config', async () => {
  // Pass null org ID — no DB lookup, uses FALLBACK config
  const result = await complete(
    { systemMessage: 'System.', userMessage: 'Hello.' },
    null
  );

  expect(result.provider).toBe('claude');
  expect(result.model).toBe('claude-sonnet-4-6'); // FALLBACK model
  expect(mockCreate).toHaveBeenCalledTimes(1);
});

// ─── ROUTER-007 ───────────────────────────────────────────────────────────────

test('ROUTER-007: Org config is cached — DB not queried on second call', async () => {
  clearOrgConfigCache(TEST_ORG_ID);

  const querySpy = jest.spyOn(pool, 'query');

  // First call — should hit DB
  await complete({ systemMessage: 'S.', userMessage: 'U.' }, TEST_ORG_ID);
  const callsAfterFirst = querySpy.mock.calls.filter(
    (c) => typeof c[0] === 'string' && c[0].includes('organisation_ai_config')
  ).length;

  // Second call — should use cache, not DB
  await complete({ systemMessage: 'S.', userMessage: 'U.' }, TEST_ORG_ID);
  const callsAfterSecond = querySpy.mock.calls.filter(
    (c) => typeof c[0] === 'string' && c[0].includes('organisation_ai_config')
  ).length;

  expect(callsAfterFirst).toBe(1);
  expect(callsAfterSecond).toBe(1); // unchanged — cache was used

  querySpy.mockRestore();
});
