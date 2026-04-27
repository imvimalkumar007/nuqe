import { Router } from 'express';
import { createHmac } from 'crypto';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { classifyCommunication } from '../engines/communicationEngine.js';
import { validate } from '../middleware/validate.js';
import logger from '../logger.js';

const ORG_ID = '10000000-0000-0000-0000-000000000001';

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
    logger.error('webhooks QUIDO_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  if (req.headers['x-quido-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  next();
}

// ─── Mailgun signature verification ──────────────────────────────────────────
// https://documentation.mailgun.com/en/latest/user_manual.html#webhooks

function verifyMailgunSignature(req) {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!signingKey) return true; // skip in dev/test when key not set

  const { timestamp, token, signature } = req.body;
  if (!timestamp || !token || !signature) return false;

  // Reject stale webhooks (> 5 minutes)
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) return false;

  const expected = createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex');

  return expected === signature;
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

const COMPLAINT_REASONS = new Set([
  'make_a_complaint', 'complaint', 'raise_complaint',
  'unhappy', 'dissatisfied', 'dispute',
]);

function isComplaintReason(reason) {
  if (!reason) return false;
  return COMPLAINT_REASONS.has(reason.toLowerCase().trim());
}

// ─── POST /api/v1/webhooks/quido ──────────────────────────────────────────────

