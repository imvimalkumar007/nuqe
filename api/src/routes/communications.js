import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  const { case_id } = req.query;

  if (!case_id) {
    return res.status(400).json({ message: 'case_id query parameter is required' });
  }

  try {
    const result = await pool.query(
      `SELECT
        id,
        case_id,
        direction,
        channel,
        body,
        external_ref AS sender_ref,
        created_at
      FROM communications
      WHERE case_id = $1
      ORDER BY created_at ASC`,
      [case_id]
    );

    res.json({
      communications: result.rows,
      total: result.rows.length,
    });
  } catch (err) {
    console.error('GET /communications error:', err);
    res.status(500).json({ message: 'Failed to fetch communications', error: err.message });
  }
});

export default router;
