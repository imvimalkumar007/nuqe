/**
 * GDPR / FCA data retention archival job.
 *
 * Retention periods (UK FCA DISP + GDPR Art.5(1)(e)):
 *   Complaint cases + communications : 7 years from case.closed_at
 *   AI action inputs/outputs         : 2 years from ai_actions.created_at
 *   Rejected/superseded knowledge    : 2 years from knowledge_chunks.updated_at
 *
 * Archival strategy: anonymise PII in-place (rows are kept for referential integrity
 * and audit trail — the audit_log is immutable by DB rule so it is never touched).
 */

import { pool } from '../db/pool.js';
import logger from '../logger.js';

const SEVEN_YEARS_AGO = `NOW() - INTERVAL '7 years'`;
const TWO_YEARS_AGO   = `NOW() - INTERVAL '2 years'`;

export async function runRetentionArchiver() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Anonymise case notes for cases closed > 7 years ago ──────────────
    const { rowCount: casesArchived } = await client.query(`
      UPDATE cases
      SET notes = '[ARCHIVED - retention limit]'
      WHERE closed_at IS NOT NULL
        AND closed_at < ${SEVEN_YEARS_AGO}
        AND notes IS NOT NULL
        AND notes != '[ARCHIVED - retention limit]'
    `);

    // ── 2. Anonymise communication bodies for old closed cases ───────────────
    const { rowCount: commsArchived } = await client.query(`
      UPDATE communications
      SET body       = '[ARCHIVED - retention limit]',
          body_plain = NULL,
          subject    = '[ARCHIVED - retention limit]',
          metadata   = NULL
      WHERE case_id IN (
        SELECT id FROM cases
        WHERE closed_at IS NOT NULL
          AND closed_at < ${SEVEN_YEARS_AGO}
      )
      AND body != '[ARCHIVED - retention limit]'
    `);

    // ── 3. Anonymise AI action inputs/outputs older than 2 years ────────────
    const { rowCount: aiArchived } = await client.query(`
      UPDATE ai_actions
      SET ai_input  = '[ARCHIVED - retention limit]',
          ai_output = '[ARCHIVED - retention limit]'
      WHERE created_at < ${TWO_YEARS_AGO}
        AND ai_output != '[ARCHIVED - retention limit]'
    `);

    // ── 4. Soft-delete old rejected/superseded knowledge chunks ──────────────
    const { rowCount: chunksArchived } = await client.query(`
      UPDATE knowledge_chunks
      SET status = 'archived'
      WHERE status IN ('rejected', 'superseded')
        AND updated_at < ${TWO_YEARS_AGO}
    `);

    // ── 5. Customer PII: anonymise customers whose all cases are closed > 7y ─
    const { rowCount: customersArchived } = await client.query(`
      UPDATE customers c
      SET full_name      = '[ARCHIVED]',
          email          = NULL,
          phone          = NULL,
          consent_status = 'withdrawn',
          updated_at     = NOW()
      WHERE c.full_name != '[ARCHIVED]'
        AND c.full_name != '[ERASED]'
        AND NOT EXISTS (
          SELECT 1 FROM cases ca
          WHERE ca.customer_id = c.id
            AND (ca.closed_at IS NULL OR ca.closed_at >= ${SEVEN_YEARS_AGO})
        )
    `);

    const totalArchived = casesArchived + commsArchived + aiArchived + chunksArchived + customersArchived;

    if (totalArchived > 0) {
      await client.query(
        `INSERT INTO audit_log
           (entity_type, entity_id, action, actor_type, new_value)
         VALUES
           ('retention_job', uuid_generate_v4(), 'retention_archive_run', 'system', $1::jsonb)`,
        [
          JSON.stringify({
            ran_at:              new Date().toISOString(),
            cases_archived:      casesArchived,
            comms_archived:      commsArchived,
            ai_actions_archived: aiArchived,
            chunks_archived:     chunksArchived,
            customers_archived:  customersArchived,
          }),
        ]
      );
    }

    await client.query('COMMIT');

    logger.info(
      { casesArchived, commsArchived, aiArchived, chunksArchived, customersArchived },
      'Retention archiver completed'
    );

    return { totalArchived, casesArchived, commsArchived, aiArchived, chunksArchived, customersArchived };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Retention archiver failed');
    throw err;
  } finally {
    client.release();
  }
}
