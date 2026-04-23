/**
 * Regulatory monitoring endpoints — returns mock data until the monitoring
 * engine is fully integrated. The PATCH /chunks/:id endpoint writes to the
 * DB when rows exist (mock chunk IDs won't be there, so it falls back to a
 * mock success response without error).
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { validate } from '../middleware/validate.js';

const patchChunkSchema = z.object({
  status:      z.enum(['active', 'rejected']),
  reviewer_id: z.string().optional().nullable(),
});

const router = Router();

// ─── Mock data ─────────────────────────────────────────────────────────────────
const BASE_SOURCES = [
  {
    id:            'fca-news',
    name:          'FCA News',
    url:           'https://www.fca.org.uk/news/rss.xml',
    jurisdiction:  'UK',
    type:          'RSS',
    interval_hours: 12,
    _lastCheckedMsAgo: 2   * 3600 * 1000,
    docs_this_month:  47,
    health_status: 'ok',
    active:        true,
  },
  {
    id:            'fca-publications',
    name:          'FCA Publications',
    url:           'https://www.fca.org.uk/publications/rss.xml',
    jurisdiction:  'UK',
    type:          'RSS',
    interval_hours: 24,
    _lastCheckedMsAgo: 11  * 3600 * 1000,
    docs_this_month:  12,
    health_status: 'ok',
    active:        true,
  },
  {
    id:            'fos-decisions',
    name:          'FOS Decisions',
    url:           'https://www.financial-ombudsman.org.uk/decisions',
    jurisdiction:  'UK',
    type:          'Scrape',
    interval_hours: 24,
    _lastCheckedMsAgo: 18  * 3600 * 1000,
    docs_this_month:   8,
    health_status: 'ok',
    active:        true,
  },
  {
    id:            'rbi-press',
    name:          'RBI Press Releases',
    url:           'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx',
    jurisdiction:  'India',
    type:          'Scrape',
    interval_hours: 24,
    _lastCheckedMsAgo: 27  * 3600 * 1000,
    docs_this_month:   5,
    health_status: 'amber',
    active:        true,
  },
  {
    id:            'eba-publications',
    name:          'EBA Publications',
    url:           'https://www.eba.europa.eu/publications',
    jurisdiction:  'EU',
    type:          'Scrape',
    interval_hours: 24,
    _lastCheckedMsAgo: 22  * 3600 * 1000,
    docs_this_month:   6,
    health_status: 'ok',
    active:        true,
  },
];

function buildSources() {
  const now = Date.now();
  return BASE_SOURCES.map(({ _lastCheckedMsAgo, ...s }) => ({
    ...s,
    last_checked_at:    new Date(now - _lastCheckedMsAgo).toISOString(),
    hours_since_check:  Math.round(_lastCheckedMsAgo / 3600000),
  }));
}

const MOCK_CHUNKS = [
  {
    id:              'p1',
    title:           'FCA Dear CEO Letter: Consumer Credit Affordability Standards (April 2026)',
    jurisdiction:    'UK',
    ingested_at:     '2026-04-22T19:45:00Z',
    source_name:     'FCA News',
    confidence_tier: 'high',
    status:          'pending_review',
    content:
      'The FCA expects all consumer credit lenders to implement robust affordability assessments that account for cost-of-living pressures. Firms should review their current frameworks against updated guidance by 30 June 2026. The letter emphasises the need for firms to consider vulnerability and arrears risk when assessing affordability, and to document their methodology clearly for supervisory review. Firms that fail to meet these standards may face supervisory intervention, including requirements to stop lending or remediate customer harm.',
  },
  {
    id:              'p2',
    title:           'RBI Circular DL-2026-031: Digital Lending — FLDG Arrangements (Revised)',
    jurisdiction:    'India',
    ingested_at:     '2026-04-22T17:20:00Z',
    source_name:     'RBI Press Releases',
    confidence_tier: 'high',
    status:          'pending_review',
    content:
      'Reserve Bank of India revises the cap on First Loss Default Guarantee arrangements. Regulated entities must ensure FLDG does not exceed 5% of the loan portfolio value. Existing arrangements to be wound down within 90 days of the circular date. Entities that have FLDG arrangements in excess of the revised cap must submit a wind-down plan to the Department of Regulation within 30 days.',
  },
  {
    id:              'p3',
    title:           'EBA/GL/2026/04: Guidelines on Internal Governance Under CRD VI (Updated)',
    jurisdiction:    'EU',
    ingested_at:     '2026-04-22T13:00:00Z',
    source_name:     'EBA Publications',
    confidence_tier: 'medium',
    status:          'pending_review',
    content:
      'European Banking Authority updates guidelines on internal governance requirements, extending diversity targets to management body nominations. National competent authorities must incorporate by 31 December 2026. The updated guidelines require institutions to establish formal diversity policies, set measurable targets, and report annually on progress. Non-compliance may result in competent authority intervention under Pillar 2.',
  },
];

const MOCK_LOG = [
  {
    id:            'rc1',
    event_type:    'approved',
    title:         'FCA PS26/2: Consumer Duty Annual Assessment — Clarified Expectations',
    jurisdiction:  'UK',
    approved_by:   'Sarah Jennings',
    effective_date: '2026-04-10',
    cases_impacted: 12,
    supersedes:    null,
    created_at:    '2026-04-10T09:00:00Z',
  },
  {
    id:            'rc2',
    event_type:    'approved',
    title:         'FOS Guidance Update: Mortgage Arrears and Tailored Support',
    jurisdiction:  'UK',
    approved_by:   'Michael Thornton',
    effective_date: '2026-03-28',
    cases_impacted: 4,
    supersedes:    null,
    created_at:    '2026-03-28T10:00:00Z',
  },
  {
    id:            'rc3',
    event_type:    'superseded',
    title:         'RBI Master Direction: FLDG Arrangements (DL-2026-031)',
    jurisdiction:  'India',
    approved_by:   'Amanda Kovacs',
    effective_date: '2026-03-15',
    cases_impacted: 8,
    supersedes:    'RBI Circular DL-2023-12',
    created_at:    '2026-03-15T08:00:00Z',
  },
  {
    id:            'rc4',
    event_type:    'approved',
    title:         'EBA/GL/2026/02: Remote Customer Due Diligence',
    jurisdiction:  'EU',
    approved_by:   'David Reyes',
    effective_date: '2026-03-01',
    cases_impacted: 2,
    supersedes:    null,
    created_at:    '2026-03-01T08:00:00Z',
  },
  {
    id:            'rc5',
    event_type:    'approved',
    title:         'FCA FG26/1: Financial Promotions — Real-time Communication Standards',
    jurisdiction:  'UK',
    approved_by:   'Sarah Jennings',
    effective_date: '2026-02-14',
    cases_impacted: 7,
    supersedes:    null,
    created_at:    '2026-02-14T09:00:00Z',
  },
  {
    id:            'rc6',
    event_type:    'approved',
    title:         'FCA CP26/1: Strengthening Operational Resilience in CASS',
    jurisdiction:  'UK',
    approved_by:   'Michael Thornton',
    effective_date: '2026-01-20',
    cases_impacted: 3,
    supersedes:    null,
    created_at:    '2026-01-20T10:00:00Z',
  },
  {
    id:            'rc7',
    event_type:    'approved',
    title:         'RBI Master Circular: Customer Service in Banks (2025-26)',
    jurisdiction:  'India',
    approved_by:   'Amanda Kovacs',
    effective_date: '2025-07-01',
    cases_impacted: 5,
    supersedes:    null,
    created_at:    '2025-07-01T06:00:00Z',
  },
  {
    id:            'rc8',
    event_type:    'approved',
    title:         'EBA/REC/2025/01: Recommendations on Outsourcing to Cloud Providers',
    jurisdiction:  'EU',
    approved_by:   'David Reyes',
    effective_date: '2025-05-10',
    cases_impacted: 1,
    supersedes:    null,
    created_at:    '2025-05-10T08:00:00Z',
  },
  {
    id:            'rc9',
    event_type:    'approved',
    title:         'FCA PS25/9: Consumer Duty — Closed Products and Services Review',
    jurisdiction:  'UK',
    approved_by:   'Sarah Jennings',
    effective_date: '2025-04-01',
    cases_impacted: 19,
    supersedes:    null,
    created_at:    '2025-04-01T09:00:00Z',
  },
  {
    id:            'rc10',
    event_type:    'superseded',
    title:         'FCA COBS 4.2: Communicating with Retail Clients (Revised)',
    jurisdiction:  'UK',
    approved_by:   'Michael Thornton',
    effective_date: '2025-02-01',
    cases_impacted: 6,
    supersedes:    'FCA COBS 4.2 (2022 version)',
    created_at:    '2025-02-01T10:00:00Z',
  },
];

// ─── GET /sources ─────────────────────────────────────────────────────────────
router.get('/sources', (_req, res) => {
  res.json(buildSources());
});

// ─── POST /sources/:id/check ──────────────────────────────────────────────────
router.post('/sources/:id/check', (req, res) => {
  const { id } = req.params;
  const source = BASE_SOURCES.find((s) => s.id === id);
  if (!source) return res.status(404).json({ error: 'Source not found' });

  res.json({
    id,
    checked_at:    new Date().toISOString(),
    health_status: 'ok',
    new_docs:      0,
    message:       `${source.name} checked successfully. No new documents found.`,
  });
});

// ─── GET /monitoring-health ───────────────────────────────────────────────────
router.get('/monitoring-health', (_req, res) => {
  const now = Date.now();

  const jurisdictions = [
    {
      jurisdiction:  'UK',
      health_status: 'ok',
      last_check_at: new Date(now - 2 * 3600 * 1000).toISOString(),
      docs_7d:       23,
      docs_30d:      67,
      sources_count: 3,
    },
    {
      jurisdiction:  'India',
      health_status: 'amber',
      last_check_at: new Date(now - 27 * 3600 * 1000).toISOString(),
      docs_7d:        3,
      docs_30d:       5,
      sources_count:  1,
    },
    {
      jurisdiction:  'EU',
      health_status: 'ok',
      last_check_at: new Date(now - 22 * 3600 * 1000).toISOString(),
      docs_7d:        4,
      docs_30d:       6,
      sources_count:  1,
    },
  ];

  const overallOk = jurisdictions.every((j) => j.health_status === 'ok');
  res.json({
    overall_health: overallOk ? 'ok' : 'amber',
    jurisdictions,
  });
});

// ─── GET /chunks ──────────────────────────────────────────────────────────────
// Supports ?status=pending_review (and other filters for future use)
router.get('/chunks', async (req, res) => {
  const { status, jurisdiction, limit = '50' } = req.query;
  const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  // Try real DB first; fall back to mock if no rows or DB error
  try {
    const params = [cap];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`kc.status = $${params.length}`);
    }
    if (jurisdiction) {
      params.push(jurisdiction);
      conditions.push(`kc.jurisdiction = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT kc.*,
              rs.name AS source_name
       FROM   knowledge_chunks kc
       LEFT JOIN regulatory_sources rs ON rs.id = kc.source_id
       ${where}
       ORDER BY kc.created_at DESC
       LIMIT $1`,
      params
    );

    if (rows.length > 0) return res.json(rows);
  } catch {
    // fall through to mock
  }

  // Return mock pending chunks
  let results = MOCK_CHUNKS;
  if (status) results = results.filter((c) => c.status === status);
  if (jurisdiction) results = results.filter((c) => c.jurisdiction === jurisdiction);
  res.json(results.slice(0, cap));
});

// ─── PATCH /chunks/:id ────────────────────────────────────────────────────────
// status: 'active' (approve) | 'rejected' (reject / dismiss)
router.patch('/chunks/:id', validate(patchChunkSchema), async (req, res) => {
  const { id } = req.params;
  const { status, reviewer_id } = req.body;

  const dbStatus = status === 'rejected' ? 'archived' : 'active';

  try {
    const { rows } = await pool.query(
      `UPDATE knowledge_chunks
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [dbStatus, id]
    );

    if (rows.length > 0) {
      return res.json({ ...rows[0], status });
    }
  } catch {
    // fall through to mock success
  }

  // Mock success for seed/mock IDs
  return res.json({ id, status, updated: true });
});

// ─── GET /monitoring-log ──────────────────────────────────────────────────────
router.get('/monitoring-log', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  res.json(MOCK_LOG.slice(0, limit));
});

export default router;
