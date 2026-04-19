/**
 * knowledgeLayer — document ingestion into knowledge_chunks
 *
 * Handles text extraction, chunking, and persistence.  Used by
 * regulatoryMonitor for auto-ingested content and can be called
 * directly for manual document uploads.
 */

import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { pool } from '../db/pool.js';

// ─── Text helpers ─────────────────────────────────────────────────────────────

function approxTokens(text) {
  return Math.ceil(text.length / 4);
}

// Split raw text into ~2 000-char chunks on paragraph boundaries.
function splitIntoChunks(text) {
  const TARGET = 2000;
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40);

  if (paragraphs.length === 0) {
    // Fallback: hard-split the block
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

// Fetch and extract plain text from a URL (HTML or plain text only).
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
    // Strip chrome — keep main content only
    $('nav, header, footer, script, style, iframe, .nav, .menu, .sidebar, .cookie').remove();
    // Prefer article/main if present
    const main = $('article, main, [role="main"]');
    return (main.length ? main : $('body')).text().replace(/\s{3,}/g, '\n\n').trim();
  }

  if (contentType.includes('text/plain')) {
    return (await res.text()).trim();
  }

  // PDF or other binary — return a placeholder so the chunk still gets created
  return `[Document: ${url}]\n\nFull text extraction is not yet supported for content type: ${contentType}.\nThis chunk was created from document metadata only and requires manual review before activation.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ingestDocument
//
// Creates one or more knowledge_chunks from a document.
// All chunks are created with status='pending_review' and
// confidence_tier='auto_ingested' — a reviewer must approve each one
// before it enters active knowledge context.
//
// Returns: array of inserted chunk IDs
// ─────────────────────────────────────────────────────────────────────────────
export async function ingestDocument({
  sourceId,
  url,
  title,
  jurisdiction,
  documentType,
  rawText,        // optional — if provided, skips the network fetch
}) {
  // ── Acquire text ──────────────────────────────────────────────────────────
  let text = rawText;
  if (!text) {
    text = await fetchDocumentText(url);
  }

  // ── Split into chunks ─────────────────────────────────────────────────────
  const parts = splitIntoChunks(text);
  if (parts.length === 0) throw new Error(`No usable text extracted from ${url}`);

  const chunkTitles = parts.map((_, i) =>
    parts.length === 1 ? title : `${title} — Part ${i + 1}`
  );

  // ── Persist ───────────────────────────────────────────────────────────────
  const client = await pool.connect();
  const insertedIds = [];
  try {
    for (let i = 0; i < parts.length; i++) {
      const { rows } = await client.query(
        `INSERT INTO knowledge_chunks
           (namespace, jurisdiction, document_type, source_document, title,
            chunk_text, confidence_tier, status, token_count, source_id)
         VALUES ('regulatory', $1, $2, $3, $4, $5, 'auto_ingested', 'pending_review', $6, $7)
         ON CONFLICT (source_document, title) DO NOTHING
         RETURNING id`,
        [
          jurisdiction,
          documentType ?? 'guidance',
          url,            // source_document = originating URL for auto-ingested chunks
          chunkTitles[i],
          parts[i],
          approxTokens(parts[i]),
          sourceId ?? null,
        ]
      );
      if (rows.length > 0) insertedIds.push(rows[0].id);
    }
  } finally {
    client.release();
  }

  return insertedIds;
}
