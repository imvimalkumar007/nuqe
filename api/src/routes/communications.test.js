import request from 'supertest';
import app from '../app.js';
import { pool } from '../db/pool.js';

const VALID_EMAIL    = 'admin@nuqe.io';
const VALID_PASSWORD = 'NuqeAdmin2026!';

let token;
let case1Id;  // NQ-2026-0001 — has 5 comms including pending AI draft + approved AI draft
let case2Id;  // NQ-2026-0002 — has chat channel comms
let case3Id;  // NQ-2026-0003 — has postal channel comms
let createdCommId;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: VALID_EMAIL, password: VALID_PASSWORD });
  token = res.body.accessToken;

  const { rows } = await pool.query(
    `SELECT id, case_ref FROM cases WHERE case_ref IN ('NQ-2026-0001','NQ-2026-0002','NQ-2026-0003') ORDER BY case_ref`
  );
  case1Id = rows.find((r) => r.case_ref === 'NQ-2026-0001')?.id;
  case2Id = rows.find((r) => r.case_ref === 'NQ-2026-0002')?.id;
  case3Id = rows.find((r) => r.case_ref === 'NQ-2026-0003')?.id;
});

afterAll(async () => {
  if (createdCommId) {
    await pool.query('DELETE FROM communications WHERE id = $1', [createdCommId]);
  }
});

// ─── COMMS-001 ────────────────────────────────────────────────────────────────

test('COMMS-001: GET /communications?case_id returns communications ordered by sent_at', async () => {
  const res = await request(app)
    .get(`/api/v1/communications?case_id=${case1Id}`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.communications)).toBe(true);
  expect(res.body.communications.length).toBeGreaterThan(0);
  expect(typeof res.body.total).toBe('number');

  // Rows with sent_at should be in ascending order; nulls are last
  const withDate = res.body.communications.filter((c) => c.sent_at !== null);
  for (let i = 1; i < withDate.length; i++) {
    expect(new Date(withDate[i].sent_at).getTime()).toBeGreaterThanOrEqual(
      new Date(withDate[i - 1].sent_at).getTime()
    );
  }
});

// ─── COMMS-002 ────────────────────────────────────────────────────────────────

test('COMMS-002: GET /communications includes ai_generated and ai_approved_at fields', async () => {
  const res = await request(app)
    .get(`/api/v1/communications?case_id=${case1Id}`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(res.body.communications.length).toBeGreaterThan(0);

  const comm = res.body.communications[0];
  expect('ai_generated' in comm).toBe(true);
  expect('ai_approved_at' in comm).toBe(true);
  expect('ai_approved_by' in comm).toBe(true);
});

// ─── COMMS-003 ────────────────────────────────────────────────────────────────

test('COMMS-003: GET /communications includes author_type field', async () => {
  const res = await request(app)
    .get(`/api/v1/communications?case_id=${case1Id}`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  const comm = res.body.communications[0];
  expect('author_type' in comm).toBe(true);
  expect(comm.author_type).not.toBeNull();
});

// ─── COMMS-004 ────────────────────────────────────────────────────────────────

test('COMMS-004: POST /communications creates inbound communication and links to case', async () => {
  const res = await request(app)
    .post('/api/v1/communications')
    .set('Authorization', `Bearer ${token}`)
    .send({
      case_id:     case1Id,
      channel:     'email',
      direction:   'inbound',
      subject:     'COMMS-004 test message',
      body:        'Test body for COMMS-004.',
      author_type: 'customer',
    });

  expect(res.status).toBe(201);
  expect(res.body.id).toBeDefined();
  expect(res.body.case_id).toBe(case1Id);
  expect(res.body.channel).toBe('email');
  expect(res.body.direction).toBe('inbound');
  expect(res.body.author_type).toBe('customer');
  createdCommId = res.body.id;
});

// ─── COMMS-005 ────────────────────────────────────────────────────────────────

test('COMMS-005: AI draft communication with ai_approved_at null renders as pending', async () => {
  const res = await request(app)
    .get(`/api/v1/communications?case_id=${case1Id}`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  const pending = res.body.communications.find(
    (c) => c.ai_generated === true && c.ai_approved_at === null
  );
  expect(pending).toBeDefined();
  // A pending AI draft has no sent_at (sits at end of timeline)
  expect(pending.sent_at).toBeNull();
});

// ─── COMMS-006 ────────────────────────────────────────────────────────────────

test('COMMS-006: Approved AI draft has ai_approved_by set', async () => {
  const res = await request(app)
    .get(`/api/v1/communications?case_id=${case1Id}`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  const approved = res.body.communications.find(
    (c) => c.ai_generated === true && c.ai_approved_at !== null
  );
  expect(approved).toBeDefined();
  expect(approved.ai_approved_by).not.toBeNull();
});

// ─── COMMS-007 ────────────────────────────────────────────────────────────────

test('COMMS-007: GET /communications returns empty array for case with no comms', async () => {
  // Use a well-formed UUID that matches no real case
  const ghostId = '00000000-0000-0000-0000-000000000001';
  const res = await request(app)
    .get(`/api/v1/communications?case_id=${ghostId}`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.communications)).toBe(true);
  expect(res.body.communications.length).toBe(0);
  expect(res.body.total).toBe(0);
});

// ─── COMMS-008 ────────────────────────────────────────────────────────────────

test('COMMS-008: Communications from all three channels appear in unified timeline', async () => {
  const [r1, r2, r3] = await Promise.all([
    request(app).get(`/api/v1/communications?case_id=${case1Id}`).set('Authorization', `Bearer ${token}`),
    request(app).get(`/api/v1/communications?case_id=${case2Id}`).set('Authorization', `Bearer ${token}`),
    request(app).get(`/api/v1/communications?case_id=${case3Id}`).set('Authorization', `Bearer ${token}`),
  ]);

  expect(r1.status).toBe(200);
  expect(r2.status).toBe(200);
  expect(r3.status).toBe(200);

  const channels = new Set([
    ...r1.body.communications.map((c) => c.channel),
    ...r2.body.communications.map((c) => c.channel),
    ...r3.body.communications.map((c) => c.channel),
  ]);

  expect(channels.has('email')).toBe(true);
  expect(channels.has('chat')).toBe(true);
  expect(channels.has('postal')).toBe(true);
});
