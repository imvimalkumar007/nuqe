import { Router } from 'express';
import { pool } from '../db/pool.js';

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
    console.error('[communications/GET]', err.message);
    res.status(500).json({ error: 'Failed to fetch communications' });
  }
});

router.post('/', async (req, res) => {
  const { case_id, channel, direction, subject, body, author_type } = req.body ?? {};

  if (!case_id || !channel || !direction || !body || !author_type) {
    return res.status(400).json({ error: 'case_id, channel, direction, body, and author_type are required' });
  }

  try {
    const { rows: caseRows } = await pool.query(
      'SELECT customer_id FROM cases WHERE id = $1',
      [case_id]
    );
    if (!caseRows.length) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const { customer_id } = caseRows[0];

    const { rows } = await pool.query(
      `INSERT INTO communications (case_id, customer_id, channel, direction, subject, body, author_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [case_id, customer_id, channel, direction, subject ?? null, body, author_type]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[communications/POST]', err.message);
    res.status(500).json({ error: 'Failed to create communication' });
  }
});

export default router;
