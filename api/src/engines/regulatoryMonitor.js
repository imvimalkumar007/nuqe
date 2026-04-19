/**
 * regulatoryMonitor — automated regulatory source monitoring
 *
 * Exported functions:
 *   checkSources(jurisdictions?)        — poll configured sources for new content
 *   processNewDocument(...)             — download, chunk, queue for review, notify
 *   propagateKnowledgeUpdate(chunkId)   — supersede stale chunks + Claude impact summaries
 *   getMonitoringHealth()               — per-source health status for dashboard
 */

import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db/pool.js';
import { ingestDocument, embedText } from './knowledgeLayer.js';

const rssParser = new Parser({ timeout: 30_000 });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

const KNOWLEDGE_IMPACT_SYSTEM = `\
You are a compliance analyst. A regulatory knowledge chunk has been approved and supersedes older guidance.
You will be given: the new chunk text, the case details, and a list of superseded chunks.
Write a concise impact assessment for the compliance reviewer handling this case.
Return JSON only:
{
  "summary": "<2-3 sentences on how the regulatory change affects this case>",
  "risk_level": "low" | "medium" | "high",
  "recommended_action": "<one sentence>"
}`;

// ─── Audit writer ─────────────────────────────────────────────────────────────

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

  const lastSeen = source.last_document_ref ? new Date(source.last_document_ref) : null;

  const newItems = feed.items
    .filter((item) => {
      if (!lastSeen) return true;
      const pub = item.pubDate ? new Date(item.pubDate) : null;
      return pub && pub > lastSeen;
    })
    .map((item) => ({
      url:     item.link  ?? item.guid ?? '',
      title:   item.title ?? 'Untitled',
      pubDate: item.pubDate ?? null,
    }))
    .filter((item) => item.url);

  const toProcess = lastSeen ? newItems : newItems.slice(0, 3);

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

    if (
      /\.(pdf|docx?)(\?|$)/i.test(absolute) ||
      /press.?release|publication|circular|guideline|notification|direction|decision/i.test(absolute)
    ) {
      links.push({ url: absolute, title });
    }
  });

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
    let documentsFound    = 0;
    let documentsIngested = 0;
    let errorMsg = null;

    try {
      let result;
      if (source.source_type === 'rss') {
        result = await checkRssSource(source);
      } else {
        result = await checkScrapeSource(source);
      }

      const { newItems, latestRef } = result;
      documentsFound = newItems.length;

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

      await pool.query(
        `UPDATE regulatory_sources
         SET last_checked_at = $1, last_document_ref = COALESCE($2, last_document_ref), updated_at = NOW()
         WHERE id = $3`,
        [checkedAt, latestRef, source.id]
      );
    } catch (err) {
      errorMsg = err.message;
      console.error(`[regulatoryMonitor] source "${source.name}" failed:`, err.message);
      await pool.query(
        `UPDATE regulatory_sources SET last_checked_at = $1, updated_at = NOW() WHERE id = $2`,
        [checkedAt, source.id]
      );
    }

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

  if (chunkIds.length === 0) return;

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

      // Write notification for reviewers
      await client.query(
        `INSERT INTO notifications
           (type, entity_type, entity_id, title, body, metadata)
         VALUES ('knowledge_review_required', 'knowledge_chunk', $1, $2, $3, $4)`,
        [
          id,
          `New regulatory content requires review`,
          `"${documentTitle}" (${jurisdiction}) has been auto-ingested and is pending review.`,
          JSON.stringify({ document_url: documentUrl, jurisdiction, document_type: documentType }),
        ]
      );
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
// Uses pgvector cosine similarity (≥ 0.85) to find chunks the new content
// supersedes; falls back to pg_trgm if no embeddings are available.
// Calls Claude to generate per-case impact summaries as pending ai_actions.
// ─────────────────────────────────────────────────────────────────────────────
export async function propagateKnowledgeUpdate(chunkId) {
  const client = await pool.connect();
  try {
    const { rows: [chunk] } = await client.query(
      `SELECT * FROM knowledge_chunks WHERE id = $1`,
      [chunkId]
    );
    if (!chunk) throw new Error(`knowledge_chunk not found: ${chunkId}`);

    let candidates = [];

    // ── Vector similarity search (preferred) ─────────────────────────────────
    if (chunk.embedding) {
      const { rows } = await client.query(
        `SELECT id, title, source_document, chunk_text,
                1 - (embedding <=> $1::vector) AS sim_score
         FROM knowledge_chunks
         WHERE status = 'active'
           AND id != $2
           AND jurisdiction = $3
           AND document_type = $4
           AND embedding IS NOT NULL
           AND 1 - (embedding <=> $1::vector) >= 0.85
         ORDER BY sim_score DESC
         LIMIT 20`,
        [JSON.stringify(chunk.embedding), chunkId, chunk.jurisdiction, chunk.document_type]
      );
      candidates = rows;
    }

    // ── pg_trgm fallback ──────────────────────────────────────────────────────
    if (candidates.length === 0) {
      // Generate embedding for the chunk text on-the-fly if missing
      const freshEmbedding = await embedText(chunk.chunk_text);
      if (freshEmbedding) {
        const { rows } = await client.query(
          `SELECT id, title, source_document, chunk_text,
                  1 - (embedding <=> $1::vector) AS sim_score
           FROM knowledge_chunks
           WHERE status = 'active'
             AND id != $2
             AND jurisdiction = $3
             AND document_type = $4
             AND embedding IS NOT NULL
             AND 1 - (embedding <=> $1::vector) >= 0.85
           ORDER BY sim_score DESC
           LIMIT 20`,
          [JSON.stringify(freshEmbedding), chunkId, chunk.jurisdiction, chunk.document_type]
        );
        candidates = rows;
      }

      // Final fallback: trigram similarity
      if (candidates.length === 0) {
        const { rows } = await client.query(
          `SELECT id, title, source_document, chunk_text,
                  similarity(chunk_text, $1) AS sim_score
           FROM knowledge_chunks
           WHERE status = 'active'
             AND id != $2
             AND jurisdiction = $3
             AND document_type = $4
             AND similarity(chunk_text, $1) >= 0.5
           ORDER BY sim_score DESC
           LIMIT 20`,
          [chunk.chunk_text, chunkId, chunk.jurisdiction, chunk.document_type]
        );
        candidates = rows;
      }
    }

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
          superseded_by: chunkId,
          new_title:     chunk.title,
          sim_score:     sup.sim_score,
          effective_to:  new Date().toISOString(),
        },
      });
    }

    // ── Find open cases in same jurisdiction ──────────────────────────────────
    const { rows: affectedCases } = await client.query(
      `SELECT c.id, c.case_ref, c.status, c.category, c.opened_at, c.channel_received,
              cu.jurisdiction, cu.vulnerable_flag
       FROM cases c
       JOIN customers cu ON cu.id = c.customer_id
       WHERE cu.jurisdiction = $1
         AND c.status NOT IN ('closed_upheld','closed_not_upheld','closed_withdrawn')`,
      [chunk.jurisdiction]
    );

    // ── Claude impact summary per affected case ───────────────────────────────
    for (const cas of affectedCases) {
      const contextPayload = {
        new_chunk: {
          title:         chunk.title,
          document_type: chunk.document_type,
          jurisdiction:  chunk.jurisdiction,
          text:          chunk.chunk_text.slice(0, 2000),
        },
        case: {
          case_ref:         cas.case_ref,
          status:           cas.status,
          category:         cas.category,
          opened_at:        cas.opened_at,
          channel_received: cas.channel_received,
        },
        customer: {
          jurisdiction:   cas.jurisdiction,
          vulnerable_flag: cas.vulnerable_flag,
        },
        superseded_chunks: candidates.slice(0, 5).map((s) => ({
          title:     s.title,
          sim_score: s.sim_score,
        })),
      };

      let rawOutput = null;
      try {
        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 400,
          system: [
            {
              type: 'text',
              text: KNOWLEDGE_IMPACT_SYSTEM,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: JSON.stringify(contextPayload, null, 2) }],
        });
        rawOutput = response.content[0]?.text ?? '';
      } catch (err) {
        console.error(`[regulatoryMonitor] Claude call failed for case ${cas.case_ref}:`, err.message);
      }

      await client.query(
        `INSERT INTO ai_actions
           (case_id, action_type, ai_input, ai_output, ai_model, status)
         VALUES ($1, 'ruleset_impact_assessment', $2, $3, $4, 'pending')`,
        [
          cas.id,
          JSON.stringify(contextPayload),
          rawOutput,
          MODEL,
        ]
      );

      await writeAudit(client, {
        entityType: 'case',
        entityId:   cas.id,
        action:     'knowledge_superseded',
        newValue: {
          trigger:          'knowledge_update',
          new_chunk_id:     chunkId,
          superseded_count: supersededIds.length,
          jurisdiction:     chunk.jurisdiction,
          document_type:    chunk.document_type,
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

// ─────────────────────────────────────────────────────────────────────────────
// getMonitoringHealth()
//
// Returns per-source health objects with hours_since_check and health_status.
//   ok     – checked within expected frequency window
//   amber  – overdue by up to 2× the expected frequency
//   red    – overdue by more than 2× the expected frequency, or never checked
// ─────────────────────────────────────────────────────────────────────────────
export async function getMonitoringHealth() {
  const { rows: sources } = await pool.query(
    `SELECT
       rs.*,
       log_latest.checked_at         AS last_check_at,
       log_latest.error               AS last_check_error,
       log_latest.documents_ingested  AS last_check_ingested,
       COALESCE(monthly.ingested, 0)  AS documents_ingested_last_30_days
     FROM regulatory_sources rs
     LEFT JOIN LATERAL (
       SELECT checked_at, error, documents_ingested
       FROM regulatory_monitoring_log
       WHERE source_id = rs.id
       ORDER BY checked_at DESC
       LIMIT 1
     ) log_latest ON TRUE
     LEFT JOIN LATERAL (
       SELECT SUM(documents_ingested)::int AS ingested
       FROM regulatory_monitoring_log
       WHERE source_id = rs.id
         AND checked_at >= NOW() - INTERVAL '30 days'
     ) monthly ON TRUE
     WHERE rs.is_active = TRUE
     ORDER BY rs.jurisdiction, rs.name`
  );

  return sources.map((s) => {
    const now = Date.now();
    const freqMs = (s.check_frequency_hours ?? 24) * 60 * 60 * 1000;
    const lastAt = s.last_check_at ? new Date(s.last_check_at).getTime() : null;
    const elapsedMs = lastAt ? now - lastAt : Infinity;
    const hours_since_check = lastAt ? Math.round(elapsedMs / (1000 * 60 * 60)) : null;

    let health_status;
    if (!lastAt || elapsedMs > freqMs * 2) {
      health_status = 'red';
    } else if (elapsedMs > freqMs * 1.2) {
      health_status = 'amber';
    } else {
      health_status = 'ok';
    }

    return {
      id:                              s.id,
      name:                            s.name,
      jurisdiction:                    s.jurisdiction,
      source_type:                     s.source_type,
      url:                             s.url,
      check_frequency_hours:           s.check_frequency_hours,
      is_active:                       s.is_active,
      last_check_at:                   s.last_check_at,
      last_check_error:                s.last_check_error ?? null,
      hours_since_check,
      health_status,
      documents_ingested_last_30_days: s.documents_ingested_last_30_days,
    };
  });
}
