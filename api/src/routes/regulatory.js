import { Router } from 'express';
import { pool } from '../db/pool.js';
import { checkSources, getMonitoringHealth } from '../engines/regulatoryMonitor.js';

const router = Router();

// ─── GET /sources ─────────────────────────────────────────────────────────────
router.get('/sources', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         id, name, jurisdiction, source_type, url, is_active,
         last_checked_at,
         updated_at AS last_changed_at,
         created_at
       FROM regulatory_sources
       ORDER BY jurisdiction ASC, name ASC`
    );
    res.json({ sources: rows });
  } catch (err) {
    console.error('[regulatory/sources GET]', err.message);
    res.status(500).json({ message: 'Failed to fetch sources', error: err.message });
  }
});

// ─── GET /health ──────────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  try {
    const health = await getMonitoringHealth();
    res.json(health);
  } catch (err) {
    console.error('[regulatory/health GET]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /recent-changes ──────────────────────────────────────────────────────
// Returns audit_log entries for knowledge_chunk review/supersession in last 30 days.
router.get('/recent-changes', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 200);
  try {
    const { rows } = await pool.query(
      `SELECT
         al.id,
         al.entity_id,
         al.action,
         al.new_value,
         al.created_at,
         kc.title       AS chunk_title,
         kc.jurisdiction,
         kc.document_type,
         kc.status      AS chunk_status
       FROM audit_log al
       LEFT JOIN knowledge_chunks kc ON kc.id = al.entity_id
       WHERE al.entity_type = 'knowledge_chunk'
         AND al.action IN ('auto_ingested', 'approved', 'rejected', 'superseded')
         AND al.created_at >= NOW() - INTERVAL '30 days'
       ORDER BY al.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    console.error('[regulatory/recent-changes GET]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /monitoring-log ─────────────────────────────────────────────────────
router.get('/monitoring-log', async (req, res) => {
  const { jurisdiction } = req.query;
  const limit  = Math.min(Math.max(parseInt(req.query.limit  ?? '50',  10) || 50,  1), 200);
  const offset = Math.max(parseInt(req.query.offset ?? '0', 10) || 0, 0);

  try {
    const { rows } = await pool.query(
      `SELECT
         l.id,
         rs.name        AS source_name,
         rs.jurisdiction,
         l.error        AS summary,
         NULL::text     AS status,
         l.checked_at   AS detected_at,
         NULL::timestamptz AS reviewed_at,
         NULL::text     AS reviewed_by,
         COUNT(*) OVER() AS total_count
       FROM regulatory_monitoring_log l
       JOIN regulatory_sources rs ON rs.id = l.source_id
       WHERE ($1::text IS NULL OR rs.jurisdiction = $1)
       ORDER BY l.checked_at DESC
       LIMIT $2 OFFSET $3`,
      [jurisdiction ?? null, limit, offset]
    );

    const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
    res.json({
      log:   rows.map(({ total_count, ...row }) => row),
      total,
    });
  } catch (err) {
    console.error('[regulatory/monitoring-log GET]', err.message);
    res.status(500).json({ message: 'Failed to fetch monitoring log', error: err.message });
  }
});

// ─── PATCH /monitoring-log/:id/approve ───────────────────────────────────────
router.patch('/monitoring-log/:id/approve', async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT
         l.id,
         rs.name        AS source_name,
         rs.jurisdiction,
         l.error        AS summary,
         NULL::text     AS status,
         l.checked_at   AS detected_at,
         NULL::timestamptz AS reviewed_at,
         NULL::text     AS reviewed_by
       FROM regulatory_monitoring_log l
       JOIN regulatory_sources rs ON rs.id = l.source_id
       WHERE l.id = $1`,
      [id]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Monitoring log entry not found' });
    }

    await client.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_type, actor_id, new_value)
       VALUES ('regulatory_update', $1, 'approved', 'staff', NULL, NULL)`,
      [id]
    );

    await client.query('COMMIT');
    return res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[regulatory/monitoring-log/approve]', err.message);
    return res.status(500).json({ message: 'Failed to approve monitoring log entry', error: err.message });
  } finally {
    client.release();
  }
});

// ─── PATCH /sources/:id ───────────────────────────────────────────────────────
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
router.post('/sources/:id/check', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT jurisdiction FROM regulatory_sources WHERE id = $1 AND is_active = TRUE`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Active source not found' });

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
