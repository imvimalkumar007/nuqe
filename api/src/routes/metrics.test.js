import request from 'supertest';
import app from '../app.js';

const VALID_EMAIL    = 'admin@nuqe.io';
const VALID_PASSWORD = 'NuqeAdmin2026!';

let token;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: VALID_EMAIL, password: VALID_PASSWORD });
  token = res.body.accessToken;
});

// ─── MET-001 ──────────────────────────────────────────────────────────────────

test('MET-001: GET /metrics/dashboard-summary returns 200 with required fields', async () => {
  const res = await request(app)
    .get('/api/v1/metrics/dashboard-summary')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(typeof res.body.breach_risk_count).toBe('number');
  expect(typeof res.body.under_review_count).toBe('number');
  expect(typeof res.body.open_count).toBe('number');
  expect(typeof res.body.fos_referred_count).toBe('number');
});

// ─── MET-002 ──────────────────────────────────────────────────────────────────

test('MET-002: breach_risk_count = 2 with seed data', async () => {
  const res = await request(app)
    .get('/api/v1/metrics/dashboard-summary')
    .set('Authorization', `Bearer ${token}`);

  expect(res.body.breach_risk_count).toBe(2);
});

// ─── MET-003 ──────────────────────────────────────────────────────────────────

test('MET-003: under_review_count = 3 with seed data', async () => {
  const res = await request(app)
    .get('/api/v1/metrics/dashboard-summary')
    .set('Authorization', `Bearer ${token}`);

  expect(res.body.under_review_count).toBe(3);
});

// ─── MET-004 ──────────────────────────────────────────────────────────────────

test('MET-004: open_count = 3 with seed data', async () => {
  const res = await request(app)
    .get('/api/v1/metrics/dashboard-summary')
    .set('Authorization', `Bearer ${token}`);

  expect(res.body.open_count).toBe(3);
});

// ─── MET-005 ──────────────────────────────────────────────────────────────────

test('MET-005: fos_referred_count = 1 with seed data', async () => {
  const res = await request(app)
    .get('/api/v1/metrics/dashboard-summary')
    .set('Authorization', `Bearer ${token}`);

  expect(res.body.fos_referred_count).toBe(1);
});

// ─── MET-006 ──────────────────────────────────────────────────────────────────

test('MET-006: GET /metrics/ai-accuracy returns structured response', async () => {
  const res = await request(app)
    .get('/api/v1/metrics/ai-accuracy')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('date_from');
  expect(res.body).toHaveProperty('date_to');
  expect(res.body).toHaveProperty('ai_actions');
  expect(typeof res.body.ai_actions.total).toBe('number');
  expect(typeof res.body.ai_actions.approved).toBe('number');
  expect(typeof res.body.ai_actions.rejected).toBe('number');
  expect(Array.isArray(res.body.by_action_type)).toBe(true);
  expect(res.body).toHaveProperty('cases');
  expect(typeof res.body.cases.open).toBe('number');
  expect(typeof res.body.cases.breach_risk).toBe('number');
});

// ─── MET-007 ──────────────────────────────────────────────────────────────────

test('MET-007: ai-accuracy handles empty date range gracefully', async () => {
  const res = await request(app)
    .get('/api/v1/metrics/ai-accuracy?dateFrom=2000-01-01&dateTo=2000-01-02')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(res.body.ai_actions.total).toBe(0);
  expect(res.body.ai_actions.approved).toBe(0);
  expect(res.body.ai_actions.rejected).toBe(0);
  expect(Array.isArray(res.body.by_action_type)).toBe(true);
  expect(res.body.by_action_type.length).toBe(0);
});

// ─── MET-008 ──────────────────────────────────────────────────────────────────

test('MET-008: GET /metrics/model-comparison returns array response', async () => {
  const res = await request(app)
    .get('/api/v1/metrics/model-comparison')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);

  for (const item of res.body) {
    expect(item).toHaveProperty('ai_provider');
    expect(item).toHaveProperty('ai_model');
    expect(item).toHaveProperty('ab_split');
    expect(item).toHaveProperty('total_reviewed');
    expect(item).toHaveProperty('overall_approval_rate');
    expect(['primary', 'challenger']).toContain(item.ab_split);
  }
});
