import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;

  try {
    const conditions = [];
    const values = [];

    if (status) {
      values.push(status);
      conditions.push(`c.status = $${values.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    values.push(parseInt(limit));
    values.push(parseInt(offset));

    const query = `
      SELECT
        c.id AS case_id,
        c.case_ref,
        cu.full_name AS customer_name,
        c.category,
        c.channel_received,
        c.status,
        c.opened_at,
        c.created_at,
        MIN(d.due_at) AS disp_deadline
      FROM cases c
      LEFT JOIN customers cu ON cu.id = c.customer_id
      LEFT JOIN deadlines d ON d.case_id = c.id AND d.met_at IS NULL
      ${where}
      GROUP BY c.id, c.case_ref, cu.full_name, c.category, c.channel_received, c.status, c.opened_at, c.created_at
      ORDER BY c.created_at DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `;

    const result = await pool.query(query, values);

    res.json({
      cases: result.rows,
      total: result.rows.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (err) {
    console.error('GET /cases error:', err);
    res.status(500).json({ message: 'Failed to fetch cases', error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [caseResult, deadlinesResult, commResult] = await Promise.all([
      pool.query(
        `SELECT
          c.id AS case_id,
          c.case_ref,
          cu.full_name AS customer_name,
          cu.email AS customer_email,
          c.category,
          c.channel_received,
          c.status,
          c.opened_at,
          c.closed_at,
          c.fos_ref,
          c.notes,
          c.is_implicit,
          c.ai_detected,
          c.created_at,
          c.updated_at
        FROM cases c
        LEFT JOIN customers cu ON cu.id = c.customer_id
        WHERE c.id = $1`,
        [id]
      ),
      pool.query(
        `SELECT
          id, deadline_type, due_at, met_at, breached,
          alerted_at_5d, alerted_at_48h, alerted_at_24h
        FROM deadlines
        WHERE case_id = $1
        ORDER BY due_at ASC`,
        [id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS communication_count
        FROM communications
        WHERE case_id = $1`,
        [id]
      ),
    ]);

    if (caseResult.rows.length === 0) {
      return res.status(404).json({ message: 'Case not found' });
    }

    res.json({
      ...caseResult.rows[0],
      deadlines: deadlinesResult.rows,
      communication_count: commResult.rows[0].communication_count,
    });
  } catch (err) {
    console.error('GET /cases/:id error:', err);
    res.status(500).json({ message: 'Failed to fetch case', error: err.message });
  }
});

export default router;
