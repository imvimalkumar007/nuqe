import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { sendViaChannel } from '../services/smtpService.js';
import logger from '../logger.js';

const ORG_ID = '10000000-0000-0000-0000-000000000001';

const createCommSchema = z.object({
  case_id:     z.string().uuid(),
  channel:     z.enum(['email', 'chat', 'postal', 'phone', 'portal']),
  direction:   z.enum(['inbound', 'outbound', 'internal']),
  body:        z.string().min(1),
  author_type: z.enum(['customer', 'staff', 'ai_draft', 'system']),
  subject:     z.string().optional().nullable(),
  cc:          z.array(z.string().email()).optional().nullable(),
  bcc:         z.array(z.string().email()).optional().nullable(),
  is_internal: z.boolean().optional().default(false),
});

const router = Router();

router.get('/', async (req, res) => {
  const { case_id, limit = 50, offset = 0, include_internal = 'true' } = req.query;

  if (!case_id) {
    return res.status(400).json({ error: 'case_id query parameter is required' });
  }

  try {
    const result = await pool.query(
      `SELECT
        id, case_id, customer_id, channel, direction,
        subject, body, body_plain, author_type, author_id,
        ai_generated, ai_approved_by, ai_approved_at,
        cc, bcc, message_id, in_reply_to, delivery_status, is_internal,
        sent_at, external_ref, created_at,
        COUNT(*) OVER ()::int AS total_count
       FROM communications
       WHERE case_id = $1
         AND ($4 = 'true' OR is_internal = FALSE)
       ORDER BY COALESCE(sent_at, created_at) ASC
       LIMIT $2 OFFSET $3`,
      [case_id, parseInt(limit), parseInt(offset), include_internal]
    );

    res.json({
      communications: result.rows,
      total: result.rows[0]?.total_count ?? 0,
    });
  } catch (err) {
    logger.error({ err }, 'GET /communications failed');
    res.status(500).json({ error: 'Failed to fetch communications' });
  }
});

router.post('/', validate(createCommSchema), async (req, res) => {
  const { case_id, channel, direction, subject, body, author_type, cc, bcc, is_internal } = req.body;

  // Internal notes: always stored, never emailed
  const effectiveDirection = is_internal ? 'internal' : direction;

  try {
    const { rows: caseRows } = await pool.query(
      `SELECT c.customer_id, cu.email AS customer_email, c.case_ref,
              ch.id AS ch_id, ch.smtp_host, ch.smtp_port, ch.smtp_username,
              ch.smtp_password, ch.smtp_from, ch.smtp_tls, ch.inbound_email
       FROM cases c
       JOIN customers cu ON cu.id = c.customer_id
       LEFT JOIN channels ch ON ch.id = c.channel_id
       WHERE c.id = $1`,
      [case_id]
    );
    if (!caseRows.length) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const { customer_id, customer_email, case_ref } = caseRows[0];
    const channelRow = caseRows[0].ch_id ? {
      id:            caseRows[0].ch_id,
      smtp_host:     caseRows[0].smtp_host,
      smtp_port:     caseRows[0].smtp_port,
      smtp_username: caseRows[0].smtp_username,
      smtp_password: caseRows[0].smtp_password,
      smtp_from:     caseRows[0].smtp_from,
      smtp_tls:      caseRows[0].smtp_tls,
      inbound_email: caseRows[0].inbound_email,
    } : null;

    // Generate a RFC Message-ID for outbound emails so inbound replies can thread
    const messageId = (channel === 'email' && effectiveDirection === 'outbound')
      ? `<nuqe-${Date.now()}-${Math.random().toString(36).slice(2)}@nuqe.io>`
      : null;

    const body_plain = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    const { rows } = await pool.query(
      `INSERT INTO communications
         (case_id, customer_id, channel, direction, subject, body, body_plain,
          author_type, cc, bcc, message_id, is_internal, delivery_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               CASE WHEN $4 = 'outbound' AND $3 = 'email' THEN 'sent' ELSE NULL END)
       RETURNING *`,
      [case_id, customer_id, channel, effectiveDirection, subject ?? null,
       body, body_plain, author_type,
       cc ?? null, bcc ?? null, messageId, is_internal ?? false]
    );
    const comm = rows[0];

    // Fire email for outbound email channel
    if (channel === 'email' && effectiveDirection === 'outbound' && !is_internal && customer_email) {
      sendViaChannel(channelRow, {
        to:        customer_email,
        subject:   subject ?? `Re: your complaint ${case_ref}`,
        text:      body_plain,
        html:      body,
        cc:        cc ?? undefined,
        bcc:       bcc ?? undefined,
        commId:    comm.id,
        messageId: messageId ?? undefined,
      }).then(async (result) => {
        if (result?.id) {
          await pool.query(
            `UPDATE communications SET resend_id = $1 WHERE id = $2`,
            [result.id, comm.id]
          );
        }
      }).catch((err) => logger.error({ err, case_id }, 'Background email send failed'));
    }

    return res.status(201).json(comm);
  } catch (err) {
    logger.error({ err }, 'POST /communications failed');
    res.status(500).json({ error: 'Failed to create communication' });
  }
});

export default router;
