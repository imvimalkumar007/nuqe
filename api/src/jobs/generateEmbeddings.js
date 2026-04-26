/**
 * Generates OpenAI text-embedding-3-small embeddings for all knowledge_chunks
 * that have a NULL embedding column. Safe to run repeatedly — skips chunks
 * that already have embeddings.
 *
 * Usage: npm run embed
 * Requires: OPENAI_API_KEY in environment
 */

import OpenAI from 'openai';
import { pool } from '../db/pool.js';
import logger from '../logger.js';

const BATCH_SIZE = 20;
const MODEL      = 'text-embedding-3-small';

async function generateEmbeddings() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set. Embeddings require the OpenAI API.');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const { rows } = await pool.query(
    `SELECT id, title, chunk_text
     FROM knowledge_chunks
     WHERE embedding IS NULL
     ORDER BY created_at`
  );

  if (rows.length === 0) {
    console.log('All chunks already have embeddings.');
    await pool.end();
    return;
  }

  console.log(`Generating embeddings for ${rows.length} chunks using ${MODEL}...`);

  let done = 0;
  let failed = 0;

  // Process in batches to avoid rate limits
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const texts  = batch.map((r) => `${r.title}\n\n${r.chunk_text}`);

    try {
      const response = await openai.embeddings.create({ model: MODEL, input: texts });

      for (let j = 0; j < batch.length; j++) {
        const vector    = response.data[j].embedding;
        const pgVector  = `[${vector.join(',')}]`;
        await pool.query(
          `UPDATE knowledge_chunks SET embedding = $1::vector WHERE id = $2`,
          [pgVector, batch[j].id]
        );
        done++;
        console.log(`  ✓ [${done}/${rows.length}] ${batch[j].title.slice(0, 60)}`);
      }
    } catch (err) {
      logger.error({ err }, `Batch ${i / BATCH_SIZE + 1} failed`);
      failed += batch.length;
      console.error(`  ✗ Batch failed: ${err.message}`);
    }

    // Small pause between batches to respect rate limits
    if (i + BATCH_SIZE < rows.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log(`\nDone. ${done} embedded, ${failed} failed.`);
  await pool.end();
}

generateEmbeddings().catch((err) => { console.error(err); process.exit(1); });