router.post('/quido', requireQuidoSecret, validate(quidoSchema), async (req, res) => {
  const {
    event_type, customer_email, customer_name, loan_id,
    channel, message_body, reason, external_ref, metadata,
  } = req.body;

  const client = await pool.connect();
  let comm;
  try {
    await client.query('BEGIN');

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
         VALUES ($1, $2, 'UK', $3) RETURNING *`,
        [customer_name ?? customer_email, customer_email.toLowerCase().trim(), loan_id ?? null]
      );
      customer = rows[0];
      await writeAudit(client, {
        entityType: 'customer', entityId: customer.id, action: 'created',
        newValue: { source: 'quido_webhook', email: customer.email, loan_id },
      });
    } else if (loan_id && customer.external_ref !== loan_id) {
      await client.query(
        `UPDATE customers SET external_ref = $1, updated_at = NOW() WHERE id = $2`,
        [loan_id, customer.id]
      );
    }

    const body_plain = message_body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const { rows } = await client.query(
      `INSERT INTO communications
         (customer_id, channel, direction, body, body_plain, author_type, external_ref, metadata)
       VALUES ($1, $2, 'inbound', $3, $4, 'customer', $5, $6::jsonb) RETURNING *`,
      [customer.id, channel, message_body, body_plain, external_ref ?? null,
       metadata != null ? JSON.stringify(metadata) : null]
    );
    comm = rows[0];

    await writeAudit(client, {
      entityType: 'communication', entityId: comm.id, action: 'created',
      newValue: { source: 'quido_webhook', event_type, channel, customer_id: customer.id, reason },
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    logger.error({ err }, 'webhooks/quido DB error');
    return res.status(500).json({ error: 'Internal server error' });
  }
  client.release();

  let caseId = null;
  const shouldClassify = event_type === 'contact_form_submission'
    ? isComplaintReason(reason)
    : true;

  if (shouldClassify) {
    try {
      const result = await classifyCommunication(comm.id);
      if (result.classification === 'complaint' || result.classification === 'implicit_complaint') {
        const { rows } = await pool.query(
          `SELECT case_id FROM communications WHERE id = $1`, [comm.id]
        );
        caseId = rows[0]?.case_id ?? null;
      }
    } catch (err) {
      logger.error({ err }, 'webhooks/quido classification error');
    }
  }

  return res.status(200).json({ communication_id: comm.id, case_id: caseId });
});

// ─── POST /api/v1/webhooks/email-inbound ─────────────────────────────────────
// Receives parsed email from Mailgun Inbound Routes.
// Mailgun POSTs multipart/form-data; we consume req.body (already parsed by express).

router.post('/email-inbound', async (req, res) => {
  // Verify Mailgun signature
  if (!verifyMailgunSignature(req)) {
    logger.warn('email-inbound: invalid Mailgun signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const sender     = req.body['sender']       ?? req.body['from']     ?? '';
  const recipient  = req.body['recipient']    ?? '';
  const subject    = req.body['subject']      ?? '(no subject)';
  const bodyPlain  = req.body['body-plain']   ?? req.body['stripped-text'] ?? '';
  const bodyHtml   = req.body['body-html']    ?? '';
  const messageId  = req.body['Message-Id']   ?? req.body['message-id'] ?? null;
  const inReplyTo  = req.body['In-Reply-To']  ?? req.body['in-reply-to'] ?? null;

  // Strip angle brackets from header values
  const cleanId = (v) => v ? v.replace(/[<>]/g, '').trim() : null;
  const msgId   = cleanId(messageId);
  const replyTo = cleanId(inReplyTo);

  // Extract sender email address
  const senderEmail = sender.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0]?.toLowerCase() ?? sender.toLowerCase();

  logger.info({ recipient, sender: senderEmail, subject, msgId, replyTo }, 'email-inbound received');

  // ── 1. Find channel from recipient address ──────────────────────────────────
  const { rows: channelRows } = await pool.query(
    `SELECT id, organisation_id FROM channels WHERE nuqe_inbound = $1 AND is_active = TRUE`,
    [recipient.toLowerCase().trim()]
  );
  const channel = channelRows[0] ?? null;

  // ── 2. Thread match — find existing case ────────────────────────────────────
  let caseId = null;

  if (replyTo) {
    // Look for an outbound comm with this Message-ID
    const { rows } = await pool.query(
      `SELECT case_id FROM communications WHERE message_id = $1 AND case_id IS NOT NULL LIMIT 1`,
      [replyTo]
    );
    caseId = rows[0]?.case_id ?? null;
  }

  if (!caseId) {
    // Look for case ref in subject (e.g. "NQ-2024-0001")
    const refMatch = subject.match(/\bNQ-\d{4}-\d{4,}\b/i);
    if (refMatch) {
      const { rows } = await pool.query(
        `SELECT id FROM cases WHERE case_ref ILIKE $1 LIMIT 1`,
        [refMatch[0]]
      );
      caseId = rows[0]?.id ?? null;
    }
  }

  const client = await pool.connect();
  let commId = null;

  try {
    await client.query('BEGIN');

    // ── 3. Look up or create customer ──────────────────────────────────────────
    let customer;
    {
      const { rows } = await client.query(
        `SELECT * FROM customers WHERE email = $1 LIMIT 1`,
        [senderEmail]
      );
      customer = rows[0] ?? null;
    }

    if (!customer) {
      const { rows } = await client.query(
        `INSERT INTO customers (full_name, email, jurisdiction)
         VALUES ($1, $2, 'UK') RETURNING *`,
        [senderEmail, senderEmail]
      );
      customer = rows[0];
    }

    // ── 4. Create new case if no thread match ───────────────────────────────────
    if (!caseId) {
      // Use the default UK FCA ruleset
      const { rows: rsRows } = await client.query(
        `SELECT id FROM ruleset WHERE jurisdiction = 'UK' AND is_active = TRUE LIMIT 1`
      );
      const rulesetId = rsRows[0]?.id;
      if (rulesetId) {
        const { rows: caseRows } = await client.query(
          `INSERT INTO cases (customer_id, ruleset_id, channel_received, channel_id)
           VALUES ($1, $2, 'email', $3) RETURNING id`,
          [customer.id, rulesetId, channel?.id ?? null]
        );
        caseId = caseRows[0].id;
      }
    } else if (channel?.id) {
      // Update existing case with channel if not already set
      await client.query(
        `UPDATE cases SET channel_id = $1 WHERE id = $2 AND channel_id IS NULL`,
        [channel.id, caseId]
      );
    }

    // ── 5. Store the communication ──────────────────────────────────────────────
    const body = bodyHtml || bodyPlain;
    const { rows: commRows } = await client.query(
      `INSERT INTO communications
         (case_id, customer_id, channel, direction, subject, body, body_plain,
          author_type, message_id, in_reply_to)
       VALUES ($1, $2, 'email', 'inbound', $3, $4, $5, 'customer', $6, $7)
       RETURNING id`,
      [caseId, customer.id, subject, body, bodyPlain, msgId, replyTo]
    );
    commId = commRows[0].id;

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    logger.error({ err }, 'email-inbound DB error');
    return res.status(500).json({ error: 'Internal server error' });
  }
  client.release();

  // ── 6. Classify if this is a new case ──────────────────────────────────────
  if (commId && !replyTo) {
    try {
      await classifyCommunication(commId);
    } catch (err) {
      logger.error({ err, commId }, 'email-inbound classification error');
    }
  }

  // Mailgun expects 200 to avoid retries
  return res.status(200).json({ communication_id: commId, case_id: caseId });
});

// ─── POST /api/v1/webhooks/resend ─────────────────────────────────────────────
// Delivery status events from Resend (email.delivered, email.opened, email.bounced…)

router.post('/resend', async (req, res) => {
  // Verify Resend webhook signature
  const signingSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (signingSecret) {
    const svixId        = req.headers['svix-id']        ?? '';
    const svixTimestamp = req.headers['svix-timestamp']  ?? '';
    const svixSignature = req.headers['svix-signature']  ?? '';

    const payload  = `${svixId}.${svixTimestamp}.${JSON.stringify(req.body)}`;
    const expected = createHmac('sha256', signingSecret).update(payload).digest('base64');
    const provided = (svixSignature.split(' ')[0] ?? '').replace('v1,', '');

    if (expected !== provided) {
      logger.warn('resend webhook: invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  const { type, data } = req.body;

  const STATUS_MAP = {
    'email.delivered': 'delivered',
    'email.opened':    'opened',
    'email.bounced':   'bounced',
    'email.complained': 'failed',
  };

  const deliveryStatus = STATUS_MAP[type];
  if (!deliveryStatus) return res.status(200).json({ ignored: true });

  // Find comm by X-Nuqe-Comm-Id header stored in Resend
  const commId = data?.headers?.find?.((h) => h.name === 'X-Nuqe-Comm-Id')?.value
    ?? data?.email_id;  // fallback: match by resend email id

  if (!commId) return res.status(200).json({ ignored: true });

  try {
    if (commId.includes('-')) {
      // UUID format — direct comm id
      await pool.query(
        `UPDATE communications SET delivery_status = $1 WHERE id = $2`,
        [deliveryStatus, commId]
      );
    } else {
      // Resend email id format
      await pool.query(
        `UPDATE communications SET delivery_status = $1 WHERE resend_id = $2`,
        [deliveryStatus, commId]
      );
    }
    logger.info({ commId, deliveryStatus }, 'Delivery status updated');
  } catch (err) {
    logger.error({ err, commId }, 'resend webhook DB error');
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ ok: true });
});

export default router;
