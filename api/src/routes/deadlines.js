import { Router } from 'express';
import { pool } from '../db/pool.js';
import logger from '../logger.js';

const router = Router();

router.get('/', async (req, res) => {
  const { case_id } = req.query;

  if (!case_id) {
    return res.status(400).json({ error: 'case_id query parameter is required' });
  }

  try {
    const result = await pool.query(
      `SELECT
        id, case_id, ruleset_id, deadline_type, due_at,
        alerted_at_5d, alerted_at_48h, alerted_at_24h,
        met_at, breached, breached_at, breach_reason,
        created_at, updated_at
       FROM deadlines
       WHERE case_id = $1
       ORDER BY due_at ASC`,
      [case_id]
    );

    res.json({ deadlines: result.rows });
  } catch (err) {
    logger.error({ err }, 'GET /deadlines failed');
    res.status(500).json({ error: 'Failed to fetch deadlines' });
  }
});

export default router;
