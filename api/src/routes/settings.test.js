import { jest } from '@jest/globals';

const mockCreate = jest.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'OK' }],
});

jest.unstable_mockModule('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

let supertest, app, pool, token;

const TEST_ORG_ID  = '10000000-0000-0000-0000-000000000001';
const VALID_EMAIL    = 'admin@nuqe.io';
const VALID_PASSWORD = 'NuqeAdmin2026!';

beforeAll(async () => {
  ({ default: supertest } = await import('supertest'));
  ({ default: app }       = await import('../app.js'));
  ({ pool }               = await import('../db/pool.js'));

  const res = await supertest(app)
    .post('/api/v1/auth/login')
    .send({ email: VALID_EMAIL, password: VALID_PASSWORD });
  token = res.body.accessToken;

  // Ensure clean state
  await pool.query(
    `DELETE FROM organisation_ai_config WHERE organisation_id = $1`,
    [TEST_ORG_ID]
  );
}, 15_000);

afterAll(async () => {
  await pool.query(
    `DELETE FROM audit_log WHERE entity_type = 'organisation_ai_config'`
  );
  await pool.query(
    `DELETE FROM organisation_ai_config WHERE organisation_id = $1`,
    [TEST_ORG_ID]
  );
});

// ─── SET-001 ──────────────────────────────────────────────────────────────────

test('SET-001: GET /settings/ai-config returns 200 with required fields', async () => {
  const res = await supertest(app)
    .get('/api/v1/settings/ai-config')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('primary_provider');
  expect(res.body).toHaveProperty('primary_model');
  expect(res.body).toHaveProperty('primary_api_key_encrypted');
  expect(res.body).toHaveProperty('data_agreement_tier');
});

// ─── SET-003 ──────────────────────────────────────────────────────────────────

test('SET-003: Returns default empty config when no row exists', async () => {
  // Table is empty from beforeAll cleanup
  const res = await supertest(app)
    .get('/api/v1/settings/ai-config')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(res.body.primary_provider).toBeNull();
  expect(res.body.primary_api_key_encrypted).toBeNull();
  expect(res.body.challenger_percentage).toBe(0);
  expect(res.body.tokenisation_enabled).toBe(true);
  expect(res.body.data_agreement_tier).toBe('standard');
});

// ─── SET-004 ──────────────────────────────────────────────────────────────────

test('SET-004: POST /settings/ai-config saves and encrypts key', async () => {
  const res = await supertest(app)
    .post('/api/v1/settings/ai-config')
    .set('Authorization', `Bearer ${token}`)
    .send({
      primary_provider:    'claude',
      primary_model:       'claude-sonnet-4-6',
      primary_api_key:     'sk-test-key-abcd',
      data_agreement_tier: 'standard',
    });

  expect(res.status).toBe(200);
  expect(res.body.primary_provider).toBe('claude');
  expect(res.body.primary_model).toBe('claude-sonnet-4-6');
  // Key must be masked — not the plaintext
  expect(res.body.primary_api_key_encrypted).not.toBe('sk-test-key-abcd');
  expect(res.body.primary_api_key_encrypted).toMatch(/^\*\*\*\*.+/);

  // Verify the DB has an encrypted (non-plaintext) value
  const { rows } = await pool.query(
    `SELECT primary_api_key_encrypted FROM organisation_ai_config WHERE organisation_id = $1`,
    [TEST_ORG_ID]
  );
  expect(rows.length).toBe(1);
  expect(rows[0].primary_api_key_encrypted).not.toBe('sk-test-key-abcd');
  expect(rows[0].primary_api_key_encrypted.length).toBeGreaterThan(10);
});

// ─── SET-002 ──────────────────────────────────────────────────────────────────

test('SET-002: GET /settings/ai-config masks API key as ****XXXX', async () => {
  // Row was created in SET-004 above
  const res = await supertest(app)
    .get('/api/v1/settings/ai-config')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  const key = res.body.primary_api_key_encrypted;
  expect(key).not.toBeNull();
  // Must start with **** and show exactly 4 trailing chars
  expect(key).toMatch(/^\*{4}.{4}$/);
  // Must not contain the plaintext key
  expect(key).not.toContain('sk-test-key-abcd');
});

// ─── SET-005 ──────────────────────────────────────────────────────────────────

test('SET-005: POST /settings/ai-config writes to audit_log', async () => {
  const { rows } = await pool.query(
    `SELECT new_value FROM audit_log
     WHERE entity_type='organisation_ai_config' AND action='settings_updated'
     ORDER BY ts DESC LIMIT 1`
  );
  expect(rows.length).toBe(1);
  const val = typeof rows[0].new_value === 'string'
    ? JSON.parse(rows[0].new_value)
    : rows[0].new_value;
  expect(val.primary_provider).toBe('claude');
  expect(val.primary_model).toBe('claude-sonnet-4-6');
});

// ─── SET-006 ──────────────────────────────────────────────────────────────────

test('SET-006: POST /settings/ai-config/test returns response_time_ms on success', async () => {
  mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'OK' }] });

  const res = await supertest(app)
    .post('/api/v1/settings/ai-config/test')
    .set('Authorization', `Bearer ${token}`)
    .send({
      provider: 'claude',
      model:    'claude-haiku-4-5-20251001',
      api_key:  'sk-test-valid-key',
    });

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(typeof res.body.response_time_ms).toBe('number');
  expect(res.body.response_time_ms).toBeGreaterThanOrEqual(0);
  expect(res.body.provider).toBe('claude');
});

// ─── SET-007 ──────────────────────────────────────────────────────────────────

test('SET-007: POST /settings/ai-config/test returns error on bad credentials', async () => {
  mockCreate.mockRejectedValueOnce(new Error('401 Unauthorized: invalid api key'));

  const res = await supertest(app)
    .post('/api/v1/settings/ai-config/test')
    .set('Authorization', `Bearer ${token}`)
    .send({
      provider: 'claude',
      model:    'claude-haiku-4-5-20251001',
      api_key:  'sk-bad-key',
    });

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(false);
  expect(typeof res.body.response_time_ms).toBe('number');
  expect(res.body.error).toContain('401');
});
