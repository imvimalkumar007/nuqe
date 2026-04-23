import { jest } from '@jest/globals';

// Must be called before any dynamic import of the mocked module
jest.unstable_mockModule('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          summary: 'Mock impact summary for test.',
          affected_deadline_types: ['FINAL_RESPONSE'],
          risk_level: 'medium',
          recommended_action: 'Re-calculate deadlines before activating.',
        }),
      },
    ],
  });
  return {
    default: jest.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

// All module imports must be dynamic when jest.unstable_mockModule is used
let pool, getActiveRuleset, assessRulesetImpact, invalidateRulesetCache, getRedisClient;

let testRulesetIds = [];
let testAiActionIds = [];

beforeAll(async () => {
  ({ pool }               = await import('../db/pool.js'));
  ({ getRedisClient }     = await import('../db/redis.js'));
  ({ getActiveRuleset, assessRulesetImpact, invalidateRulesetCache } =
    await import('./complianceEngine.js'));

  // Clear any cached values from previous runs
  const redis = getRedisClient();
  await redis.del('ruleset:active:UK', 'ruleset:active:IN', 'ruleset:active:EU').catch(() => {});

  // Insert staging ruleset rows for COMP-006 — UK-FCA-TEST-v2 with FINAL_RESPONSE shortened
  const { rows } = await pool.query(
    `INSERT INTO ruleset
       (jurisdiction, version, rule_type, threshold_days, threshold_business_days, is_active, effective_from, notes)
     VALUES
       ('UK','UK-FCA-TEST-v2','ACKNOWLEDGE',3,false,false,'2024-01-01','COMP-006 test'),
       ('UK','UK-FCA-TEST-v2','FINAL_RESPONSE',50,false,false,'2024-01-01','COMP-006 test'),
       ('UK','UK-FCA-TEST-v2','FOS_REFERRAL',50,false,false,'2024-01-01','COMP-006 test')
     RETURNING id`
  );
  testRulesetIds = rows.map((r) => r.id);
});

afterAll(async () => {
  const redis = getRedisClient();
  await redis.del('ruleset:active:UK', 'ruleset:active:IN', 'ruleset:active:EU').catch(() => {});
  await redis.quit().catch(() => {});

  if (testAiActionIds.length) {
    await pool.query('DELETE FROM ai_actions WHERE id = ANY($1)', [testAiActionIds]);
  }
  if (testRulesetIds.length) {
    await pool.query('DELETE FROM ruleset WHERE id = ANY($1)', [testRulesetIds]);
  }
});

// ─── COMP-001 ────────────────────────────────────────────────────────────────

test('COMP-001: getActiveRuleset returns correct rows for UK', async () => {
  const rules = await getActiveRuleset('UK');
  expect(Array.isArray(rules)).toBe(true);
  expect(rules.length).toBe(3);
  const types = rules.map((r) => r.rule_type);
  expect(types).toContain('ACKNOWLEDGE');
  expect(types).toContain('FINAL_RESPONSE');
  expect(types).toContain('FOS_REFERRAL');
  expect(rules.every((r) => r.jurisdiction === 'UK')).toBe(true);
  expect(rules.every((r) => r.is_active === true)).toBe(true);
});

// ─── COMP-002 ────────────────────────────────────────────────────────────────

test('COMP-002: getActiveRuleset returns correct rows for India', async () => {
  const rules = await getActiveRuleset('IN');
  expect(Array.isArray(rules)).toBe(true);
  expect(rules.length).toBe(3);
  const types = rules.map((r) => r.rule_type);
  expect(types).toContain('ACKNOWLEDGE');
  expect(types).toContain('FINAL_RESPONSE');
  expect(types).toContain('OMBUDSMAN_REFERRAL');
  expect(rules.every((r) => r.jurisdiction === 'IN')).toBe(true);
});

// ─── COMP-003 ────────────────────────────────────────────────────────────────

test('COMP-003: getActiveRuleset returns correct rows for EU', async () => {
  const rules = await getActiveRuleset('EU');
  expect(Array.isArray(rules)).toBe(true);
  expect(rules.length).toBe(4);
  const types = rules.map((r) => r.rule_type);
  expect(types).toContain('ACKNOWLEDGE');
  expect(types).toContain('FINAL_RESPONSE');
  expect(types).toContain('ADR_REFERRAL');
  expect(rules.every((r) => r.jurisdiction === 'EU')).toBe(true);
});

// ─── COMP-004 ────────────────────────────────────────────────────────────────

test('COMP-004: getActiveRuleset result is cached in Redis', async () => {
  const redis = getRedisClient();

  // Ensure no cached value
  await redis.del('ruleset:active:UK');

  // First call — DB hit, stores in cache
  const firstCall = await getActiveRuleset('UK');
  expect(firstCall.length).toBe(3);

  // Redis key should now exist
  const cached = await redis.get('ruleset:active:UK');
  expect(cached).not.toBeNull();

  const parsed = JSON.parse(cached);
  expect(parsed.length).toBe(3);
  expect(parsed[0].jurisdiction).toBe('UK');
});

// ─── COMP-005 ────────────────────────────────────────────────────────────────

test('COMP-005: cache is invalidated when invalidateRulesetCache is called', async () => {
  const redis = getRedisClient();

  // Ensure there's something in the cache
  await getActiveRuleset('UK');
  const before = await redis.get('ruleset:active:UK');
  expect(before).not.toBeNull();

  // Invalidate
  await invalidateRulesetCache('UK');

  // Key should be gone
  const after = await redis.get('ruleset:active:UK');
  expect(after).toBeNull();
});

// ─── COMP-006 ────────────────────────────────────────────────────────────────

test('COMP-006: assessRulesetImpact creates pending ai_action per open affected case', async () => {
  const result = await assessRulesetImpact('UK-FCA-TEST-v2', 'UK');

  expect(result.affectedCases).toBeGreaterThan(0);
  expect(result.assessments.length).toBeGreaterThan(0);

  // Verify ai_actions were created with status 'pending'
  const aiActionIds = result.assessments
    .filter((a) => a.ai_action_id)
    .map((a) => a.ai_action_id);
  expect(aiActionIds.length).toBeGreaterThan(0);
  testAiActionIds.push(...aiActionIds);

  const { rows } = await pool.query(
    'SELECT status, action_type FROM ai_actions WHERE id = ANY($1)',
    [aiActionIds]
  );
  expect(rows.length).toBe(aiActionIds.length);
  expect(rows.every((r) => r.status === 'pending')).toBe(true);
  expect(rows.every((r) => r.action_type === 'ruleset_impact_assessment')).toBe(true);
});
