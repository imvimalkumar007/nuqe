import { jest } from '@jest/globals';

// Default mock: returns a query classification (non-complaint)
const mockCreate = jest.fn().mockResolvedValue({
  content: [{ type: 'text', text: '{"classification":"query","confidence":0.8,"reason":"test query"}' }],
});

jest.unstable_mockModule('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

let supertest, app, pool;

const WEBHOOK_SECRET = 'test-quido-secret-hook-tests';
const TEST_EMAIL = 'hook-test@nuqe-webhook.example.com';

let hook1Response;  // response from HOOK-001 (query)
let hook5Response;  // response from HOOK-005 (complaint → case opened)

beforeAll(async () => {
  process.env.QUIDO_WEBHOOK_SECRET = WEBHOOK_SECRET;

  ({ default: supertest } = await import('supertest'));
  ({ default: app }       = await import('../app.js'));
  ({ pool }               = await import('../db/pool.js'));

  // Remove any leftover test customer from a previous run
  const { rows: existing } = await pool.query(
    `SELECT id FROM customers WHERE email = $1`, [TEST_EMAIL]
  );
  if (existing.length) {
    const ids = existing.map((r) => r.id);
    const { rows: cases } = await pool.query(
      `SELECT id FROM cases WHERE customer_id = ANY($1)`, [ids]
    );
    const caseIds = cases.map((c) => c.id);
    if (caseIds.length) {
      await pool.query(`DELETE FROM deadlines WHERE case_id = ANY($1)`, [caseIds]);
      await pool.query(`DELETE FROM ai_actions WHERE case_id = ANY($1)`, [caseIds]);
    }
    const { rows: comms } = await pool.query(
      `SELECT id FROM communications WHERE customer_id = ANY($1)`, [ids]
    );
    const commIds = comms.map((c) => c.id);
    if (commIds.length) {
      await pool.query(`DELETE FROM ai_actions WHERE communication_id = ANY($1)`, [commIds]);
      await pool.query(`DELETE FROM communications WHERE id = ANY($1)`, [commIds]);
    }
    if (caseIds.length) await pool.query(`DELETE FROM cases WHERE id = ANY($1)`, [caseIds]);
    await pool.query(`DELETE FROM customers WHERE id = ANY($1)`, [ids]);
  }
}, 20_000);

afterAll(async () => {
  // Wait a moment for any setImmediate(calculateDeadlines) to settle
  await new Promise((r) => setTimeout(r, 300));

  const { rows: customers } = await pool.query(
    `SELECT id FROM customers WHERE email = $1`, [TEST_EMAIL]
  );
  const customerIds = customers.map((c) => c.id);
  if (!customerIds.length) return;

  const { rows: cases } = await pool.query(
    `SELECT id FROM cases WHERE customer_id = ANY($1)`, [customerIds]
  );
  const caseIds = cases.map((c) => c.id);

  if (caseIds.length) {
    await pool.query(`DELETE FROM deadlines    WHERE case_id = ANY($1)`, [caseIds]);
    await pool.query(`DELETE FROM ai_actions   WHERE case_id = ANY($1)`, [caseIds]);
  }

  const { rows: comms } = await pool.query(
    `SELECT id FROM communications WHERE customer_id = ANY($1)`, [customerIds]
  );
  const commIds = comms.map((c) => c.id);

  if (commIds.length) {
    await pool.query(`DELETE FROM ai_actions     WHERE communication_id = ANY($1)`, [commIds]);
    await pool.query(`DELETE FROM communications WHERE id               = ANY($1)`, [commIds]);
  }

  if (caseIds.length) await pool.query(`DELETE FROM cases     WHERE id = ANY($1)`, [caseIds]);
  await pool.query(`DELETE FROM customers WHERE id = ANY($1)`, [customerIds]);
}, 15_000);

// ─── HOOK-002 ─────────────────────────────────────────────────────────────────
// Run before HOOK-001 to avoid creating any DB state

test('HOOK-002: POST /webhooks/quido with wrong secret returns 401', async () => {
  const res = await supertest(app)
    .post('/api/v1/webhooks/quido')
    .set('X-Quido-Secret', 'wrong-secret')
    .send({
      event_type:     'live_chat',
      customer_email: TEST_EMAIL,
      channel:        'chat',
      message_body:   'hello',
    });

  expect(res.status).toBe(401);
});

// ─── HOOK-001 ─────────────────────────────────────────────────────────────────

test('HOOK-001: POST /webhooks/quido with valid secret returns 200', async () => {
  // Mock returns a non-complaint classification
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: '{"classification":"query","confidence":0.9,"reason":"user asking a question"}' }],
  });

  hook1Response = await supertest(app)
    .post('/api/v1/webhooks/quido')
    .set('X-Quido-Secret', WEBHOOK_SECRET)
    .send({
      event_type:     'live_chat',
      customer_email: TEST_EMAIL,
      customer_name:  'Hook Test User',
      channel:        'chat',
      message_body:   'What is my current balance?',
    });

  expect(hook1Response.status).toBe(200);
  expect(hook1Response.body).toHaveProperty('communication_id');
}, 10_000);

// ─── HOOK-003 ─────────────────────────────────────────────────────────────────

test('HOOK-003: Valid webhook creates a communications row', async () => {
  const commId = hook1Response.body.communication_id;
  expect(commId).toBeDefined();

  const { rows } = await pool.query(
    `SELECT id, channel, direction, author_type FROM communications WHERE id = $1`,
    [commId]
  );
  expect(rows.length).toBe(1);
  expect(rows[0].channel).toBe('chat');
  expect(rows[0].direction).toBe('inbound');
  expect(rows[0].author_type).toBe('customer');
});

// ─── HOOK-004 ─────────────────────────────────────────────────────────────────

test('HOOK-004: Valid webhook triggers a classification ai_action', async () => {
  const commId = hook1Response.body.communication_id;

  const { rows } = await pool.query(
    `SELECT id, action_type, status FROM ai_actions
     WHERE communication_id = $1
       AND action_type IN ('complaint_classification','implicit_complaint_detection')`,
    [commId]
  );
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0].status).toBe('pending');
});

// ─── HOOK-005 ─────────────────────────────────────────────────────────────────

test('HOOK-005: Complaint webhook auto-opens a new case', async () => {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: '{"classification":"complaint","confidence":0.95,"reason":"explicit dissatisfaction"}' }],
  });

  hook5Response = await supertest(app)
    .post('/api/v1/webhooks/quido')
    .set('X-Quido-Secret', WEBHOOK_SECRET)
    .send({
      event_type:     'contact_form_submission',
      customer_email: TEST_EMAIL,
      customer_name:  'Hook Test User',
      channel:        'email',
      message_body:   'I am very unhappy with my loan and want to make a formal complaint.',
      reason:         'make_a_complaint',
    });

  expect(hook5Response.status).toBe(200);

  // Verify a case row was actually created in the database
  const { rows: customers } = await pool.query(
    `SELECT id FROM customers WHERE email = $1`, [TEST_EMAIL]
  );
  const { rows: cases } = await pool.query(
    `SELECT id FROM cases WHERE customer_id = ANY($1)`,
    [customers.map((c) => c.id)]
  );
  expect(cases.length).toBeGreaterThan(0);
}, 10_000);

// ─── HOOK-006 ─────────────────────────────────────────────────────────────────

test('HOOK-006: Response includes case_id when a case is opened', () => {
  expect(hook5Response.body.case_id).not.toBeNull();
  expect(typeof hook5Response.body.case_id).toBe('string');
});
