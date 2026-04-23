import { pool } from '../db/pool.js';
import logger from '../logger.js';

// Adds N calendar or business days to a Date, returning a new Date.
// Business-day mode skips Saturday (6) and Sunday (0) only — public
// holidays require a separate calendar table and can be layered on later.
function addDays(from, n, businessDaysOnly) {
  const date = new Date(from);
  if (!businessDaysOnly) {
    date.setDate(date.getDate() + n);
    return date;
  }
  let added = 0;
  while (added < n) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return date;
}

async function writeAudit(client, { entityId, action, previousValue, newValue }) {
  await client.query(
    `INSERT INTO audit_log
       (entity_type, entity_id, action, actor_type, previous_value, new_value)
     VALUES ('deadline', $1, $2, 'system', $3, $4)`,
    [entityId, action, previousValue ?? null, newValue ?? null]
  );
}

// ─────────────────────────────────────────────────────────────
// calculateDeadlines(caseId)
// Inserts one deadline row per rule_type for the case's active
// ruleset. Safe to call multiple times — skips existing types.
// ─────────────────────────────────────────────────────────────
export async function calculateDeadlines(caseId) {
  const client = await pool.connect();
  try {
    const { rows: caseRows } = await client.query(
      `SELECT c.id, c.opened_at, r.jurisdiction, r.version
       FROM cases c
       JOIN ruleset r ON r.id = c.ruleset_id
       WHERE c.id = $1`,
      [caseId]
    );
    if (!caseRows.length) throw new Error(`Case not found: ${caseId}`);
    const { opened_at, jurisdiction, version } = caseRows[0];

    const { rows: rules } = await client.query(
      `SELECT id, rule_type, threshold_days, threshold_business_days
       FROM ruleset
       WHERE jurisdiction = $1 AND version = $2 AND is_active = TRUE`,
      [jurisdiction, version]
    );

    let inserted = 0;
    for (const rule of rules) {
      const dueAt = addDays(opened_at, rule.threshold_days, rule.threshold_business_days);

      const { rowCount } = await client.query(
        `INSERT INTO deadlines (case_id, ruleset_id, deadline_type, due_at)
         SELECT $1::uuid, $2::uuid, $3::text, $4::timestamptz
         WHERE NOT EXISTS (
           SELECT 1 FROM deadlines
           WHERE case_id = $1::uuid AND deadline_type = $3::text
         )`,
        [caseId, rule.id, rule.rule_type, dueAt]
      );

      if (rowCount > 0) {
        await writeAudit(client, {
          entityId: caseId,
          action: 'deadline_created',
          newValue: JSON.stringify({ rule_type: rule.rule_type, due_at: dueAt }),
        });
        inserted++;
      }
    }

    logger.info({ caseId, inserted }, 'deadlineEngine calculateDeadlines complete');
    return inserted;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────
// checkDeadlines()
// Scans every open deadline and:
//   • fires alerted_at_5d / 48h / 24h flags as time passes
//   • marks breached = TRUE if due_at has passed with no met_at
// All state changes are written to audit_log.
// ─────────────────────────────────────────────────────────────
export async function checkDeadlines() {
  const client = await pool.connect();
  try {
    // ── 5-day alert ──────────────────────────────────────────
    const { rows: alerted5d } = await client.query(
      `UPDATE deadlines
       SET alerted_at_5d = NOW()
       WHERE met_at IS NULL
         AND breached = FALSE
         AND alerted_at_5d IS NULL
         AND due_at > NOW()
         AND due_at <= NOW() + INTERVAL '5 days'
       RETURNING id, case_id, deadline_type, due_at`
    );
    for (const row of alerted5d) {
      await writeAudit(client, {
        entityId: row.id,
        action: 'deadline_alert_5d',
        newValue: JSON.stringify({ deadline_type: row.deadline_type, due_at: row.due_at }),
      });
    }

    // ── 48-hour alert ────────────────────────────────────────
    const { rows: alerted48h } = await client.query(
      `UPDATE deadlines
       SET alerted_at_48h = NOW()
       WHERE met_at IS NULL
         AND breached = FALSE
         AND alerted_at_48h IS NULL
         AND due_at > NOW()
         AND due_at <= NOW() + INTERVAL '48 hours'
       RETURNING id, case_id, deadline_type, due_at`
    );
    for (const row of alerted48h) {
      await writeAudit(client, {
        entityId: row.id,
        action: 'deadline_alert_48h',
        newValue: JSON.stringify({ deadline_type: row.deadline_type, due_at: row.due_at }),
      });
    }

    // ── 24-hour alert ────────────────────────────────────────
    const { rows: alerted24h } = await client.query(
      `UPDATE deadlines
       SET alerted_at_24h = NOW()
       WHERE met_at IS NULL
         AND breached = FALSE
         AND alerted_at_24h IS NULL
         AND due_at > NOW()
         AND due_at <= NOW() + INTERVAL '24 hours'
       RETURNING id, case_id, deadline_type, due_at`
    );
    for (const row of alerted24h) {
      await writeAudit(client, {
        entityId: row.id,
        action: 'deadline_alert_24h',
        newValue: JSON.stringify({ deadline_type: row.deadline_type, due_at: row.due_at }),
      });
    }

    // ── Breach detection ─────────────────────────────────────
    const { rows: breached } = await client.query(
      `UPDATE deadlines
       SET breached = TRUE,
           breached_at = NOW(),
           breach_reason = 'Deadline passed without met_at being set'
       WHERE met_at IS NULL
         AND breached = FALSE
         AND due_at < NOW()
       RETURNING id, case_id, deadline_type, due_at`
    );
    for (const row of breached) {
      await writeAudit(client, {
        entityId: row.id,
        action: 'deadline_breached',
        previousValue: JSON.stringify({ breached: false }),
        newValue: JSON.stringify({ breached: true, deadline_type: row.deadline_type, due_at: row.due_at }),
      });
    }

    const summary = {
      alerted_5d: alerted5d.length,
      alerted_48h: alerted48h.length,
      alerted_24h: alerted24h.length,
      breached: breached.length,
    };
    logger.info(summary, 'deadlineEngine checkDeadlines complete');
    return summary;
  } finally {
    client.release();
  }
}
