/**
 * knowledgeLayer — document ingestion and retrieval from knowledge_chunks
 */

import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import { pool } from '../db/pool.js';

// ─── OpenAI embeddings ────────────────────────────────────────────────────────

let openaiClient = null;

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

export async function embedText(text) {
  const client = getOpenAI();
  if (!client) return null;
  try {
    const res = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    });
    return res.data[0].embedding;
  } catch (err) {
    console.warn('[knowledgeLayer] embedText failed:', err.message);
    return null;
  }
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

function approxTokens(text) {
  return Math.ceil(text.length / 4);
}

function splitIntoChunks(text) {
  const TARGET = 2000;
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40);

  if (paragraphs.length === 0) {
    const chunks = [];
    for (let i = 0; i < text.length; i += TARGET) {
      chunks.push(text.slice(i, i + TARGET).trim());
    }
    return chunks.filter((c) => c.length > 40);
  }

  const result = [];
  let current = '';
  for (const para of paragraphs) {
    if (current.length + para.length > TARGET && current.length > 0) {
      result.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim().length > 40) result.push(current.trim());
  return result;
}

async function fetchDocumentText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Nuqe-Regulatory-Monitor/1.0' },
    timeout: 30_000,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);

  const contentType = res.headers.get('content-type') ?? '';

  if (contentType.includes('text/html')) {
    const html = await res.text();
    const $ = cheerio.load(html);
    $('nav, header, footer, script, style, iframe, .nav, .menu, .sidebar, .cookie').remove();
    const main = $('article, main, [role="main"]');
    return (main.length ? main : $('body')).text().replace(/\s{3,}/g, '\n\n').trim();
  }

  if (contentType.includes('text/plain')) {
    return (await res.text()).trim();
  }

  return `[Document: ${url}]\n\nFull text extraction is not yet supported for content type: ${contentType}.\nThis chunk was created from document metadata only and requires manual review before activation.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ingestDocument
//
// Creates one or more knowledge_chunks from a document.
// All chunks are created with status='pending_review'.
// Embeddings are generated and stored when OPENAI_API_KEY is present.
//
// Returns: array of inserted chunk IDs
// ─────────────────────────────────────────────────────────────────────────────
export async function ingestDocument({
  sourceId,
  url,
  title,
  jurisdiction,
  documentType,
  rawText,
}) {
  let text = rawText;
  if (!text) {
    text = await fetchDocumentText(url);
  }

  const parts = splitIntoChunks(text);
  if (parts.length === 0) throw new Error(`No usable text extracted from ${url}`);

  const chunkTitles = parts.map((_, i) =>
    parts.length === 1 ? title : `${title} — Part ${i + 1}`
  );

  const client = await pool.connect();
  const insertedIds = [];
  try {
    for (let i = 0; i < parts.length; i++) {
      const embedding = await embedText(parts[i]);

      const { rows } = await client.query(
        `INSERT INTO knowledge_chunks
           (namespace, jurisdiction, document_type, source_document, title,
            chunk_text, confidence_tier, status, token_count, source_id, embedding)
         VALUES ('regulatory', $1, $2, $3, $4, $5, 'auto_ingested', 'pending_review', $6, $7,
                 $8::vector)
         ON CONFLICT (source_document, title) DO NOTHING
         RETURNING id`,
        [
          jurisdiction,
          documentType ?? 'guidance',
          url,
          chunkTitles[i],
          parts[i],
          approxTokens(parts[i]),
          sourceId ?? null,
          embedding ? JSON.stringify(embedding) : null,
        ]
      );
      if (rows.length > 0) insertedIds.push(rows[0].id);
    }
  } finally {
    client.release();
  }

  return insertedIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// retrieveContext(query, options)
//
// Returns relevant knowledge chunks for a given query.
// Uses vector cosine similarity when an embedding is available,
// falling back to a plain text search limited by date and jurisdiction.
//
// options:
//   jurisdiction   – filter to this jurisdiction (also includes null/global)
//   documentType   – optional additional filter
//   asAtDate       – ISO string or Date; only chunks effective at that date
//                    (effective_from <= asAtDate AND (effective_to IS NULL OR effective_to > asAtDate))
//   limit          – max results (default 5)
// ─────────────────────────────────────────────────────────────────────────────
export async function retrieveContext(query, {
  jurisdiction   = null,
  documentType   = null,
  asAtDate       = null,
  limit          = 5,
} = {}) {
  const embedding = await embedText(query);

  const params = [];
  const whereClauses = [`status = 'active'`];

  if (jurisdiction) {
    params.push(jurisdiction);
    whereClauses.push(`(jurisdiction = $${params.length} OR jurisdiction IS NULL)`);
  }

  if (documentType) {
    params.push(documentType);
    whereClauses.push(`document_type = $${params.length}`);
  }

  if (asAtDate) {
    const d = asAtDate instanceof Date ? asAtDate : new Date(asAtDate);
    params.push(d.toISOString());
    whereClauses.push(
      `(effective_from IS NULL OR effective_from <= $${params.length})` +
      ` AND (effective_to IS NULL OR effective_to > $${params.length})`
    );
  }

  const where = whereClauses.join(' AND ');

  if (embedding) {
    // Vector similarity search
    params.push(JSON.stringify(embedding));
    const embIdx = params.length;
    params.push(limit);
    const limitIdx = params.length;

    const { rows } = await pool.query(
      `SELECT id, title, chunk_text, jurisdiction, document_type, source_document,
              confidence_tier,
              1 - (embedding <=> $${embIdx}::vector) AS similarity
       FROM knowledge_chunks
       WHERE ${where}
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $${embIdx}::vector
       LIMIT $${limitIdx}`,
      params
    );
    return rows;
  }

  // Fallback: return recent active chunks matching jurisdiction/docType
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT id, title, chunk_text, jurisdiction, document_type, source_document,
            confidence_tier, NULL::float AS similarity
     FROM knowledge_chunks
     WHERE ${where}
     ORDER BY updated_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// enrichPrompt(basePrompt, caseId)
// Appends relevant regulatory context chunks to a prompt string.
// Labels each chunk as verified guidance or pending review based on tier.
// ─────────────────────────────────────────────────────────────────────────────
export async function enrichPrompt(basePrompt, caseId) {
  const { rows: caseRows } = await pool.query(
    `SELECT c.opened_at, r.jurisdiction
     FROM cases c
     JOIN ruleset r ON r.id = c.ruleset_id
     WHERE c.id = $1`,
    [caseId]
  );
  if (!caseRows.length) return basePrompt;

  const { opened_at, jurisdiction } = caseRows[0];

  const chunks = await retrieveContext('regulatory guidance', {
    jurisdiction,
    asAtDate: opened_at,
    limit: 5,
  });

  if (!chunks.length) return basePrompt;

  const contextBlock = chunks
    .map((chunk) => {
      const label =
        chunk.confidence_tier === 'verified'
          ? '### Verified regulatory guidance'
          : '### Pending review — treat as indicative only';
      return `${label}\n${chunk.title}\n\n${chunk.chunk_text}`;
    })
    .join('\n\n---\n\n');

  return `${basePrompt}\n\n## Regulatory Context\n\n${contextBlock}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// logRetrieval(actionId, chunkIds)
// Writes the retrieved chunk IDs to audit_log for traceability.
// ─────────────────────────────────────────────────────────────────────────────
export async function logRetrieval(actionId, chunkIds) {
  await pool.query(
    `INSERT INTO audit_log
       (entity_type, entity_id, action, actor_type, new_value)
     VALUES ('ai_action', $1, 'knowledge_retrieval', 'system', $2)`,
    [actionId, JSON.stringify({ chunk_ids: chunkIds })]
  );
}
