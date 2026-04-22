import pg from 'pg';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), override: false });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let client;
let testCustomerId;
let testCaseId;
let testRulesetId;
const EXT_REF = 'db_test_suite';

beforeAll(async () => {
  client = await pool.connect();

  const { rows: rsRows } = await client.query('SELECT id FROM ruleset LIMIT 1');
  testRulesetId = rsRows[0]?.id;

  const { rows: [cust] } = await client.query(
    `INSERT INTO customers (full_name, jurisdiction, external_ref)
     VALUES ('DB Test Customer', 'UK', $1)
     ON CONFLICT (external_ref) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`,
    [EXT_REF]
  );
  testCustomerId = cust.id;
});

afterAll(async () => {
  if (testCaseId) {
    await client.query('DELETE FROM deadlines WHERE case_id = $1', [testCaseId]).catch(() => {});
    await client.query('DELETE FROM cases WHERE id = $1', [testCaseId]).catch(() => {});
  }
  await client.query('DELETE FROM customers WHERE external_ref = $1', [EXT_REF]).catch(() => {});
  await client.query("DELETE FROM audit_log WHERE entity_type = 'db_test'").catch(() => {});
  client.release();
  await pool.end();
});

// ─── DB-001 ───────────────────────────────────────────────────────────────────

test('DB-001: all required tables exist in public schema', async () => {
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`
  );
  const tables = new Set(rows.map(r => r.table_name));
  const required = [
    'ai_actions', 'audit_log', 'cases', 'communications', 'customers',
    'deadlines', 'knowledge_chunks', 'knowledge_documents',
    'notifications', 'organisation_ai_config', 'regulatory_monitoring_log',
    'regulatory_sources', 'ruleset', 'tokeniser_additions',
  ];
  for (const t of required) {
    expect(tables.has(t)).toBe(true);
  }
});

// ─── DB-002 ───────────────────────────────────────────────────────────────────

test('DB-002: customers table has all required columns', async () => {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'customers'`
  );
  const cols = new Set(rows.map(r => r.column_name));
  const required = [
    'id', 'external_ref', 'full_name', 'email', 'phone',
    'jurisdiction', 'consent_status', 'vulnerable_flag',
    'created_at', 'updated_at',
  ];
  for (const c of required) {
    expect(cols.has(c)).toBe(true);
  }
});

// ─── DB-003 ───────────────────────────────────────────────────────────────────

test('DB-003: cases table has check constraint on status field', async () => {
  const { rows } = await client.query(
    `SELECT pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class t ON c.conrelid = t.oid
     WHERE t.relname = 'cases' AND c.contype = 'c'`
  );
  const statusDef = rows.map(r => r.def).find(d => d.includes('status'));
  expect(statusDef).toBeDefined();
  expect(statusDef).toContain('open');
  expect(statusDef).toContain('closed_upheld');
  expect(statusDef).toContain('closed_not_upheld');
});

// ─── DB-004 ───────────────────────────────────────────────────────────────────

test('DB-004: audit_log cannot be updated or deleted', async () => {
  const { rows: [row] } = await client.query(
    `INSERT INTO audit_log (entity_type, entity_id, action, actor_type, new_value)
     VALUES ('db_test', uuid_generate_v4(), 'test_insert', 'system', '{"test":true}')
     RETURNING id, action`
  );
  const id = row.id;

  // UPDATE rule silently does nothing
  await client.query(`UPDATE audit_log SET action = 'tampered' WHERE id = $1`, [id]);
  const { rows: [after] } = await client.query(
    'SELECT action FROM audit_log WHERE id = $1', [id]
  );
  expect(after.action).toBe('test_insert');

  // DELETE rule silently does nothing
  await client.query('DELETE FROM audit_log WHERE id = $1', [id]);
  const { rows: afterDel } = await client.query(
    'SELECT id FROM audit_log WHERE id = $1', [id]
  );
  expect(afterDel.length).toBe(1);
});

// ─── DB-005 ───────────────────────────────────────────────────────────────────

test('DB-005: case_ref auto-generates in NQ-YYYY-NNNN format', async () => {
  // Advance sequence past any case_refs already in the DB (demo seed inserts
  // explicit case_refs without calling nextval, so the sequence lags behind).
  await client.query(`
    SELECT setval('case_ref_seq', GREATEST(
      COALESCE((
        SELECT MAX(CAST(SPLIT_PART(case_ref, '-', 3) AS INTEGER))
        FROM cases WHERE case_ref ~ '^NQ-[0-9]{4}-[0-9]+$'
      ), 0),
      (SELECT last_value FROM case_ref_seq)
    ))
  `);

  const { rows: [kase] } = await client.query(
    `INSERT INTO cases (case_ref, customer_id, ruleset_id, status, notes)
     VALUES ('', $1, $2, 'open', 'db_test') RETURNING id, case_ref`,
    [testCustomerId, testRulesetId]
  );
  testCaseId = kase.id;
  expect(kase.case_ref).toMatch(/^NQ-\d{4}-\d{4,}$/);
});

// ─── DB-006 ───────────────────────────────────────────────────────────────────

test('DB-006: updated_at triggers fire on mutable tables', async () => {
  await client.query('SELECT pg_sleep(0.05)');

  const { rows: [upd] } = await client.query(
    `UPDATE customers SET full_name = 'DB Test Customer Updated'
     WHERE id = $1 RETURNING created_at, updated_at`,
    [testCustomerId]
  );

  expect(new Date(upd.updated_at).getTime())
    .toBeGreaterThan(new Date(upd.created_at).getTime());
});

// ─── DB-007 ───────────────────────────────────────────────────────────────────

test('DB-007: ruleset table is seeded with UK, India, and EU rules', async () => {
  const { rows } = await client.query(
    'SELECT DISTINCT jurisdiction FROM ruleset WHERE is_active = TRUE'
  );
  const jurisdictions = new Set(rows.map(r => r.jurisdiction));
  expect(jurisdictions.has('UK')).toBe(true);
  expect(jurisdictions.has('IN')).toBe(true);
  expect(jurisdictions.has('EU')).toBe(true);
});

// ─── DB-008 ───────────────────────────────────────────────────────────────────

test('DB-008: foreign key constraints enforced (cases.customer_id)', async () => {
  // Provide an explicit case_ref so the trigger doesn't call nextval —
  // that way the only possible error is the FK violation we're testing for.
  let err;
  try {
    await client.query(
      `INSERT INTO cases (case_ref, customer_id, ruleset_id, status)
       VALUES ('NQ-TEST-FK',
               '00000000-0000-0000-0000-000000000099',
               '00000000-0000-0000-0000-000000000099', 'open')`
    );
  } catch (e) {
    err = e;
  }
  expect(err).toBeDefined();
  expect(err.code).toBe('23503'); // foreign_key_violation
});
