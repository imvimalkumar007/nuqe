import { pool } from '../db/pool.js';

// Clamp a date string to a safe default; expand end date to include the full day.
function bounds(from, to) {
  const f = from || '2000-01-01';
  const t = to   || new Date().toISOString().slice(0, 10);
  return [f, t];
}

function pct(num, denom) {
  if (!denom) return 0;
  return Math.round((num / denom) * 100);
}

function int(v) { return parseInt(v, 10) || 0; }
function flt(v) { return parseFloat(v)   || 0; }

// ─────────────────────────────────────────────────────────────────────────────
// getAiAccuracyMetrics(organisationId, dateFrom, dateTo)
//
// NOTE: ai_actions has no organisation_id column. The organisationId param is
// accepted for future use once a users/organisation mapping is added. All
// queries currently run across the full date window without an org filter.
// ─────────────────────────────────────────────────────────────────────────────
export async function getAiAccuracyMetrics(organisationId, dateFrom, dateTo) {
  const [from, to] = bounds(dateFrom, dateTo);
  const client = await pool.connect();
  try {
    // ── Overall totals ────────────────────────────────────────────────────
    const { rows: [ov] } = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('approved','rejected'))  AS total_reviewed,
         COUNT(*) FILTER (WHERE status = 'approved')                AS approved,
         COUNT(*) FILTER (WHERE status = 'approved' AND was_edited) AS edited,
         COUNT(*) FILTER (WHERE status = 'rejected')                AS rejected,
         ROUND(AVG(tokenisation_low_confidence_flags)::numeric, 2)  AS avg_low_conf
       FROM ai_actions
       WHERE created_at >= $1::date
         AND created_at <  $2::date + INTERVAL '1 day'`,
      [from, to]
    );

    const total    = int(ov.total_reviewed);
    const approved = int(ov.approved);
    const edited   = int(ov.edited);
    const rejected = int(ov.rejected);

    // ── Approval rate by action type ──────────────────────────────────────
    const { rows: byType } = await client.query(
      `SELECT
         action_type,
         COUNT(*) FILTER (WHERE status IN ('approved','rejected')) AS total,
         COUNT(*) FILTER (WHERE status = 'approved')               AS approved,
         COUNT(*) FILTER (WHERE status = 'rejected')               AS rejected
       FROM ai_actions
       WHERE created_at >= $1::date
         AND created_at <  $2::date + INTERVAL '1 day'
         AND status IN ('approved','rejected')
       GROUP BY action_type
       ORDER BY action_type`,
      [from, to]
    );

    // ── Classification accuracy ───────────────────────────────────────────
    const { rows: classAcc } = await client.query(
      `SELECT
         ai_classification                                                   AS category,
         COUNT(*)                                                            AS total,
         COUNT(*) FILTER (WHERE ai_classification = human_classification)   AS matches
       FROM ai_actions
       WHERE created_at >= $1::date
         AND created_at <  $2::date + INTERVAL '1 day'
         AND ai_classification   IS NOT NULL
         AND human_classification IS NOT NULL
       GROUP BY ai_classification
       ORDER BY ai_classification`,
      [from, to]
    );

    // ── Volume by day ─────────────────────────────────────────────────────
    const { rows: volByDay } = await client.query(
      `SELECT
         (created_at::date)::text AS date,
         COUNT(*)                 AS count
       FROM ai_actions
       WHERE created_at >= $1::date
         AND created_at <  $2::date + INTERVAL '1 day'
       GROUP BY created_at::date
       ORDER BY date`,
      [from, to]
    );

    return {
      overall_approval_rate:       pct(approved, total),
      edit_rate:                   pct(edited,   approved),
      rejection_rate:              pct(rejected,  total),
      total_reviewed:              total,
      average_low_confidence_flags: flt(ov.avg_low_conf),

      approval_rate_by_action_type: byType.map((r) => ({
        action_type:   r.action_type,
        total:         int(r.total),
        approved:      int(r.approved),
        rejected:      int(r.rejected),
        approval_rate: pct(int(r.approved), int(r.total)),
      })),

      classification_accuracy: classAcc.map((r) => ({
        category:     r.category,
        total:        int(r.total),
        matches:      int(r.matches),
        accuracy_pct: pct(int(r.matches), int(r.total)),
      })),

      volume_by_day: volByDay.map((r) => ({
        date:  r.date,
        count: int(r.count),
      })),
    };
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getModelComparisonMetrics(organisationId, dateFrom, dateTo)
//
// Returns one result object per distinct ai_provider + ai_model combination,
// each containing the same metric set as getAiAccuracyMetrics plus ab_split
// ('primary' | 'challenger') derived from the org's ai_config.
// ─────────────────────────────────────────────────────────────────────────────
export async function getModelComparisonMetrics(organisationId, dateFrom, dateTo) {
  const [from, to] = bounds(dateFrom, dateTo);
  const client = await pool.connect();
  try {
    // Load org config to determine primary vs challenger
    const { rows: cfgRows } = await client.query(
      `SELECT primary_provider, primary_model,
              challenger_provider, challenger_model
       FROM organisation_ai_config
       WHERE organisation_id = $1
       LIMIT 1`,
      [organisationId ?? '00000000-0000-0000-0000-000000000000']
    );
    const cfg = cfgRows[0] ?? null;

    // ── Per-model overall metrics ─────────────────────────────────────────
    const { rows: models } = await client.query(
      `SELECT
         ai_provider,
         ai_model,
         COUNT(*) FILTER (WHERE status IN ('approved','rejected'))  AS total_reviewed,
         COUNT(*) FILTER (WHERE status = 'approved')                AS approved,
         COUNT(*) FILTER (WHERE status = 'approved' AND was_edited) AS edited,
         COUNT(*) FILTER (WHERE status = 'rejected')                AS rejected,
         ROUND(AVG(tokenisation_low_confidence_flags)::numeric, 2)  AS avg_low_conf
       FROM ai_actions
       WHERE created_at >= $1::date
         AND created_at <  $2::date + INTERVAL '1 day'
         AND ai_provider IS NOT NULL
         AND ai_model    IS NOT NULL
       GROUP BY ai_provider, ai_model
       ORDER BY ai_provider, ai_model`,
      [from, to]
    );

    // ── Per-model, per-action-type ────────────────────────────────────────
    const { rows: byType } = await client.query(
      `SELECT
         ai_provider,
         ai_model,
         action_type,
         COUNT(*) FILTER (WHERE status IN ('approved','rejected')) AS total,
         COUNT(*) FILTER (WHERE status = 'approved')               AS approved
       FROM ai_actions
       WHERE created_at >= $1::date
         AND created_at <  $2::date + INTERVAL '1 day'
         AND ai_provider IS NOT NULL
         AND ai_model    IS NOT NULL
         AND status IN ('approved','rejected')
       GROUP BY ai_provider, ai_model, action_type`,
      [from, to]
    );

    // ── Per-model classification accuracy ─────────────────────────────────
    const { rows: classAcc } = await client.query(
      `SELECT
         ai_provider,
         ai_model,
         ai_classification                                                   AS category,
         COUNT(*)                                                            AS total,
         COUNT(*) FILTER (WHERE ai_classification = human_classification)   AS matches
       FROM ai_actions
       WHERE created_at >= $1::date
         AND created_at <  $2::date + INTERVAL '1 day'
         AND ai_provider         IS NOT NULL
         AND ai_model            IS NOT NULL
         AND ai_classification   IS NOT NULL
         AND human_classification IS NOT NULL
       GROUP BY ai_provider, ai_model, ai_classification`,
      [from, to]
    );

    return models.map((m) => {
      const isChallenger =
        cfg &&
        m.ai_provider === cfg.challenger_provider &&
        m.ai_model    === cfg.challenger_model;

      const total    = int(m.total_reviewed);
      const approved = int(m.approved);
      const edited   = int(m.edited);
      const rejected = int(m.rejected);

      const modelKey = (r) =>
        r.ai_provider === m.ai_provider && r.ai_model === m.ai_model;

      return {
        ai_provider:   m.ai_provider,
        ai_model:      m.ai_model,
        ab_split:      isChallenger ? 'challenger' : 'primary',
        total_reviewed: total,

        overall_approval_rate:        pct(approved, total),
        edit_rate:                    pct(edited,   approved),
        rejection_rate:               pct(rejected,  total),
        average_low_confidence_flags: flt(m.avg_low_conf),

        approval_rate_by_action_type: byType
          .filter(modelKey)
          .map((r) => ({
            action_type:   r.action_type,
            total:         int(r.total),
            approved:      int(r.approved),
            approval_rate: pct(int(r.approved), int(r.total)),
          })),

        classification_accuracy: classAcc
          .filter(modelKey)
          .map((r) => ({
            category:     r.category,
            total:        int(r.total),
            matches:      int(r.matches),
            accuracy_pct: pct(int(r.matches), int(r.total)),
          })),
      };
    });
  } finally {
    client.release();
  }
}
