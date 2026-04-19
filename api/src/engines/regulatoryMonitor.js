/**
 * regulatoryMonitor — automated regulatory source monitoring
 *
 * Three exported functions:
 *   checkSources(jurisdictions?)    — poll configured sources for new content
 *   processNewDocument(...)         — download, chunk, and queue for review
 *   propagateKnowledgeUpdate(id)    — supersede stale chunks when new content is approved
 */

import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { pool } from '../db/pool.js';
import { ingestDocument } from './knowledgeLayer.js';

const rssParser = new Parser({ timeout: 30_000 });

// ─── Audit writer (shared pattern) ───────────────────────────────────────────

async function writeAudit(client, { entityType, entityId, action, newValue }) {
  await client.query(
    `INSERT INTO audit_log (entity_type, entity_id, action, actor_type, new_value)
     VALUES ($1, $2, $3, 'system', $4)`,
    [entityType, entityId, action, newValue != null ? JSON.stringify(newValue) : null]
  );
}

// ─── Source-type checkers ─────────────────────────────────────────────────────

async function checkRssSource(source) {
  const feed = await rssParser.parseURL(source.url);
  if (!feed.items?.length) return { newItems: [], latestRef: source.last_document_ref };

  // last_document_ref stores the ISO pubDate of the most recently seen item
  const lastSeen = source.last_document_ref ? new Date(source.last_document_ref) : null;

  const newItems = feed.items
    .filter((item) => {
      if (!lastSeen) return true;              // first run — take latest few only
      const pub = item.pubDate ? new Date(item.pubDate) : null;
      return pub && pub > lastSeen;
    })
    .map((item) => ({
      url:   item.link   ?? item.guid ?? '',
      title: item.title  ?? 'Untitled',
      pubDate: item.pubDate ?? null,
    }))
    .filter((item) => item.url);

  // Cap first run to avoid ingesting an entire backlog
  const toProcess = lastSeen ? newItems : newItems.slice(0, 3);

  // Latest ref = highest pubDate seen in this fetch
  const latestRef = feed.items
    .map((i) => i.pubDate)
    .filter(Boolean)
    .sort()
    .at(-1) ?? source.last_document_ref;

  return { newItems: toProcess, latestRef };
}

async function checkScrapeSource(source) {
  const meta = source.metadata ?? {};
  const linkSelector  = meta.link_selector  ?? 'a[href]';
  const titleSelector = meta.title_selector ?? null;

  const res = await fetch(source.url, {
    headers: { 'User-Agent': 'Nuqe-Regulatory-Monitor/1.0' },
    timeout: 30_000,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${source.url}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const baseUrl = new URL(source.url);
  const seen = new Set();
  const links = [];

  $(linkSelector).each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href) return;

    // Resolve relative URLs
    let absolute;
    try {
      absolute = new URL(href, baseUrl).href;
    } catch {
      return;
    }

    if (seen.has(absolute)) return;
    seen.add(absolute);

    const title = titleSelector
      ? $(el).closest(titleSelector).text().trim() || $(el).text().trim()
      : $(el).text().trim();

    if (title.length < 5) return;

    // Accept PDFs and URLs that look like documents / press releases
    if (
      /\.(pdf|docx?)(\?|$)/i.test(absolute) ||
      /press.?release|publication|circular|guideline|notification|direction/i.test(absolute)
    ) {
      links.push({ url: absolute, title });
    }
  });

  // last_document_ref stores the URL path of the most recently seen document
  const lastRef = source.last_document_ref;
  const newItems = lastRef
    ? links.filter((l) => !l.url.includes(lastRef))
    : links.slice(0, 3);

  const latestRef = links[0]?.url
    ? new URL(links[0].url).pathname
    : source.last_document_ref;

  return { newItems, latestRef };
}

