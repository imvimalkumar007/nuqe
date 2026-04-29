import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db/pool.js';
import { calculateDeadlines } from './deadlineEngine.js';
import { retrieveContext } from './knowledgeLayer.js';
import logger from '../logger.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
});
const MODEL = 'claude-sonnet-4-6';

// ─── Prompts ──────────────────────────────────────────────────────────────────
// Kept as module-level constants so they are eligible for prompt caching.

const CLASSIFY_SYSTEM = `\
You are a compliance classification engine for a regulated digital lender.
Analyse the customer communication provided and classify it into exactly one of:

  complaint           – an explicit expression of dissatisfaction about a product, service, or outcome
  implicit_complaint  – dissatisfaction implied but not stated outright (frustration, threatening to leave, etc.)
  query               – a factual question or request for information with no dissatisfaction signal
  dispute             – a formal challenge to a specific decision, charge, or account action
  acknowledgement     – a simple acknowledgement, thank-you, or confirmation with no action required

Rules:
- When in doubt between complaint and implicit_complaint, prefer implicit_complaint.
- When in doubt between complaint and dispute, prefer complaint unless a specific charge or decision is challenged.
- Vulnerability indicators (mental health, financial distress, bereavement language) must be noted in reason.

Respond with a JSON object only — no markdown fences, no prose before or after:
{
  "classification": "<one of the five categories above>",
  "confidence": <number between 0.0 and 1.0>,
  "reason": "<one sentence explaining the classification, noting any vulnerability signals>"
}`;

const DRAFT_SYSTEM = `\
You are a compliance response writer for a regulated digital lender.
You will be given a JSON context object containing the case details, full communication timeline,
and the active regulatory ruleset. Draft a response that:

1. Opens by acknowledging receipt and the nature of the complaint or query.
2. Is factually accurate relative to the timeline provided — do not invent facts.
3. Does not admit liability or use language that could be construed as an admission.
4. Signposts the customer to the appropriate escalation route (FOS, RBI Ombudsman, ADR body)
   only if the FINAL_RESPONSE or equivalent deadline is within scope.
5. Maintains a professional, empathetic tone appropriate to the jurisdiction.
6. Complies with the regulatory references listed in the ruleset.

Return a JSON object only — no markdown fences:
{
  "subject": "<email subject or letter heading>",
  "body": "<full response text, using \\n for line breaks>"
}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html) {
  return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function writeAudit(client, { entityType, entityId, action, previousValue, newValue }) {
  await client.query(
    `INSERT INTO audit_log
       (entity_type, entity_id, action, actor_type, previous_value, new_value)
     VALUES ($1, $2, $3, 'system', $4, $5)`,
    [
      entityType,
      entityId,
      action,
      previousValue != null ? JSON.stringify(previousValue) : null,
      newValue != null ? JSON.stringify(newValue) : null,
    ]
  );
}

// Resolve a single active ruleset_id for a jurisdiction — used when auto-opening
// a case. Picks the ACKNOWLEDGE rule as the canonical FK anchor; all rules for
// the same jurisdiction/version share the same version string.
async function resolveRulesetId(client, jurisdiction) {
  const { rows } = await client.query(
    `SELECT id FROM ruleset
     WHERE jurisdiction = $1 AND is_active = TRUE AND rule_type = 'ACKNOWLEDGE'
     ORDER BY effective_from DESC
     LIMIT 1`,
    [jurisdiction]
  );
  if (!rows.length) throw new Error(`No active ruleset found for jurisdiction: ${jurisdiction}`);
  return rows[0].id;
}

// ─── Auto-open case ───────────────────────────────────────────────────────────

async function openCaseForCommunication(client, comm, classification) {
  const rulesetId = await resolveRulesetId(client, comm.jurisdiction);

  const { rows: caseRows } = await client.query(
    `INSERT INTO cases
       (case_ref, customer_id, ruleset_id, status, channel_received,
        is_implicit, ai_detected, category)
     VALUES ('', $1, $2, 'open', $3, $4, TRUE, 'unclassified')
     RETURNING *`,
    [
      comm.customer_id,
      rulesetId,
      comm.channel,
      classification === 'implicit_complaint',
    ]
  );
  const newCase = caseRows[0];

  // Link the communication to the new case
  await client.query(
    `UPDATE communications SET case_id = $1 WHERE id = $2`,
    [newCase.id, comm.id]
  );

  await writeAudit(client, {
    entityType: 'case',
    entityId: newCase.id,
    action: 'created',
    newValue: {
      case_ref: newCase.case_ref,
      trigger: 'ai_classification',
      classification,
      communication_id: comm.id,
    },
  });

  // Calculate deadlines outside this transaction — it opens its own connection
  setImmediate(() => {
    calculateDeadlines(newCase.id).catch((err) =>
      logger.error({ caseId: newCase.id, err }, 'communicationEngine calculateDeadlines failed')
    );
  });

  return newCase;
}

// ─────────────────────────────────────────────────────────────────────────────
// ingestCommunication(payload)
// Accepts an inbound communication, persists it, then triggers classification.
// ─────────────────────────────────────────────────────────────────────────────
export async function ingestCommunication(payload) {
  const { channel, customer_id, body, subject, external_ref, metadata } = payload;
  const body_plain = stripHtml(body);

  let comm;
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO communications
         (customer_id, channel, direction, subject, body, body_plain,
          author_type, external_ref, metadata)
       VALUES ($1, $2, 'inbound', $3, $4, $5, 'customer', $6, $7::jsonb)
       RETURNING *`,
      [
        customer_id,
        channel,
        subject ?? null,
        body,
        body_plain,
        external_ref ?? null,
        metadata != null ? JSON.stringify(metadata) : null,
      ]
    );
    comm = rows[0];

    await writeAudit(client, {
      entityType: 'communication',
      entityId: comm.id,
      action: 'created',
      newValue: { channel, direction: 'inbound', customer_id },
    });
  } finally {
    client.release();
  }

  // Classify after releasing the DB connection — Claude call can take seconds
  await classifyCommunication(comm.id);

  return comm;
}

