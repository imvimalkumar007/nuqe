-- ============================================================
-- NUQE — Migration 005: Regulatory monitoring
-- ============================================================


-- ── 1. pg_trgm for text similarity (supersession detection) ──
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ── 2. Regulatory sources registry ───────────────────────────
CREATE TABLE regulatory_sources (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                   VARCHAR(100) NOT NULL,
  jurisdiction           VARCHAR(10)  NOT NULL CHECK (jurisdiction IN ('UK', 'IN', 'EU')),
  source_type            VARCHAR(20)  NOT NULL CHECK (source_type IN ('rss', 'scrape', 'api')),
  url                    VARCHAR(500) NOT NULL,
  document_type          VARCHAR(50),
  last_checked_at        TIMESTAMPTZ,
  last_document_ref      VARCHAR(300),  -- ISO date (RSS) or URL fragment (scrape) of most recent seen item
  is_active              BOOLEAN      DEFAULT TRUE,
  check_frequency_hours  INTEGER      DEFAULT 24,
  metadata               JSONB,         -- per-source scrape config (CSS selectors etc.)
  created_at             TIMESTAMPTZ  DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_reg_sources_jurisdiction ON regulatory_sources(jurisdiction);
CREATE INDEX idx_reg_sources_active       ON regulatory_sources(is_active);

CREATE TRIGGER trg_regulatory_sources_updated_at
  BEFORE UPDATE ON regulatory_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 3. Per-check monitoring log ───────────────────────────────
CREATE TABLE regulatory_monitoring_log (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id           UUID NOT NULL REFERENCES regulatory_sources(id),
  checked_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  documents_found     INTEGER DEFAULT 0,
  documents_ingested  INTEGER DEFAULT 0,
  error               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reg_log_source  ON regulatory_monitoring_log(source_id);
CREATE INDEX idx_reg_log_checked ON regulatory_monitoring_log(checked_at DESC);


-- ── 4. Extend knowledge_chunks for monitoring lifecycle ───────

-- Drop existing CHECK constraints so we can widen the allowed values
ALTER TABLE knowledge_chunks
  DROP CONSTRAINT IF EXISTS knowledge_chunks_status_check;
ALTER TABLE knowledge_chunks
  DROP CONSTRAINT IF EXISTS knowledge_chunks_confidence_tier_check;

-- Wider status: add pending_review and superseded
ALTER TABLE knowledge_chunks
  ADD CONSTRAINT knowledge_chunks_status_check
  CHECK (status IN ('active', 'archived', 'draft', 'pending_review', 'superseded'));

-- Wider confidence_tier: add auto_ingested
ALTER TABLE knowledge_chunks
  ADD CONSTRAINT knowledge_chunks_confidence_tier_check
  CHECK (confidence_tier IN ('verified', 'provisional', 'unverified', 'auto_ingested'));

-- Lifecycle columns
ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS source_id     UUID REFERENCES regulatory_sources(id),
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES knowledge_chunks(id),
  ADD COLUMN IF NOT EXISTS effective_to  TIMESTAMPTZ;

-- Trigram index for similarity search used by propagateKnowledgeUpdate
CREATE INDEX idx_knowledge_chunks_trgm
  ON knowledge_chunks USING gin (chunk_text gin_trgm_ops);

CREATE INDEX idx_knowledge_superseded ON knowledge_chunks(status, effective_to)
  WHERE status = 'superseded';


-- ── 5. Seed regulatory sources ────────────────────────────────
INSERT INTO regulatory_sources
  (name, jurisdiction, source_type, url, document_type, check_frequency_hours) VALUES

('FCA News RSS',
 'UK', 'rss',
 'https://www.fca.org.uk/news/rss.xml',
 'guidance', 12),

('FCA Publications RSS',
 'UK', 'rss',
 'https://www.fca.org.uk/publications/rss.xml',
 'guidance', 24),

('FOS Decisions RSS',
 'UK', 'rss',
 'https://www.financial-ombudsman.org.uk/decisions/search?DT=decisions&RSS=1',
 'decision', 24),

('RBI Press Releases',
 'IN', 'scrape',
 'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx',
 'circular', 24),

('EBA Publications',
 'EU', 'scrape',
 'https://www.eba.europa.eu/regulation-and-policy',
 'guidance', 24);
