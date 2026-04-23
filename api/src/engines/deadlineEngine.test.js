import { pool } from '../db/pool.js';
import { calculateDeadlines, checkDeadlines } from './deadlineEngine.js';

let testCaseId;
let ukRulesetRows;
let customerId;
let testDeadlineIds = [];

beforeAll(async () => {
  // Advance sequence past any existing demo cases
  await pool.query(`
    SELECT setval('case_ref_seq',
      GREATEST(
        (SELECT COALESCE(MAX(CAST(SPLIT_PART(case_ref, '-', 3) AS INTEGER)), 0) FROM cases),
        (SELECT last_value FROM case_ref_seq)
      )
    )
  `);

  const { rows: customers } = await pool.query('SELECT id FROM customers LIMIT 1');
  customerId = customers[0].id;

  const { rows: rulesets } = await pool.query(
    `SELECT id, rule_type, threshold_days, threshold_business_days
     FROM ruleset WHERE jurisdiction = 'UK' AND is_active = TRUE ORDER BY rule_type`
  );
  ukRulesetRows = rulesets;

  // Create a test case with a known opened_at so we can verify due_at maths
  const openedAt = new Date('2026-01-01T09:00:00Z');
  const { rows } = await pool.query(
    `INSERT INTO cases (customer_id, ruleset_id, category, channel_received, opened_at, notes)
     VALUES ($1, $2, 'fee_dispute', 'email', $3, 'DENG test case')
     RETURNING id`,
    [customerId, rulesets[0].id, openedAt]
  );
  testCaseId = rows[0].id;
});

afterAll(async () => {
  if (testDeadlineIds.length) {
    await pool.query('DELETE FROM deadlines WHERE id = ANY($1)', [testDeadlineIds]);
  }
  if (testCaseId) {
    await pool.query('DELETE FROM deadlines WHERE case_id = $1', [testCaseId]);
    await pool.query('DELETE FROM cases WHERE id = $1', [testCaseId]);
  }
  await pool.query(
    `DELETE FROM audit_log WHERE entity_type = 'deadline' AND entity_id::text LIKE '00000000-dead%'`
  );
});

// ─── DENG-001 ────────────────────────────────────────────────────────────────

test('DENG-001: calculateDeadlines creates 3 rows for a UK case', async () => {
  const inserted = await calculateDeadlines(testCaseId);
  expect(inserted).toBe(3);

  const { rows } = await pool.query(
    'SELECT deadline_type FROM deadlines WHERE case_id = $1 ORDER BY deadline_type',
    [testCaseId]
  );
  expect(rows.length).toBe(3);
  const types = rows.map((r) => r.deadline_type);
  expect(types).toContain('ACKNOWLEDGE');
  expect(types).toContain('FINAL_RESPONSE');
  expect(types).toContain('FOS_REFERRAL');
});

// ─── DENG-002 ────────────────────────────────────────────────────────────────

test('DENG-002: due_at = opened_at + threshold_days for each rule', async () => {
  const { rows: deadlines } = await pool.query(
    `SELECT d.deadline_type, d.due_at, c.opened_at
     FROM deadlines d JOIN cases c ON c.id = d.case_id
     WHERE d.case_id = $1`,
    [testCaseId]
  );
  expect(deadlines.length).toBe(3);

  for (const d of deadlines) {
    const rule = ukRulesetRows.find((r) => r.rule_type === d.deadline_type);
    expect(rule).toBeDefined();

    const expectedDue = new Date(d.opened_at);
    expectedDue.setDate(expectedDue.getDate() + rule.threshold_days);
    const actualDue   = new Date(d.due_at);

    // Compare date-only part (engine sets time from opened_at, not midnight)
    expect(actualDue.toISOString().slice(0, 10)).toBe(expectedDue.toISOString().slice(0, 10));
  }
});

// ─── DENG-003 ────────────────────────────────────────────────────────────────

test('DENG-003: checkDeadlines sets alerted_at_48h when deadline is within 48 hours', async () => {
  const rulesetId = ukRulesetRows[0].id;
  // due_at = 30 hours from now — inside 48h window, outside 24h
  const dueAt = new Date(Date.now() + 30 * 60 * 60 * 1000);

  const { rows } = await pool.query(
    `INSERT INTO deadlines (case_id, ruleset_id, deadline_type, due_at, alerted_at_48h, met_at, breached)
     VALUES ($1, $2, 'TEST_48H', $3, NULL, NULL, FALSE)
     RETURNING id`,
    [testCaseId, rulesetId, dueAt]
  );
  const deadlineId = rows[0].id;
  testDeadlineIds.push(deadlineId);

  await checkDeadlines();

  const { rows: updated } = await pool.query(
    'SELECT alerted_at_48h, alerted_at_24h FROM deadlines WHERE id = $1',
    [deadlineId]
  );
  expect(updated[0].alerted_at_48h).not.toBeNull();
  expect(updated[0].alerted_at_24h).toBeNull();
});

