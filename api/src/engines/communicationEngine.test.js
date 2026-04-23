import { jest } from '@jest/globals';

const CLASSIFY_JSON_QUERY     = '{"classification":"query","confidence":0.8,"reason":"simple information request"}';
const CLASSIFY_JSON_COMPLAINT = '{"classification":"complaint","confidence":0.95,"reason":"explicit dissatisfaction"}';
const CLASSIFY_JSON_IMPLICIT  = '{"classification":"implicit_complaint","confidence":0.87,"reason":"implied frustration"}';
const DRAFT_JSON              = '{"subject":"Re: Your Complaint","body":"Thank you for contacting us. We take your concerns seriously."}';

const mockCreate = jest.fn().mockResolvedValue({
  content: [{ type: 'text', text: CLASSIFY_JSON_QUERY }],
});

jest.unstable_mockModule('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

let pool, ingestCommunication, classifyCommunication, draftResponse, approveDraft;

let testCustomerId;
let ingestCommId;    // communication from CENG-001 (ingestCommunication)
let ceng003CaseId;   // case opened by CENG-003 (complaint)
let ceng003CommId;   // communication used for CENG-003
let ceng004CaseId;   // case opened by CENG-004 (implicit)
let ceng004CommId;   // communication used for CENG-004
let draftAiActionId; // ai_action from CENG-005 (draftResponse)

const STAFF_ID = '28d8bb1e-6597-4c91-862a-09a7d95794d6'; // admin@nuqe.io

beforeAll(async () => {
  ({ pool } = await import('../db/pool.js'));
  ({
    ingestCommunication,
    classifyCommunication,
    draftResponse,
    approveDraft,
  } = await import('./communicationEngine.js'));

  // Create a test customer
  const { rows } = await pool.query(
    `INSERT INTO customers (full_name, email, jurisdiction, external_ref)
     VALUES ('CENG Test User','ceng-test@nuqe-engine.example.com','UK','CENG-TEST')
     RETURNING id`
  );
  testCustomerId = rows[0].id;
}, 15_000);

afterAll(async () => {
  // Wait for any setImmediate callbacks (calculateDeadlines)
  await new Promise((r) => setTimeout(r, 400));

  const caseIds = [ceng003CaseId, ceng004CaseId].filter(Boolean);
  if (caseIds.length) {
    await pool.query(`DELETE FROM deadlines WHERE case_id = ANY($1)`, [caseIds]);
  }

  await pool.query(
    `DELETE FROM ai_actions WHERE communication_id IN (
       SELECT id FROM communications WHERE customer_id = $1
     )`,
    [testCustomerId]
  );
  if (caseIds.length) {
    await pool.query(`DELETE FROM ai_actions WHERE case_id = ANY($1)`, [caseIds]);
  }
  await pool.query(`DELETE FROM communications WHERE customer_id = $1`, [testCustomerId]);
  if (caseIds.length) {
    await pool.query(`DELETE FROM cases WHERE id = ANY($1)`, [caseIds]);
  }
  await pool.query(`DELETE FROM customers WHERE id = $1`, [testCustomerId]);
}, 15_000);

// ─── CENG-001 ─────────────────────────────────────────────────────────────────

test('CENG-001: ingestCommunication creates a communications row', async () => {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: CLASSIFY_JSON_QUERY }],
  });

  const comm = await ingestCommunication({
    customer_id: testCustomerId,
    channel:     'email',
    body:        'What is my outstanding balance on loan NQ-2026-TEST?',
    subject:     'Balance enquiry',
  });

  ingestCommId = comm.id;
  expect(typeof comm.id).toBe('string');
  expect(comm.direction).toBe('inbound');
  expect(comm.channel).toBe('email');
  expect(comm.author_type).toBe('customer');
}, 10_000);

// ─── CENG-002 ─────────────────────────────────────────────────────────────────

test('CENG-002: classifyCommunication writes a pending ai_action', async () => {
  const { rows } = await pool.query(
    `SELECT id, action_type, status, communication_id
     FROM ai_actions
     WHERE communication_id = $1
       AND action_type IN ('complaint_classification','implicit_complaint_detection')`,
    [ingestCommId]
  );
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0].status).toBe('pending');
});

// ─── CENG-003 ─────────────────────────────────────────────────────────────────

