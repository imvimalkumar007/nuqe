import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { calculateDeadlines } from '../engines/deadlineEngine.js';
import { validate } from '../middleware/validate.js';

const createCaseSchema = z.object({
  customer_id:      z.string().uuid(),
  category:         z.string().min(1),
  channel_received: z.string().min(1),
  ruleset_id:       z.string().uuid().optional().nullable(),
  notes:            z.string().optional().nullable(),
});

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
        c.id,
        c.id AS case_id,
        c.case_ref,
        c.customer_id,
        cu.full_name AS customer_name,
        c.category,
        c.channel_received,
        c.status,
        c.opened_at,
        c.created_at,
        r.jurisdiction,
        MIN(d.due_at) AS disp_deadline,
        COUNT(*) OVER ()::int AS total_count
      FROM cases c
      LEFT JOIN customers cu ON cu.id = c.customer_id
      LEFT JOIN ruleset r ON r.id = c.ruleset_id
      LEFT JOIN deadlines d ON d.case_id = c.id AND d.met_at IS NULL
      ${where}
      GROUP BY c.id, cu.full_name, r.jurisdiction
      ORDER BY c.opened_at DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `;

    const result = await pool.query(query, values);

    res.json({
      cases: result.rows,
      total: result.rows[0]?.total_count ?? 0,
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

router.post('/', validate(createCaseSchema), async (req, res) => {
  const { customer_id, category, channel_received, ruleset_id, notes } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO cases (customer_id, category, channel_received, ruleset_id, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [customer_id, category, channel_received, ruleset_id ?? null, notes ?? null]
    );

    const newCase = rows[0];
    await calculateDeadlines(newCase.id);

    return res.status(201).json(newCase);
  } catch (err) {
    console.error('[cases/POST]', err.message);
    res.status(500).json({ error: 'Failed to create case' });
  }
});

export default router;