// ─── DENG-004 ────────────────────────────────────────────────────────────────

test('DENG-004: checkDeadlines sets alerted_at_24h when deadline is within 24 hours', async () => {
  const rulesetId = ukRulesetRows[0].id;
  // due_at = 12 hours from now — inside both 48h and 24h windows
  const dueAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

  const { rows } = await pool.query(
    `INSERT INTO deadlines (case_id, ruleset_id, deadline_type, due_at, alerted_at_48h, alerted_at_24h, met_at, breached)
     VALUES ($1, $2, 'TEST_24H', $3, NULL, NULL, NULL, FALSE)
     RETURNING id`,
    [testCaseId, rulesetId, dueAt]
  );
  const deadlineId = rows[0].id;
  testDeadlineIds.push(deadlineId);

  await checkDeadlines();

  const { rows: updated } = await pool.query(
    'SELECT alerted_at_48h, alerted_at_24h FROM deadlines WHERE id = $1',
    [deadlineId]
  );
  expect(updated[0].alerted_at_48h).not.toBeNull();
  expect(updated[0].alerted_at_24h).not.toBeNull();
});

// ─── DENG-005 ────────────────────────────────────────────────────────────────

test('DENG-005: checkDeadlines sets breached=true when due_at has passed with no met_at', async () => {
  const rulesetId = ukRulesetRows[0].id;
  // due_at = 2 hours in the past
  const dueAt = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const { rows } = await pool.query(
    `INSERT INTO deadlines (case_id, ruleset_id, deadline_type, due_at, met_at, breached)
     VALUES ($1, $2, 'TEST_BREACH', $3, NULL, FALSE)
     RETURNING id`,
    [testCaseId, rulesetId, dueAt]
  );
  const deadlineId = rows[0].id;
  testDeadlineIds.push(deadlineId);

  await checkDeadlines();

  const { rows: updated } = await pool.query(
    'SELECT breached, breached_at FROM deadlines WHERE id = $1',
    [deadlineId]
  );
  expect(updated[0].breached).toBe(true);
  expect(updated[0].breached_at).not.toBeNull();
});

// ─── DENG-006 ────────────────────────────────────────────────────────────────

test('DENG-006: checkDeadlines writes to audit_log on state change', async () => {
  // The overdue deadline from DENG-005 should have a breach audit entry.
  // Look for any recent deadline_breached audit entry for our test case.
  const { rows } = await pool.query(
    `SELECT action, new_value FROM audit_log
     WHERE entity_type = 'deadline'
       AND action = 'deadline_breached'
       AND ts > NOW() - INTERVAL '1 minute'
     ORDER BY ts DESC
     LIMIT 10`
  );
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0].action).toBe('deadline_breached');
});

// ─── DENG-007 ────────────────────────────────────────────────────────────────

test('DENG-007: checkDeadlines does not re-alert already-alerted deadlines', async () => {
  const rulesetId = ukRulesetRows[0].id;
  const dueAt = new Date(Date.now() + 30 * 60 * 60 * 1000);
  const alreadyAlertedAt = new Date();

  const { rows } = await pool.query(
    `INSERT INTO deadlines (case_id, ruleset_id, deadline_type, due_at, alerted_at_48h, met_at, breached)
     VALUES ($1, $2, 'TEST_REALERT', $3, $4, NULL, FALSE)
     RETURNING id`,
    [testCaseId, rulesetId, dueAt, alreadyAlertedAt]
  );
  const deadlineId = rows[0].id;
  testDeadlineIds.push(deadlineId);

  // Count audit entries before
  const { rows: auditBefore } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM audit_log
     WHERE entity_id = $1 AND action = 'deadline_alert_48h'`,
    [deadlineId]
  );

  await checkDeadlines();

  // Count audit entries after — must be unchanged (no new re-alert)
  const { rows: auditAfter } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM audit_log
     WHERE entity_id = $1 AND action = 'deadline_alert_48h'`,
    [deadlineId]
  );
  expect(auditAfter[0].cnt).toBe(auditBefore[0].cnt);
});

// ─── DENG-008 ────────────────────────────────────────────────────────────────

test('DENG-008: calculateDeadlines is idempotent when called twice', async () => {
  const before = await pool.query(
    'SELECT COUNT(*)::int AS cnt FROM deadlines WHERE case_id = $1 AND deadline_type IN (\'ACKNOWLEDGE\',\'FINAL_RESPONSE\',\'FOS_REFERRAL\')',
    [testCaseId]
  );

  const secondInserted = await calculateDeadlines(testCaseId);
  expect(secondInserted).toBe(0);

  const after = await pool.query(
    'SELECT COUNT(*)::int AS cnt FROM deadlines WHERE case_id = $1 AND deadline_type IN (\'ACKNOWLEDGE\',\'FINAL_RESPONSE\',\'FOS_REFERRAL\')',
    [testCaseId]
  );
  expect(after.rows[0].cnt).toBe(before.rows[0].cnt);
});