// ─────────────────────────────────────────────────────────────────────────────
// checkSources(jurisdictions?)
//
// Iterates active regulatory_sources, identifies new documents since
// last_document_ref, calls processNewDocument for each, then updates
// last_checked_at / last_document_ref and writes a monitoring_log row.
//
// Pass jurisdictions=['UK','EU'] or ['IN'] to scope the run.
// ─────────────────────────────────────────────────────────────────────────────
export async function checkSources(jurisdictions = null) {
  const params = [];
  let where = 'WHERE is_active = TRUE';
  if (jurisdictions?.length) {
    params.push(jurisdictions);
    where += ` AND jurisdiction = ANY($${params.length})`;
  }

  const { rows: sources } = await pool.query(
    `SELECT * FROM regulatory_sources ${where} ORDER BY name`,
    params
  );

  console.log(`[regulatoryMonitor] checking ${sources.length} sources (jurisdictions: ${jurisdictions ?? 'all'})`);

  for (const source of sources) {
    const checkedAt = new Date();
    let documentsFound   = 0;
    let documentsIngested = 0;
    let errorMsg = null;

    try {
      // ── Fetch new items ──────────────────────────────────────────────────
      let result;
      if (source.source_type === 'rss') {
        result = await checkRssSource(source);
      } else {
        result = await checkScrapeSource(source);
      }

      const { newItems, latestRef } = result;
      documentsFound = newItems.length;

      // ── Process each new document ────────────────────────────────────────
      for (const item of newItems) {
        try {
          await processNewDocument(
            source.id,
            item.url,
            item.title,
            source.jurisdiction,
            source.document_type ?? 'guidance'
          );
          documentsIngested++;
        } catch (docErr) {
          console.error(`[regulatoryMonitor] processNewDocument failed for ${item.url}:`, docErr.message);
        }
      }

      // ── Update source record ──────────────────────────────────────────────
      await pool.query(
        `UPDATE regulatory_sources
         SET last_checked_at = $1, last_document_ref = COALESCE($2, last_document_ref), updated_at = NOW()
         WHERE id = $3`,
        [checkedAt, latestRef, source.id]
      );
    } catch (err) {
      errorMsg = err.message;
      console.error(`[regulatoryMonitor] source "${source.name}" failed:`, err.message);
      // Still update last_checked_at so the health indicator doesn't get stuck
      await pool.query(
        `UPDATE regulatory_sources SET last_checked_at = $1, updated_at = NOW() WHERE id = $2`,
        [checkedAt, source.id]
      );
    }

    // ── Write monitoring log ──────────────────────────────────────────────
    await pool.query(
      `INSERT INTO regulatory_monitoring_log
         (source_id, checked_at, documents_found, documents_ingested, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [source.id, checkedAt, documentsFound, documentsIngested, errorMsg]
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// processNewDocument
//
// Downloads a document, calls ingestDocument to create pending_review chunks,
// then writes an audit entry so reviewers are notified.
// ─────────────────────────────────────────────────────────────────────────────
export async function processNewDocument(
  sourceId,
  documentUrl,
  documentTitle,
  jurisdiction,
  documentType
) {
  const chunkIds = await ingestDocument({
    sourceId,
    url:          documentUrl,
    title:        documentTitle,
    jurisdiction,
    documentType,
  });

  if (chunkIds.length === 0) return; // already existed — no-op

  const client = await pool.connect();
  try {
    for (const id of chunkIds) {
      await writeAudit(client, {
        entityType: 'knowledge_chunk',
        entityId:   id,
        action:     'auto_ingested',
        newValue: {
          source_id:     sourceId,
          document_url:  documentUrl,
          title:         documentTitle,
          jurisdiction,
          document_type: documentType,
          status:        'pending_review',
        },
      });
    }
  } finally {
    client.release();
  }

  console.log(`[regulatoryMonitor] ingested ${chunkIds.length} chunk(s) from "${documentTitle}"`);
  return chunkIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// propagateKnowledgeUpdate(chunkId)
//
// Called when a compliance reviewer approves a new knowledge chunk.
// Uses pg_trgm trigram similarity (≥ 0.5) to find active chunks that the
// new content supersedes, marks them superseded, then surfaces all open
// cases in the same jurisdiction for a fresh compliance review.
//
// NOTE: pg_trgm similarity is character-level, not semantic. Upgrade to
// pgvector + embedding search for higher-fidelity supersession detection.
// ─────────────────────────────────────────────────────────────────────────────
export async function propagateKnowledgeUpdate(chunkId) {
  const client = await pool.connect();
  try {
    // ── Load the newly approved chunk ────────────────────────────────────────
    const { rows: [chunk] } = await client.query(
      `SELECT * FROM knowledge_chunks WHERE id = $1`,
      [chunkId]
    );
    if (!chunk) throw new Error(`knowledge_chunk not found: ${chunkId}`);

    // ── Find similar active chunks (same jurisdiction + document_type) ────────
    const SIMILARITY_THRESHOLD = 0.5; // tuned for pg_trgm; raise for pgvector
    const { rows: candidates } = await client.query(
      `SELECT id, title, source_document,
              similarity(chunk_text, $1) AS sim_score
       FROM knowledge_chunks
       WHERE status = 'active'
         AND id != $2
         AND jurisdiction = $3
         AND document_type = $4
         AND similarity(chunk_text, $1) >= $5
       ORDER BY sim_score DESC
       LIMIT 20`,
      [chunk.chunk_text, chunkId, chunk.jurisdiction, chunk.document_type, SIMILARITY_THRESHOLD]
    );

    if (candidates.length === 0) {
      console.log(`[regulatoryMonitor] propagate: no superseded candidates for chunk ${chunkId}`);
      return { superseded: [], affectedCases: [] };
    }

    const supersededIds = candidates.map((c) => c.id);

    // ── Mark candidates as superseded ────────────────────────────────────────
    await client.query(
      `UPDATE knowledge_chunks
       SET status        = 'superseded',
           superseded_by = $1,
           effective_to  = NOW(),
           updated_at    = NOW()
       WHERE id = ANY($2)`,
      [chunkId, supersededIds]
    );

    for (const sup of candidates) {
      await writeAudit(client, {
        entityType: 'knowledge_chunk',
        entityId:   sup.id,
        action:     'superseded',
        newValue: {
          superseded_by:  chunkId,
          new_title:      chunk.title,
          sim_score:      sup.sim_score,
          effective_to:   new Date().toISOString(),
        },
      });
    }

    // ── Surface open cases in same jurisdiction for compliance review ─────────
    const { rows: affectedCases } = await client.query(
      `SELECT c.id, c.case_ref, c.status
       FROM cases c
       JOIN customers cu ON cu.id = c.customer_id
       WHERE cu.jurisdiction = $1
         AND c.status NOT IN ('closed_upheld','closed_not_upheld','closed_withdrawn')`,
      [chunk.jurisdiction]
    );

    for (const cas of affectedCases) {
      await writeAudit(client, {
        entityType: 'case',
        entityId:   cas.id,
        action:     'knowledge_superseded',
        newValue: {
          trigger:           'knowledge_update',
          new_chunk_id:      chunkId,
          superseded_count:  supersededIds.length,
          jurisdiction:      chunk.jurisdiction,
          document_type:     chunk.document_type,
          review_recommended: true,
        },
      });
    }

    console.log(
      `[regulatoryMonitor] propagate: ${supersededIds.length} chunks superseded, ` +
      `${affectedCases.length} open cases flagged for review`
    );

    return { superseded: supersededIds, affectedCases: affectedCases.map((c) => c.id) };
  } finally {
    client.release();
  }
}
