import request from 'supertest';
import app from '../app.js';
import { pool } from '../db/pool.js';

const VALID_EMAIL    = 'admin@nuqe.io';
const VALID_PASSWORD = 'NuqeAdmin2026!';

let token;
let testCaseId;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: VALID_EMAIL, password: VALID_PASSWORD });
  token = res.body.accessToken;

  // Advance case_ref_seq past any explicitly-inserted demo cases so POST /cases
  // doesn't collide (same fix as DB-005).
  await pool.query(`
    SELECT setval('case_ref_seq',
      GREATEST(
        (SELECT COALESCE(MAX(CAST(SPLIT_PART(case_ref, '-', 3) AS INTEGER)), 0) FROM cases),
        (SELECT last_value FROM case_ref_seq)
      )
    )
  `);
});

afterAll(async () => {
  if (testCaseId) {
    await pool.query('DELETE FROM deadlines WHERE case_id = $1', [testCaseId]);
    await pool.query('DELETE FROM cases WHERE id = $1', [testCaseId]);
  }
});

// ─── CASES-001 ────────────────────────────────────────────────────────────────

test('CASES-001: GET /cases returns 200 with cases array and total count', async () => {
  const res = await request(app)
    .get('/api/v1/cases')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.cases)).toBe(true);
  expect(typeof res.body.total).toBe('number');
  expect(res.body.cases.length).toBeGreaterThanOrEqual(8);
  expect(res.body.total).toBeGreaterThanOrEqual(8);
});

// ─── CASES-002 ────────────────────────────────────────────────────────────────

test('CASES-002: GET /cases?status=open returns only open cases', async () => {
  const res = await request(app)
    .get('/api/v1/cases?status=open')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(res.body.cases.length).toBe(3);
  expect(res.body.cases.every((c) => c.status === 'open')).toBe(true);
});

// ─── CASES-003 ────────────────────────────────────────────────────────────────

test('CASES-003: GET /cases/:id returns case with customer_name joined', async () => {
  const listRes = await request(app)
    .get('/api/v1/cases')
    .set('Authorization', `Bearer ${token}`);

  const caseId = listRes.body.cases[0].id;

  const res = await request(app)
    .get(`/api/v1/cases/${caseId}`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(typeof res.body.customer_name).toBe('string');
  expect(res.body.customer_name.length).toBeGreaterThan(0);
  expect(Array.isArray(res.body.deadlines)).toBe(true);
  expect(typeof res.body.communication_count).toBe('number');
});

// ─── CASES-004 ────────────────────────────────────────────────────────────────

test('CASES-004: GET /cases/:id returns 404 for unknown id', async () => {
  const res = await request(app)
    .get('/api/v1/cases/00000000-0000-0000-0000-000000000000')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(404);
});

// ─── CASES-005 ────────────────────────────────────────────────────────────────

test('CASES-005: GET /metrics/dashboard-summary returns 200 with correct shape', async () => {
  const res = await request(app)
    .get('/api/v1/metrics/dashboard-summary')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(typeof res.body.breach_risk_count).toBe('number');
  expect(typeof res.body.under_review_count).toBe('number');
  expect(typeof res.body.open_count).toBe('number');
  expect(typeof res.body.fos_referred_count).toBe('number');
});

// ─── CASES-006 ────────────────────────────────────────────────────────────────

test('CASES-006: breach_risk_count >= 1 with seed data (Sarah Okonkwo within 48h)', async () => {
  const res = await request(app)
    .get('/api/v1/metrics/dashboard-summary')
    .set('Authorization', `Bearer ${token}`);

  expect(res.body.breach_risk_count).toBeGreaterThanOrEqual(1);
});

// ─── CASES-007 ────────────────────────────────────────────────────────────────

test('CASES-007: under_review_count = 3 with seed data', async () => {
  const res = await request(app)
    .get('/api/v1/metrics/dashboard-summary')
    .set('Authorization', `Bearer ${token}`);

  expect(res.body.under_review_count).toBe(3);
});

// ─── CASES-008 ────────────────────────────────────────────────────────────────

test('CASES-008: open_count = 3 with seed data', async () => {
  const res = await request(app)
    .get('/api/v1/metrics/dashboard-summary')
    .set('Authorization', `Bearer ${token}`);

  expect(res.body.open_count).toBe(3);
});

// ─── CASES-009 ────────────────────────────────────────────────────────────────

test('CASES-009: fos_referred_count = 1 with seed data', async () => {
  const res = await request(app)
    .get('/api/v1/metrics/dashboard-summary')
    .set('Authorization', `Bearer ${token}`);

  expect(res.body.fos_referred_count).toBe(1);
});

// ─── CASES-010 ────────────────────────────────────────────────────────────────

test('CASES-010: POST /cases creates case and triggers calculateDeadlines', async () => {
  const { rows: customers } = await pool.query('SELECT id FROM customers LIMIT 1');
  const { rows: rulesets }  = await pool.query("SELECT id FROM ruleset WHERE jurisdiction = 'UK' LIMIT 1");

  const res = await request(app)
    .post('/api/v1/cases')
    .set('Authorization', `Bearer ${token}`)
    .send({
      customer_id:      customers[0].id,
      category:         'fee_dispute',
      channel_received: 'email',
      ruleset_id:       rulesets[0].id,
      notes:            'CASES-010 test case',
    });

  expect(res.status).toBe(201);
  expect(res.body.id).toBeDefined();
  testCaseId = res.body.id;

  const { rows: deadlines } = await pool.query(
    'SELECT * FROM deadlines WHERE case_id = $1',
    [testCaseId]
  );
  expect(deadlines.length).toBeGreaterThan(0);
});
