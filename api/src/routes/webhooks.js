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

const contactSchema = z.object({
  externalId:    z.string().min(1),
  createdAt:     z.string().optional(),
  channel:       z.string().min(1),
  source:        z.string().optional(),
  status:        z.string().optional(),
  priority:      z.string().optional(),
  customerName:  z.string().optional().nullable(),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional().nullable(),
  loanId:        z.string().optional().nullable(),
  customerType:  z.string().optional().nullable(),
  subject:       z.string().optional().nullable(),
  body:          z.string().min(1),
  _quido:        z.record(z.unknown()).optional(),
});

const router = Router();

// ─── Auth guards ──────────────────────────────────────────────────────────────

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

function requireBearerSecret(req, res, next) {
  const secret = process.env.QUIDO_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('webhooks QUIDO_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  const auth = req.headers['authorization'] ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== secret) {
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

// ─── POST /api/v1/webhooks/contact ───────────────────────────────────────────
// Quido contact-form submissions (camelCase payload, Bearer auth)

router.post('/contact', requireBearerSecret, validate(contactSchema), async (req, res) => {
  const {
    externalId, customerEmail, customerName, customerPhone,
    loanId, subject, body, channel: rawChannel,
    source, status, priority, customerType, _quido,
  } = req.body;

  // Map Quido channel values to our internal enum
  const CHANNEL_MAP = {
    web_contact_form: 'email',
    email:            'email',
    chat:             'chat',
    live_chat:        'chat',
    postal:           'postal',
    post:             'postal',
  };
  const channel = CHANNEL_MAP[rawChannel] ?? 'email';

  const client = await pool.connect();
  let comm;
  try {
    await client.query('BEGIN');

    // Upsert customer
    let customer;
    {
      const { rows } = await client.query(
        `SELECT * FROM customers WHERE email = $1 LIMIT 1`,
        [customerEmail.toLowerCase().trim()]
      );
      customer = rows[0] ?? null;
    }

    if (!customer) {
      const { rows } = await client.query(
        `INSERT INTO customers (full_name, email, jurisdiction, external_ref)
         VALUES ($1, $2, 'UK', $3) RETURNING *`,
        [customerName ?? customerEmail, customerEmail.toLowerCase().trim(), loanId ?? null]
      );
      customer = rows[0];
      await writeAudit(client, {
        entityType: 'customer', entityId: customer.id, action: 'created',
        newValue: { source: 'quido_contact', email: customer.email, loan_id: loanId },
      });
    } else if (loanId && customer.external_ref !== loanId) {
      await client.query(
        `UPDATE customers SET external_ref = $1, updated_at = NOW() WHERE id = $2`,
        [loanId, customer.id]
      );
    }

    // Build communication body
    const body_plain = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const metadata = {
      source,
      priority,
      customer_type: customerType,
      phone: customerPhone ?? null,
      quido: _quido ?? null,
    };

    const { rows } = await client.query(
      `INSERT INTO communications
         (customer_id, channel, direction, subject, body, body_plain,
          author_type, external_ref, metadata)
       VALUES ($1, $2, 'inbound', $3, $4, $5, 'customer', $6, $7::jsonb) RETURNING *`,
      [customer.id, channel, subject ?? null, body, body_plain,
       externalId, JSON.stringify(metadata)]
    );
    comm = rows[0];

    await writeAudit(client, {
      entityType: 'communication', entityId: comm.id, action: 'created',
      newValue: { source: 'quido_contact', channel, customer_id: customer.id, subject },
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    logger.error({ err }, 'webhooks/contact DB error');
    return res.status(500).json({ error: 'Internal server error' });
  }
  client.release();

  // Always run AI classification — let the engine decide if it's a complaint
  let caseId = null;
  try {
    const result = await classifyCommunication(comm.id);
    if (result.classification === 'complaint' || result.classification === 'implicit_complaint') {
      const { rows } = await pool.query(
        `SELECT case_id FROM communications WHERE id = $1`, [comm.id]
      );
      caseId = rows[0]?.case_id ?? null;
    }
  } catch (err) {
    logger.error({ err }, 'webhooks/contact classification error');
  }

  return res.status(200).json({ communication_id: comm.id, case_id: caseId });
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
