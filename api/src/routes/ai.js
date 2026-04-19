import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// GET /?status=pending&limit=50&offset=0
router.get('/', async (req, res) => {
  const { status, limit = '50', offset = '0' } = req.query;
  const cap  = Math.min(Math.max(parseInt(limit,  10) || 50, 1), 200);
  const skip = Math.max(parseInt(offset, 10) || 0, 0);

  try {
    const params = [cap, skip];
    const where  = status ? 'WHERE status = $3' : '';
    if (status) params.push(status);

    const { rows } = await pool.query(
      `SELECT * FROM ai_actions ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('[ai-actions GET]', err.message);
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

router.patch('/:id/review', async (req, res) => {
  const { id } = req.params;
  const { status, human_output, reviewer_id } = req.body;

  // ── Input validation ────────────────────────────────────────────────────
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
  }
  if (status === 'approved' && (human_output == null || human_output === '')) {
    return res.status(400).json({ error: 'human_output is required when approving' });
  }
  if (!reviewer_id) {
    return res.status(400).json({ error: 'reviewer_id is required' });
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
    console.error('[ai-actions/review]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
