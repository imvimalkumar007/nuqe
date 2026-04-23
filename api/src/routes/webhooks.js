import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { classifyCommunication } from '../engines/communicationEngine.js';
import { validate } from '../middleware/validate.js';

const quidoSchema = z.object({
  event_type:     z.string().min(1),
  customer_email: z.string().email(),
  channel:        z.enum(['email', 'chat', 'postal']),
  message_body:   z.string().min(1),
  customer_name:  z.string().optional().nullable(),
  loan_id:        z.string().optional().nullable(),
  reason:         z.string().optional().nullable(),
  external_ref:   z.string().optional().nullable(),
  metadata:       z.record(z.unknown()).optional().nullable(),
});

const router = Router();

// ─── Shared secret guard ──────────────────────────────────────────────────────

function requireQuidoSecret(req, res, next) {
  const secret = process.env.QUIDO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhooks] QUIDO_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  if (req.headers['x-quido-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  next();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeAudit(client, { entityType, entityId, action, newValue }) {
  await client.query(
    `INSERT INTO audit_log
       (entity_type, entity_id, action, actor_type, new_value)
     VALUES ($1, $2, $3, 'system', $4)`,
    [entityType, entityId, action, newValue != null ? JSON.stringify(newValue) : null]
  );
}

// Reason values from Quido contact forms that indicate a complaint intent.
const COMPLAINT_REASONS = new Set([
  'make_a_complaint',
  'complaint',
  'raise_complaint',
  'unhappy',
  'dissatisfied',
  'dispute',
]);

function isComplaintReason(reason) {
  if (!reason) return false;
  return COMPLAINT_REASONS.has(reason.toLowerCase().trim());
}

// ─── POST /api/v1/webhooks/quido ──────────────────────────────────────────────

router.post('/quido', requireQuidoSecret, validate(quidoSchema), async (req, res) => {
  const {
    event_type,
    customer_email,
    customer_name,
    loan_id,
    channel,
    message_body,
    reason,
    external_ref,
    metadata,
  } = req.body;

  const client = await pool.connect();
  let comm;
  try {
    await client.query('BEGIN');

    // ── 1. Look up or create customer ─────────────────────────────────────────
    let customer;
    {
      const { rows } = await client.query(
        `SELECT * FROM customers WHERE email = $1 LIMIT 1`,
        [customer_email.toLowerCase().trim()]
      );
      customer = rows[0] ?? null;
    }

    if (!customer) {
      const { rows } = await client.query(
        `INSERT INTO customers (full_name, email, jurisdiction, external_ref)
         VALUES ($1, $2, 'UK', $3)
         RETURNING *`,
        [
          customer_name ?? customer_email,
          customer_email.toLowerCase().trim(),
          loan_id ?? null,
        ]
      );
      customer = rows[0];

      await writeAudit(client, {
        entityType: 'customer',
        entityId: customer.id,
        action: 'created',
        newValue: { source: 'quido_webhook', email: customer.email, loan_id },
      });
    } else if (loan_id && customer.external_ref !== loan_id) {
      // Update external_ref with the loan_id if we now have one
      await client.query(
        `UPDATE customers SET external_ref = $1, updated_at = NOW() WHERE id = $2`,
        [loan_id, customer.id]
      );
      customer.external_ref = loan_id;
    }

    // ── 2. Create communication ───────────────────────────────────────────────
    {
      const body_plain = message_body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const { rows } = await client.query(
        `INSERT INTO communications
           (customer_id, channel, direction, body, body_plain,
            author_type, external_ref, metadata)
         VALUES ($1, $2, 'inbound', $3, $4, 'customer', $5, $6::jsonb)
         RETURNING *`,
        [
          customer.id,
          channel,
          message_body,
          body_plain,
          external_ref ?? null,
          metadata != null ? JSON.stringify(metadata) : null,
        ]
      );
      comm = rows[0];
    }

    await writeAudit(client, {
      entityType: 'communication',
      entityId: comm.id,
      action: 'created',
      newValue: {
        source: 'quido_webhook',
        event_type,
        channel,
        customer_id: customer.id,
        reason: reason ?? null,
        external_ref: external_ref ?? null,
      },
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    console.error('[webhooks/quido] DB error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
  client.release();

  // ── 3. Conditionally classify and open case ───────────────────────────────
  // Classification runs outside the transaction — it calls Claude (slow) and
  // opens its own DB connections. We only run it when the event is a contact
  // form submission with a complaint-indicating reason, or for all inbound
  // messages that may be complaints.
  let caseId = null;

  const shouldClassify =
    event_type === 'contact_form_submission'
      ? isComplaintReason(reason)
      : true; // classify all chat / portal messages

  if (shouldClassify) {
    try {
      const result = await classifyCommunication(comm.id);
      // classifyCommunication auto-opens a case when it detects a complaint;
      // we fetch the updated communication to surface the case_id in the response.
      if (
        result.classification === 'complaint' ||
        result.classification === 'implicit_complaint'
      ) {
        const { rows } = await pool.query(
          `SELECT case_id FROM communications WHERE id = $1`,
          [comm.id]
        );
        caseId = rows[0]?.case_id ?? null;
      }
    } catch (err) {
      // Classification failure must not prevent a 200 — the communication was
      // persisted successfully; a staff member can manually review it.
      console.error('[webhooks/quido] classification error:', err.message);
    }
  }

  return res.status(200).json({
    communication_id: comm.id,
    case_id: caseId,
  });
});

export default router;