test('CENG-003: classifyCommunication opens new case when complaint detected', async () => {
  // Insert a bare communication (no AI, no classification yet)
  const { rows: commRows } = await pool.query(
    `INSERT INTO communications
       (customer_id, channel, direction, body, body_plain, author_type)
     VALUES ($1,'email','inbound','I am very unhappy and want to complain.',
             'I am very unhappy and want to complain.','customer')
     RETURNING *`,
    [testCustomerId]
  );
  ceng003CommId = commRows[0].id;

  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: CLASSIFY_JSON_COMPLAINT }],
  });

  const result = await classifyCommunication(ceng003CommId);
  expect(result.classification).toBe('complaint');

  // Verify a case was created
  const { rows: caseRows } = await pool.query(
    `SELECT id, status, ai_detected FROM cases WHERE customer_id = $1 ORDER BY opened_at DESC LIMIT 1`,
    [testCustomerId]
  );
  expect(caseRows.length).toBeGreaterThan(0);
  expect(caseRows[0].status).toBe('open');
  expect(caseRows[0].ai_detected).toBe(true);

  ceng003CaseId = caseRows[0].id;
}, 10_000);

// ─── CENG-004 ─────────────────────────────────────────────────────────────────

test('CENG-004: classifyCommunication detects implicit complaint and sets is_implicit', async () => {
  const { rows: commRows } = await pool.query(
    `INSERT INTO communications
       (customer_id, channel, direction, body, body_plain, author_type)
     VALUES ($1,'chat','inbound','I keep getting charged fees I do not recognise.',
             'I keep getting charged fees I do not recognise.','customer')
     RETURNING *`,
    [testCustomerId]
  );
  ceng004CommId = commRows[0].id;

  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: CLASSIFY_JSON_IMPLICIT }],
  });

  const result = await classifyCommunication(ceng004CommId);
  expect(result.classification).toBe('implicit_complaint');

  const { rows: caseRows } = await pool.query(
    `SELECT id, is_implicit FROM cases WHERE id != $1 AND customer_id = $2 ORDER BY opened_at DESC LIMIT 1`,
    [ceng003CaseId, testCustomerId]
  );
  expect(caseRows.length).toBeGreaterThan(0);
  expect(caseRows[0].is_implicit).toBe(true);

  ceng004CaseId = caseRows[0].id;
}, 10_000);

// ─── CENG-005 ─────────────────────────────────────────────────────────────────

test('CENG-005: draftResponse writes a pending response_draft ai_action', async () => {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: DRAFT_JSON }],
  });

  const result = await draftResponse(ceng003CaseId, ceng003CommId);
  draftAiActionId = result.aiActionId;

  expect(typeof draftAiActionId).toBe('string');
  expect(result.subject).toBe('Re: Your Complaint');
  expect(typeof result.body).toBe('string');

  const { rows } = await pool.query(
    `SELECT action_type, status FROM ai_actions WHERE id = $1`,
    [draftAiActionId]
  );
  expect(rows[0].action_type).toBe('response_draft');
  expect(rows[0].status).toBe('pending');
}, 10_000);

// ─── CENG-006 ─────────────────────────────────────────────────────────────────

test('CENG-006: draftResponse does NOT create a communications row', async () => {
  // After draftResponse, no ai_generated communication should exist yet for this case
  const { rows } = await pool.query(
    `SELECT id FROM communications WHERE case_id = $1 AND ai_generated = TRUE`,
    [ceng003CaseId]
  );
  expect(rows.length).toBe(0);
});

// ─── CENG-007 ─────────────────────────────────────────────────────────────────

test('CENG-007: approveDraft creates an outbound communications row', async () => {
  const comm = await approveDraft(draftAiActionId, STAFF_ID);

  expect(comm.direction).toBe('outbound');
  expect(comm.ai_generated).toBe(true);
  expect(comm.ai_approved_by).toBe(STAFF_ID);
  expect(comm.case_id).toBe(ceng003CaseId);

  // ai_action must now be 'approved'
  const { rows } = await pool.query(
    `SELECT status FROM ai_actions WHERE id = $1`,
    [draftAiActionId]
  );
  expect(rows[0].status).toBe('approved');
}, 10_000);

// ─── CENG-008 ─────────────────────────────────────────────────────────────────

test('CENG-008: AI operations write to audit_log', async () => {
  // Verify audit_log entries for both the ingest communication and the draft
  const { rows } = await pool.query(
    `SELECT entity_type, action FROM audit_log
     WHERE entity_type IN ('communication','ai_action','case')
       AND entity_id IN (
         SELECT id FROM ai_actions WHERE communication_id = $1
         UNION ALL
         SELECT $1
         UNION ALL
         SELECT id FROM cases WHERE customer_id = $2
       )`,
    [ingestCommId, testCustomerId]
  );
  expect(rows.length).toBeGreaterThan(0);
});
