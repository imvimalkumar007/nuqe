import 'dotenv/config';
import { pool } from '../pool.js';

const DEMO_REFS = ['ACC-44821', 'ACC-39014', 'ACC-51203', 'ACC-28876', 'ACC-61090', 'ACC-17342'];

async function clearDemo() {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');

    const { rows: customers } = await db.query(
      `SELECT id, full_name FROM customers WHERE external_ref = ANY($1)`,
      [DEMO_REFS]
    );
    if (!customers.length) {
      console.log('No demo customers found — nothing to delete.');
      await db.query('ROLLBACK');
      return;
    }
    console.log(`Found ${customers.length} demo customers: ${customers.map(c => c.full_name).join(', ')}`);

    const { rowCount: aiDel } = await db.query(
      `DELETE FROM ai_actions WHERE case_id IN (
         SELECT id FROM cases WHERE customer_id IN (
           SELECT id FROM customers WHERE external_ref = ANY($1)
         )
       )`, [DEMO_REFS]
    );
    console.log(`  deleted ${aiDel} ai_actions`);

    const { rowCount: dlDel } = await db.query(
      `DELETE FROM deadlines WHERE case_id IN (
         SELECT id FROM cases WHERE customer_id IN (
           SELECT id FROM customers WHERE external_ref = ANY($1)
         )
       )`, [DEMO_REFS]
    );
    console.log(`  deleted ${dlDel} deadlines`);

    const { rowCount: commDel } = await db.query(
      `DELETE FROM communications WHERE customer_id IN (
         SELECT id FROM customers WHERE external_ref = ANY($1)
       )`, [DEMO_REFS]
    );
    console.log(`  deleted ${commDel} communications`);

    const { rowCount: caseDel } = await db.query(
      `DELETE FROM cases WHERE customer_id IN (
         SELECT id FROM customers WHERE external_ref = ANY($1)
       )`, [DEMO_REFS]
    );
    console.log(`  deleted ${caseDel} cases`);

    const { rowCount: custDel } = await db.query(
      `DELETE FROM customers WHERE external_ref = ANY($1)`, [DEMO_REFS]
    );
    console.log(`  deleted ${custDel} customers`);

    await db.query('COMMIT');
    console.log('\nDemo data cleared. Database is clean for real cases.');
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Clear failed:', err.message);
    process.exit(1);
  } finally {
    db.release();
    await pool.end();
  }
}

clearDemo();
