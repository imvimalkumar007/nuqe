import request from 'supertest';
import app from '../app.js';
import { pool } from '../db/pool.js';
import { calculateDeadlines } from '../engines/deadlineEngine.js';

const VALID_EMAIL    = 'admin@nuqe.io';
const VALID_PASSWORD = 'NuqeAdmin2026!';

let token;
let case1Id;   // NQ-2026-0001 — under_review, FINAL_RESPONSE within 48h
let case4Id;   // NQ-2026-0004 — fos_referred, James Whitfield, no deadlines

beforeAll(async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: VALID_EMAIL, password: VALID_PASSWORD });
  token = res.body.accessToken;

  const { rows } = await pool.query(
    `SELECT id, case_ref FROM cases WHERE case_ref IN ('NQ-2026-0001','NQ-2026-0004') ORDER BY case_ref`
  );
  case1Id = rows.find((r) => r.case_ref === 'NQ-2026-0001')?.id;
  case4Id = rows.find((r) => r.case_ref === 'NQ-2026-0004')?.id;
});

// ─── DEAD-001 ────────────────────────────────────────────────────────────────

test('DEAD-001: GET /deadlines?case_id returns all deadlines for the case', async () => {
  const res = await request(app)
    .get(`/api/v1/deadlines?case_id=${case1Id}`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.deadlines)).toBe(true);
  expect(res.body.deadlines.length).toBeGreaterThan(0);
});

// ─── DEAD-002 ────────────────────────────────────────────────────────────────

test('DEAD-002: Deadline rows include all required fields', async () => {
  const res = await request(app)
    .get(`/api/v1/deadlines?case_id=${case1Id}`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  const d = res.body.deadlines[0];
  expect(d.id).toBeDefined();
  expect(d.case_id).toBeDefined();
  expect(d.ruleset_id).toBeDefined();
  expect(d.deadline_type).toBeDefined();
  expect(d.due_at).toBeDefined();
  expect('alerted_at_5d'  in d).toBe(true);
  expect('alerted_at_48h' in d).toBe(true);
  expect('alerted_at_24h' in d).toBe(true);
  expect('met_at'         in d).toBe(true);
  expect('breached'       in d).toBe(true);
  expect('breached_at'    in d).toBe(true);
});

// ─── DEAD-003 ────────────────────────────────────────────────────────────────

test('DEAD-003: UK case has three deadline rows (ACKNOWLEDGE, FINAL_RESPONSE, FOS_REFERRAL)', async () => {
  const res = await request(app)
    .get(`/api/v1/deadlines?case_id=${case1Id}`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(res.body.deadlines.length).toBe(3);

  const types = res.body.deadlines.map((d) => d.deadline_type);
  expect(types).toContain('ACKNOWLEDGE');
  expect(types).toContain('FINAL_RESPONSE');
  expect(types).toContain('FOS_REFERRAL');
});

// ─── DEAD-004 ────────────────────────────────────────────────────────────────

test('DEAD-004: Breach risk case has FINAL_RESPONSE due_at within 48 hours of now', async () => {
  const res = await request(app)
    .get(`/api/v1/deadlines?case_id=${case1Id}`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  const finalResponse = res.body.deadlines.find((d) => d.deadline_type === 'FINAL_RESPONSE');
  expect(finalResponse).toBeDefined();

  const dueAt = new Date(finalResponse.due_at).getTime();
  const now   = Date.now();
  const hoursUntilDue = (dueAt - now) / (1000 * 60 * 60);

  expect(hoursUntilDue).toBeLessThanOrEqual(48);
  expect(finalResponse.met_at).toBeNull();
  expect(finalResponse.breached).toBe(false);
});

// ─── DEAD-005 ────────────────────────────────────────────────────────────────

test('DEAD-005: FOS referred case (James Whitfield) has no pending deadlines', async () => {
  const res = await request(app)
    .get(`/api/v1/deadlines?case_id=${case4Id}`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  // NQ-2026-0004 was seeded without deadlines — case was referred before DISP clock started
  const pending = res.body.deadlines.filter((d) => d.met_at === null && d.breached === false);
  expect(pending.length).toBe(0);
});

// ─── DEAD-006 ────────────────────────────────────────────────────────────────

test('DEAD-006: GET /deadlines without case_id returns 400', async () => {
  const res = await request(app)
    .get('/api/v1/deadlines')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(400);
  expect(res.body.error).toBeDefined();
});

// ─── DEAD-007 ────────────────────────────────────────────────────────────────

test('DEAD-007: calculateDeadlines does not create duplicate rows if called twice', async () => {
  const before = await pool.query(
    'SELECT COUNT(*)::int AS cnt FROM deadlines WHERE case_id = $1',
    [case1Id]
  );
  const countBefore = before.rows[0].cnt;

  await calculateDeadlines(case1Id);

  const after = await pool.query(
    'SELECT COUNT(*)::int AS cnt FROM deadlines WHERE case_id = $1',
    [case1Id]
  );
  expect(after.rows[0].cnt).toBe(countBefore);
});
