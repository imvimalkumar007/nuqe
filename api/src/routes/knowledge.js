import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { propagateKnowledgeUpdate } from '../engines/regulatoryMonitor.js';
import { validate } from '../middleware/validate.js';
import logger from '../logger.js';

const reviewSchema = z.object({
  status:      z.enum(['active', 'archived']),
  reviewer_id: z.string().min(1),
  note:        z.string().optional().nullable(),
});

const router = Router();

// ─── GET / ────────────────────────────────────────────────────────────────────
// Filters: status, jurisdiction, namespace, days (for superseded), limit, offset
router.get('/', async (req, res) => {
  const {
    status,
    jurisdiction,
    namespace,
    days,
    limit   = '50',
    offset  = '0',
  } = req.query;

  const cap  = Math.min(Math.max(parseInt(limit,  10) || 50, 1), 200);
  const skip = Math.max(parseInt(offset, 10) || 0, 0);

  const conditions = [];
  const params = [cap, skip];

  if (status) {
    params.push(status);
    conditions.push(`kc.status = $${params.length}`);
  }
  if (jurisdiction) {
    params.push(jurisdiction);
    conditions.push(`kc.jurisdiction = $${params.length}`);
  }
  if (namespace) {
    params.push(namespace);
    conditions.push(`kc.namespace = $${params.length}`);
  }
  if (days && status === 'superseded') {
    params.push(parseInt(days, 10) || 30);
    conditions.push(`kc.effective_to >= NOW() - ($${params.length} || ' days')::INTERVAL`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT kc.*,
              rs.name  AS source_name,
              rs.url   AS source_url,
              sk.title AS superseded_by_title
       FROM knowledge_chunks kc
       LEFT JOIN regulatory_sources  rs ON rs.id = kc.source_id
       LEFT JOIN knowledge_chunks    sk ON sk.id = kc.superseded_by
       ${where}
       ORDER BY kc.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'GET /knowledge-chunks failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /:id/review ────────────────────────────────────────────────────────
// Approve (status → active) or reject (status → archived) a pending_review chunk.
// Approving triggers propagateKnowledgeUpdate to find and supersede stale content.
router.patch('/:id/review', validate(reviewSchema), async (req, res) => {
  const { id } = req.params;
  const { status, reviewer_id, note } = req.body;

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT * FROM knowledge_chunks WHERE id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'knowledge_chunk not found' });
    const chunk = rows[0];

    if (chunk.status !== 'pending_review') {
      return res.status(409).json({ error: `chunk is already '${chunk.status}'` });
    }

    const { rows: updated } = await client.query(
      `UPDATE knowledge_chunks
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    await client.query(
      `INSERT INTO audit_log
         (entity_type, entity_id, action, actor_type, actor_id, previous_value, new_value)
       VALUES ('knowledge_chunk', $1, 'reviewed', 'staff', $2, $3, $4)`,
      [
        id,
        reviewer_id,
        JSON.stringify({ status: 'pending_review' }),
        JSON.stringify({ status, reviewer_id, note: note ?? null }),
      ]
    );

    client.release();

    // Propagate supersessions asynchronously — don't block the response
    if (status === 'active') {
      setImmediate(() => {
        propagateKnowledgeUpdate(id).catch((err) =>
          logger.error({ err }, 'knowledge/review propagate failed')
        );
      });
    }

    return res.json(updated[0]);
  } catch (err) {
    client.release();
    logger.error({ err }, 'PATCH /knowledge-chunks/:id/review failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
