import { Router } from 'express';
import { pool } from '../db/pool.js';
import logger from '../logger.js';

const router = Router();

// ─── DELETE /api/v1/customers/:id/erasure  (GDPR Article 17 — right to erasure) ─
//
// Anonymises all PII in-place. Rows are kept for referential integrity and audit.
// Safe to call multiple times (idempotent — already-erased rows are re-erased cleanly).
router.delete('/:id/erasure', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Confirm customer exists.
    const { rows: custRows } = await client.query(
      `SELECT id FROM customers WHERE id = $1`, [id]
    );
    if (!custRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found' });
    }

    // 2. Anonymise customer PII fields.
    await client.query(
      `UPDATE customers
       SET full_name      = '[ERASED]',
           email          = NULL,
           phone          = NULL,
           consent_status = 'withdrawn',
           updated_at     = NOW()
       WHERE id = $1`,
      [id]
    );

    // 3. Anonymise communication bodies.
    const { rowCount: commsErased } = await client.query(
      `UPDATE communications
       SET body       = '[ERASED - GDPR Art.17]',
           body_plain = NULL,
           subject    = '[ERASED - GDPR Art.17]',
           metadata   = NULL
       WHERE customer_id = $1`,
      [id]
    );

    // 4. Anonymise AI action inputs/outputs for this customer's cases.
    const { rowCount: aiErased } = await client.query(
      `UPDATE ai_actions
       SET ai_input  = '[ERASED - GDPR Art.17]',
           ai_output = '[ERASED - GDPR Art.17]'
       WHERE case_id IN (SELECT id FROM cases WHERE customer_id = $1)`,
      [id]
    );

    // 5. Anonymise case notes.
    const { rowCount: casesErased } = await client.query(
      `UPDATE cases
       SET notes = '[ERASED - GDPR Art.17]'
       WHERE customer_id = $1 AND notes IS NOT NULL`,
      [id]
    );

    // 6. Write immutable audit record.
    await client.query(
      `INSERT INTO audit_log
         (entity_type, entity_id, action, actor_type, new_value)
       VALUES
         ('customer', $1, 'gdpr_erasure', 'staff',
          $2::jsonb)`,
      [
        id,
        JSON.stringify({
          erased_at: new Date().toISOString(),
          comms_erased: commsErased,
          ai_actions_erased: aiErased,
          case_notes_erased: casesErased,
        }),
      ]
    );

    await client.query('COMMIT');

    logger.info(
      { customer_id: id, commsErased, aiErased, casesErased },
      'GDPR erasure completed'
    );

    return res.json({
      erased: true,
      customer_id: id,
      erased_at: new Date().toISOString(),
      records_anonymised: {
        communications: commsErased,
        ai_actions:     aiErased,
        case_notes:     casesErased,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err, customer_id: id }, 'GDPR erasure failed');
    return res.status(500).json({ error: 'Erasure failed', message: err.message });
  } finally {
    client.release();
  }
});

export default router;