// ─────────────────────────────────────────────────────────────────────────────
// classifyCommunication(communicationId)
// Sends the communication body to Claude, writes the result to ai_actions,
// and auto-opens a case if a complaint or implicit complaint is detected.
// ─────────────────────────────────────────────────────────────────────────────
export async function classifyCommunication(communicationId) {
  // Load communication + customer jurisdiction in one query
  let comm;
  {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT cm.*, cu.jurisdiction
         FROM communications cm
         JOIN customers cu ON cu.id = cm.customer_id
         WHERE cm.id = $1`,
        [communicationId]
      );
      if (!rows.length) throw new Error(`Communication not found: ${communicationId}`);
      comm = rows[0];
    } finally {
      client.release();
    }
  }

  const inputText = (comm.body_plain || comm.body).slice(0, 4000); // guard token budget

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: CLASSIFY_SYSTEM,
    messages: [{ role: 'user', content: inputText }],
  });

  const rawOutput = response.content[0]?.text ?? '';
  let parsed;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    throw new Error(`Claude returned non-JSON classification: ${rawOutput}`);
  }

  const { classification, confidence, reason } = parsed;
  const isComplaint =
    classification === 'complaint' || classification === 'implicit_complaint';

  const actionType =
    classification === 'implicit_complaint'
      ? 'implicit_complaint_detection'
      : 'complaint_classification';

  const client = await pool.connect();
  try {
    const { rows: actionRows } = await client.query(
      `INSERT INTO ai_actions
         (case_id, communication_id, action_type, ai_input, ai_output,
          ai_model, confidence_score, status, ai_classification,
          reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, NOW())
       RETURNING id`,
      [
        comm.case_id ?? null,
        communicationId,
        actionType,
        inputText,
        rawOutput,
        MODEL,
        confidence,
        classification,
      ]
    );
    const aiActionId = actionRows[0].id;

    await writeAudit(client, {
      entityType: 'ai_action',
      entityId: aiActionId,
      action: 'created',
      newValue: { action_type: actionType, classification, confidence, reason },
    });

    // Auto-open case when a complaint is detected and none exists yet
    if (isComplaint && !comm.case_id) {
      const newCase = await openCaseForCommunication(client, comm, classification);

      // Backfill case_id on the ai_action row
      await client.query(
        `UPDATE ai_actions SET case_id = $1 WHERE id = $2`,
        [newCase.id, aiActionId]
      );
    }

    return { classification, confidence, reason, aiActionId };
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// draftResponse(caseId, communicationId)
// Builds full case context, calls Claude to produce a compliant draft, and
// writes it to ai_actions with status 'pending'. Nothing is written to
// communications until approveDraft() is called by a staff member.
// ─────────────────────────────────────────────────────────────────────────────
export async function draftResponse(caseId, communicationId) {
  let context;
  {
    const client = await pool.connect();
    try {
      // Case + ruleset details
      const { rows: caseRows } = await client.query(
        `SELECT c.*, r.jurisdiction, r.version, r.rule_type, r.threshold_days,
                r.threshold_business_days, r.escalation_path, r.regulatory_ref
         FROM cases c
         JOIN ruleset r ON r.id = c.ruleset_id
         WHERE c.id = $1`,
        [caseId]
      );
      if (!caseRows.length) throw new Error(`Case not found: ${caseId}`);

      // Full ruleset for the same jurisdiction/version (all rule types)
      const { jurisdiction, version } = caseRows[0];
      const { rows: allRules } = await client.query(
        `SELECT rule_type, threshold_days, threshold_business_days,
                escalation_path, regulatory_ref
         FROM ruleset
         WHERE jurisdiction = $1 AND version = $2 AND is_active = TRUE
         ORDER BY threshold_days`,
        [jurisdiction, version]
      );

      // Full communication timeline for the case
      const { rows: timeline } = await client.query(
        `SELECT direction, channel, author_type, subject, body_plain, sent_at, created_at
         FROM communications
         WHERE case_id = $1
         ORDER BY created_at ASC`,
        [caseId]
      );

      // Customer details (name, vulnerable flag)
      const { rows: customerRows } = await client.query(
        `SELECT full_name, jurisdiction, vulnerable_flag
         FROM customers
         WHERE id = $1`,
        [caseRows[0].customer_id]
      );

      context = {
        case: {
          case_ref: caseRows[0].case_ref,
          status: caseRows[0].status,
          category: caseRows[0].category,
          opened_at: caseRows[0].opened_at,
          channel_received: caseRows[0].channel_received,
          is_implicit: caseRows[0].is_implicit,
        },
        customer: customerRows[0],
        ruleset: { jurisdiction, version, rules: allRules },
        timeline,
        knowledge_context: [],
      };
    } finally {
      client.release();
    }
  }

  // Enrich with time-anchored knowledge context (as-at the case open date)
  try {
    const latestComm = context.timeline.at(-1);
    const queryText = latestComm?.body_plain || latestComm?.subject || context.case.category || '';
    if (queryText) {
      context.knowledge_context = await retrieveContext(queryText, {
        jurisdiction: context.customer.jurisdiction,
        asAtDate:     context.case.opened_at,
        limit:        4,
      });
    }
  } catch {
    // knowledge context is best-effort — never fail a draft over it
  }

  const inputText = JSON.stringify(context, null, 2);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: DRAFT_SYSTEM,
    messages: [{ role: 'user', content: inputText }],
  });

  const rawOutput = response.content[0]?.text ?? '';
  let parsed;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    throw new Error(`Claude returned non-JSON draft: ${rawOutput}`);
  }

  const client = await pool.connect();
  try {
    const { rows: actionRows } = await client.query(
      `INSERT INTO ai_actions
         (case_id, communication_id, action_type, ai_input, ai_output,
          ai_model, status)
       VALUES ($1, $2, 'response_draft', $3, $4, $5, 'pending')
       RETURNING id`,
      [caseId, communicationId ?? null, inputText, rawOutput, MODEL]
    );
    const aiActionId = actionRows[0].id;

    await writeAudit(client, {
      entityType: 'ai_action',
      entityId: aiActionId,
      action: 'created',
      newValue: { action_type: 'response_draft', case_id: caseId, status: 'pending' },
    });

    return { aiActionId, subject: parsed.subject, body: parsed.body };
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// approveDraft(aiActionId, staffId)
// Called by a staff member after reviewing a pending response_draft ai_action.
// Writes the approved text to communications and marks the ai_action approved.
// This is the only path by which an AI-generated message enters communications.
// ─────────────────────────────────────────────────────────────────────────────
export async function approveDraft(aiActionId, staffId) {
  const client = await pool.connect();
  try {
    const { rows: actionRows } = await client.query(
      `SELECT * FROM ai_actions WHERE id = $1 AND action_type = 'response_draft'`,
      [aiActionId]
    );
    if (!actionRows.length) throw new Error(`response_draft ai_action not found: ${aiActionId}`);
    const action = actionRows[0];
    if (action.status !== 'pending') {
      throw new Error(`Draft is already ${action.status} — cannot approve`);
    }

    let parsed;
    try {
      parsed = JSON.parse(action.ai_output);
    } catch {
      throw new Error(`Stored ai_output is not valid JSON for action ${aiActionId}`);
    }

    // Resolve customer_id from the linked case
    const { rows: caseRows } = await client.query(
      `SELECT customer_id, channel_received FROM cases WHERE id = $1`,
      [action.case_id]
    );
    if (!caseRows.length) throw new Error(`Case not found for draft: ${action.case_id}`);
    const { customer_id, channel_received } = caseRows[0];

    // Write the approved draft to communications
    const channel = ['email', 'chat', 'postal'].includes(channel_received)
      ? channel_received
      : 'email';

    const { rows: commRows } = await client.query(
      `INSERT INTO communications
         (case_id, customer_id, channel, direction, subject, body, body_plain,
          author_type, author_id, ai_generated, ai_approved_by, ai_approved_at)
       VALUES ($1, $2, $3, 'outbound', $4, $5, $5, 'ai_draft', $6, TRUE, $6, NOW())
       RETURNING *`,
      [
        action.case_id,
        customer_id,
        channel,
        parsed.subject ?? null,
        parsed.body,
        staffId,
      ]
    );
    const comm = commRows[0];

    // Mark ai_action approved
    await client.query(
      `UPDATE ai_actions
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [staffId, aiActionId]
    );

    await writeAudit(client, {
      entityType: 'ai_action',
      entityId: aiActionId,
      action: 'approved',
      previousValue: { status: 'pending' },
      newValue: { status: 'approved', reviewed_by: staffId, communication_id: comm.id },
    });

    return comm;
  } finally {
    client.release();
  }
}
