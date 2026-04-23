import { Router } from 'express';
import { pool } from '../db/pool.js';
import { getModelComparisonMetrics } from '../engines/metricsEngine.js';

const router = Router();

const OPEN_STATUSES = ['open', 'under_review', 'pending_response', 'awaiting_customer'];
const CLOSED_STATUSES = ['closed_upheld', 'closed_not_upheld', 'closed_withdrawn'];

// GET /api/v1/metrics/ai-accuracy?dateFrom=&dateTo=
router.get('/ai-accuracy', async (req, res) => {
  const { dateFrom, dateTo } = req.query;

  const now      = new Date();
  const dfltFrom = new Date(now);
  dfltFrom.setDate(dfltFrom.getDate() - 30);

  const from = dateFrom ? new Date(dateFrom) : dfltFrom;
  const to   = dateTo   ? new Date(dateTo)   : now;

  try {
    const [summaryRes, byTypeRes, casesRes, breachRes, resolutionRes] = await Promise.all([

      // 1. AI action summary filtered by date range
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'pending')::int  AS pending,
          COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
          COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE status = 'approved')
            / NULLIF(COUNT(*) FILTER (WHERE status IN ('approved','rejected')), 0),
            1
          ) AS approval_rate,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE status = 'rejected')
            / NULLIF(COUNT(*) FILTER (WHERE status IN ('approved','rejected')), 0),
            1
          ) AS rejection_rate
        FROM ai_actions
        WHERE created_at >= $1 AND created_at <= $2
      `, [from, to]),

      // 2. Per-action_type breakdown filtered by date range
      pool.query(`
        SELECT
          action_type,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
          COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE status = 'approved')
            / NULLIF(COUNT(*) FILTER (WHERE status IN ('approved','rejected')), 0),
            1
          ) AS approval_rate
        FROM ai_actions
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY action_type
        ORDER BY total DESC
      `, [from, to]),

      // 3a. Case status counts (current snapshot, no date filter)
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = ANY($1::text[]))::int AS open,
          COUNT(*) FILTER (WHERE status = 'fos_referred')::int  AS fos_referred,
          COUNT(*) FILTER (WHERE status != ALL($2::text[]))::int AS total_active
        FROM cases
      `, [OPEN_STATUSES, CLOSED_STATUSES]),

      // 3b. Breach risk: open cases whose nearest unmet deadline falls within 48 h
      pool.query(`
        SELECT COUNT(*)::int AS breach_risk
        FROM (
          SELECT c.id
          FROM cases c
          JOIN deadlines d ON d.case_id = c.id AND d.met_at IS NULL
          WHERE c.status = ANY($1::text[])
          GROUP BY c.id
          HAVING MIN(d.due_at) <= NOW() + INTERVAL '48 hours'
        ) sub
      `, [OPEN_STATUSES]),

      // 4. Average resolution time for cases closed within the date range
      pool.query(`
        SELECT ROUND(
          AVG(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 86400)::numeric, 1
        ) AS avg_resolution_days
        FROM cases
        WHERE closed_at IS NOT NULL
          AND closed_at >= $1 AND closed_at <= $2
      `, [from, to]),
    ]);

    const s = summaryRes.rows[0];
    const c = casesRes.rows[0];

    res.json({
      date_from: from.toISOString(),
      date_to:   to.toISOString(),
      ai_actions: {
        total:          s.total,
        pending:        s.pending,
        approved:       s.approved,
        rejected:       s.rejected,
        approval_rate:  s.approval_rate  !== null ? parseFloat(s.approval_rate)  : null,
        rejection_rate: s.rejection_rate !== null ? parseFloat(s.rejection_rate) : null,
      },
      by_action_type: byTypeRes.rows.map((r) => ({
        action_type:   r.action_type,
        total:         r.total,
        approved:      r.approved,
        rejected:      r.rejected,
        approval_rate: r.approval_rate !== null ? parseFloat(r.approval_rate) : null,
      })),
      cases: {
        open:         c.open,
        fos_referred: c.fos_referred,
        breach_risk:  breachRes.rows[0].breach_risk,
        total_active: c.total_active,
      },
      avg_resolution_days: resolutionRes.rows[0].avg_resolution_days !== null
        ? parseFloat(resolutionRes.rows[0].avg_resolution_days)
        : null,
    });
  } catch (err) {
    console.error('[metrics/ai-accuracy]', err.message);
    res.status(500).json({ message: 'Failed to fetch metrics', error: err.message });
  }
});

// GET /api/v1/metrics/dashboard-summary
router.get('/dashboard-summary', async (_req, res) => {
  try {
    const [breach, underReview, open, fos] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS count FROM cases c
        JOIN deadlines d ON d.case_id = c.id
        WHERE c.status IN ('open', 'under_review')
          AND d.deadline_type = 'FINAL_RESPONSE'
          AND d.due_at <= NOW() + INTERVAL '48 hours'
          AND d.breached = false
          AND d.met_at IS NULL
      `),
      pool.query(`SELECT COUNT(*)::int AS count FROM cases WHERE status = 'under_review'`),
      pool.query(`SELECT COUNT(*)::int AS count FROM cases WHERE status = 'open'`),
      pool.query(`SELECT COUNT(*)::int AS count FROM cases WHERE status = 'fos_referred'`),
    ]);
    res.json({
      breach_risk_count:  breach.rows[0].count,
      under_review_count: underReview.rows[0].count,
      open_count:         open.rows[0].count,
      fos_referred_count: fos.rows[0].count,
    });
  } catch (err) {
    console.error('[metrics/dashboard-summary]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/metrics/model-comparison?organisationId=&dateFrom=&dateTo=
router.get('/model-comparison', async (req, res) => {
  const { organisationId, dateFrom, dateTo } = req.query;
  try {
    const data = await getModelComparisonMetrics(organisationId, dateFrom, dateTo);
    res.json(data);
  } catch (err) {
    console.error('[metrics/model-comparison]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
