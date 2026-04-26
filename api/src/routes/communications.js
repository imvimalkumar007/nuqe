import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { sendEmail } from '../services/emailService.js';
import logger from '../logger.js';

const ORG_ID = '10000000-0000-0000-0000-000000000001';

const createCommSchema = z.object({
  case_id:     z.string().uuid(),
  channel:     z.enum(['email', 'chat', 'postal', 'phone', 'portal']),
  direction:   z.enum(['inbound', 'outbound']),
  body:        z.string().min(1),
  author_type: z.enum(['customer', 'staff', 'ai_draft', 'system']),
  subject:     z.string().optional().nullable(),
});

const router = Router();

router.get('/', async (req, res) => {
  const { case_id, limit = 50, offset = 0 } = req.query;

  if (!case_id) {
    return res.status(400).json({ error: 'case_id query parameter is required' });
  }

  try {
    const result = await pool.query(
      `SELECT
        id, case_id, customer_id, channel, direction,
        subject, body, author_type, author_id,
        ai_generated, ai_approved_by, ai_approved_at,
        sent_at, external_ref, created_at,
        COUNT(*) OVER ()::int AS total_count
       FROM communications
       WHERE case_id = $1
       ORDER BY sent_at ASC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [case_id, parseInt(limit), parseInt(offset)]
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
  const { case_id, channel, direction, subject, body, author_type } = req.body;
  try {
    const { rows: caseRows } = await pool.query(
      `SELECT c.customer_id, cu.email AS customer_email, cu.full_name AS customer_name,
              c.case_ref
       FROM cases c
       JOIN customers cu ON cu.id = c.customer_id
       WHERE c.id = $1`,
      [case_id]
    );
    if (!caseRows.length) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const { customer_id, customer_email, customer_name, case_ref } = caseRows[0];

    const { rows } = await pool.query(
      `INSERT INTO communications (case_id, customer_id, channel, direction, subject, body, author_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [case_id, customer_id, channel, direction, subject ?? null, body, author_type]
    );

    // Fire email for outbound email channel if customer has an address
    if (channel === 'email' && direction === 'outbound' && customer_email) {
      const orgRows = await pool.query(
        `SELECT from_email FROM organisation_ai_config WHERE organisation_id = $1`,
        [ORG_ID]
      );
      const fromEmail = orgRows.rows[0]?.from_email ?? process.env.FROM_EMAIL;
      sendEmail({
        to:      customer_email,
        from:    fromEmail,
        subject: subject ?? `Re: your complaint ${case_ref}`,
        text:    body,
      }).catch((err) => logger.error({ err, case_id }, 'Background email send failed'));
    }

    return res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'POST /communications failed');
    res.status(500).json({ error: 'Failed to create communication' });
  }
});

export default router;
