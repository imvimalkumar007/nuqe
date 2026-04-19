import { Router } from 'express';
import { pool } from '../db/pool.js';
import { checkSources } from '../engines/regulatoryMonitor.js';

const router = Router();

// ─── GET /sources ─────────────────────────────────────────────────────────────
// Returns all sources enriched with: last log entry, docs ingested this month.
router.get('/sources', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         rs.*,
         log_latest.checked_at         AS last_check_at,
         log_latest.documents_ingested  AS last_check_ingested,
         log_latest.error               AS last_check_error,
         COALESCE(monthly.ingested, 0)  AS ingested_this_month
       FROM regulatory_sources rs
       LEFT JOIN LATERAL (
         SELECT checked_at, documents_ingested, error
         FROM regulatory_monitoring_log
         WHERE source_id = rs.id
         ORDER BY checked_at DESC
         LIMIT 1
       ) log_latest ON TRUE
       LEFT JOIN LATERAL (
         SELECT SUM(documents_ingested) AS ingested
         FROM regulatory_monitoring_log
         WHERE source_id = rs.id
           AND checked_at >= DATE_TRUNC('month', NOW())
       ) monthly ON TRUE
       ORDER BY rs.jurisdiction, rs.name`
    );
    res.json(rows);
  } catch (err) {
    console.error('[regulatory/sources GET]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /sources/:id ───────────────────────────────────────────────────────
// Toggle is_active or update check_frequency_hours.
router.patch('/sources/:id', async (req, res) => {
  const { id } = req.params;
  const { is_active, check_frequency_hours } = req.body;

  const sets = [];
  const params = [];

  if (is_active != null) {
    params.push(is_active);
    sets.push(`is_active = $${params.length}`);
  }
  if (check_frequency_hours != null) {
    params.push(Math.max(1, parseInt(check_frequency_hours, 10)));
    sets.push(`check_frequency_hours = $${params.length}`);
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }

  params.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE regulatory_sources SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length}
       RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Source not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[regulatory/sources PATCH]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /sources/:id/check ──────────────────────────────────────────────────
// Manually trigger an immediate check for a single source.
router.post('/sources/:id/check', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT jurisdiction FROM regulatory_sources WHERE id = $1 AND is_active = TRUE`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Active source not found' });

    // Run async — return immediately so the UI is not blocked
    setImmediate(() => {
      checkSources([rows[0].jurisdiction]).catch((err) =>
        console.error('[regulatory/sources/check]', err.message)
      );
    });

    res.json({ queued: true });
  } catch (err) {
    console.error('[regulatory/sources/check POST]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
