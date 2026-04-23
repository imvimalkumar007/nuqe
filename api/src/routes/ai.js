import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import logger from '../logger.js';

const reviewAiSchema = z.object({
  status:       z.enum(['approved', 'rejected']),
  human_output: z.string().optional().nullable(),
  reviewer_id:  z.string().min(1),
});

const rejectAiSchema = z.object({
  reason: z.string().optional().nullable(),
});

const router = Router();

// GET /?status=pending&case_id=<uuid>&limit=50&offset=0
router.get('/', async (req, res) => {
  const { status, case_id, caseId, limit = '50', offset = '0' } = req.query;
  const cap      = Math.min(Math.max(parseInt(limit,  10) || 50, 1), 200);
  const skip     = Math.max(parseInt(offset, 10) || 0, 0);
  const caseFilter = case_id ?? caseId;

  try {
    const params = [cap, skip];
    const conditions = [];
    if (status)     { params.push(status);     conditions.push(`status = $${params.length}`); }
    if (caseFilter) { params.push(caseFilter); conditions.push(`case_id = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT * FROM ai_actions ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      params
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'ai-actions GET failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /:id/review ────────────────────────────────────────────────────────
// Human review gate for any pending ai_action.
// reviewer_id should come from JWT auth middleware once auth is built —
// accepted in body here for the pre-auth phase only.

const CLASSIFICATION_TYPES = new Set([
  'complaint_classification',
  'implicit_complaint_detection',
]);

router.patch('/:id/review', validate(reviewAiSchema), async (req, res) => {
  const { id } = req.params;
  const { status, human_output, reviewer_id } = req.body;

  if (status === 'approved' && (human_output == null || human_output === '')) {
    return res.status(400).json({ error: 'human_output is required when approving' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Fetch and lock the action ───────────────────────────────────────
    const { rows } = await client.query(
      'SELECT * FROM ai_actions WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ai_action not found' });
    }
    const action = rows[0];
    if (action.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `action is already '${action.status}'` });
    }

    // ── Derive update fields ────────────────────────────────────────────
    const wasEdited =
      status === 'approved' &&
      human_output != null &&
      human_output !== action.ai_output;

    // For classification actions human_output carries the label, not prose
    const humanClassification =
      CLASSIFICATION_TYPES.has(action.action_type) && status === 'approved'
        ? human_output
        : null;

    // ── Update ai_action ────────────────────────────────────────────────
    const { rows: updated } = await client.query(
      `UPDATE ai_actions
       SET status               = $1,
           human_output         = $2,
           was_edited           = $3,
           human_classification = $4,
           reviewed_by          = $5,
           reviewed_at          = NOW()
       WHERE id = $6
       RETURNING *`,
      [status, human_output ?? null, wasEdited, humanClassification, reviewer_id, id]
    );
    const reviewedAction = updated[0];

    // ── Audit row 1: the review event ───────────────────────────────────
    await client.query(
      `INSERT INTO audit_log
         (entity_type, entity_id, action, actor_type, actor_id, previous_value, new_value)
       VALUES ('ai_action', $1, 'reviewed', 'staff', $2, $3, $4)`,
      [
        id,
        reviewer_id,
        JSON.stringify({ status: 'pending' }),
        JSON.stringify({ status, was_edited: wasEdited, human_classification: humanClassification }),
      ]
    );

    // ── Audit row 2: the human decision ────────────────────────────────
    await client.query(
      `INSERT INTO audit_log
         (entity_type, entity_id, action, actor_type, actor_id, new_value)
       VALUES ('ai_action', $1, $2, 'staff', $3, $4)`,
      [
        id,
        `human_decision_${status}`,
        reviewer_id,
        JSON.stringify({
          action_type: action.action_type,
          human_classification: humanClassification,
          was_edited: wasEdited,
        }),
      ]
    );

    // ── If approved response_draft: write outbound communication ───────
    if (status === 'approved' && action.action_type === 'response_draft') {
      const { rows: caseRows } = await client.query(
        'SELECT customer_id, channel_received FROM cases WHERE id = $1',
        [action.case_id]
      );
      if (caseRows.length) {
        const { customer_id, channel_received } = caseRows[0];
        const channel = ['email', 'chat', 'postal'].includes(channel_received)
          ? channel_received
          : 'email';

        // Extract subject from ai_output JSON if the draft engine stored it
        let subject = null;
        try {
          const parsed = JSON.parse(action.ai_output);
          if (parsed.subject) subject = parsed.subject;
        } catch { /* ai_output was plain text */ }

        await client.query(
          `INSERT INTO communications
             (case_id, customer_id, channel, direction, subject, body, body_plain,
              author_type, author_id, ai_generated, ai_approved_by, ai_approved_at)
           VALUES ($1, $2, $3, 'outbound', $4, $5, $5, 'ai_draft', $6, TRUE, $6, NOW())`,
          [action.case_id, customer_id, channel, subject, human_output, reviewer_id]
        );
      }
    }

    await client.query('COMMIT');
    return res.json(reviewedAction);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'ai-actions review failed');
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ─── PATCH /:id/approve ───────────────────────────────────────────────────────

router.patch('/:id/approve', async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT id FROM ai_actions WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ai_action not found' });
    }

    const { rows: updated } = await client.query(
      `UPDATE ai_actions
       SET status      = 'approved',
           reviewed_at = NOW(),
           reviewed_by = NULL
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    await client.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_type, actor_id, new_value)
       VALUES ('ai_action', $1, 'approved', 'staff', NULL, NULL)`,
      [id]
    );

    await client.query('COMMIT');
    return res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'ai-actions approve failed');
    return res.status(500).json({ message: 'Failed to approve action', error: err.message });
  } finally {
    client.release();
  }
});

// ─── PATCH /:id/reject ────────────────────────────────────────────────────────

router.patch('/:id/reject', validate(rejectAiSchema), async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT id FROM ai_actions WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ai_action not found' });
    }

    const { rows: updated } = await client.query(
      `UPDATE ai_actions
       SET status      = 'rejected',
           reviewed_at = NOW(),
           reviewed_by = NULL,
           review_note = $2
       WHERE id = $1
       RETURNING *`,
      [id, reason ?? null]
    );

    await client.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_type, actor_id, new_value)
       VALUES ('ai_action', $1, 'rejected', 'staff', NULL, $2)`,
      [id, reason ? JSON.stringify({ detail: reason }) : null]
    );

    await client.query('COMMIT');
    return res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'ai-actions reject failed');
    return res.status(500).json({ message: 'Failed to reject action', error: err.message });
  } finally {
    client.release();
  }
});

export default router;
