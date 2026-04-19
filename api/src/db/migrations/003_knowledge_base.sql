-- ============================================================
-- NUQE — Migration 003: Knowledge base (RAG chunks)
-- ============================================================

CREATE TABLE knowledge_chunks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  namespace        VARCHAR(50)  NOT NULL
                   CHECK (namespace IN ('regulatory', 'global', 'internal')),
  jurisdiction     VARCHAR(10)
                   CHECK (jurisdiction IN ('UK', 'IN', 'EU')),   -- NULL = global / cross-jurisdiction
  document_type    VARCHAR(50)
                   CHECK (document_type IN (
                     'regulation', 'guidance', 'circular',
                     'directive', 'decision', 'industry_guidance'
                   )),
  source_document  VARCHAR(300) NOT NULL,   -- e.g. 'DISP 1.6', 'RBI/2021/117'
  title            VARCHAR(300) NOT NULL,
  chunk_text       TEXT         NOT NULL,

  confidence_tier  VARCHAR(20)  NOT NULL DEFAULT 'provisional'
                   CHECK (confidence_tier IN ('verified', 'provisional', 'unverified')),
  status           VARCHAR(20)  NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'archived', 'draft')),

  token_count      INTEGER,               -- approximate, for prompt-budget planning
  metadata         JSONB,

  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  DEFAULT NOW(),

  -- Idempotent seed key: a given section of a given instrument is unique
  CONSTRAINT uq_knowledge_source_title UNIQUE (source_document, title)
);

CREATE INDEX idx_knowledge_namespace     ON knowledge_chunks(namespace);
CREATE INDEX idx_knowledge_jurisdiction  ON knowledge_chunks(jurisdiction);
CREATE INDEX idx_knowledge_status        ON knowledge_chunks(status);
CREATE INDEX idx_knowledge_confidence    ON knowledge_chunks(confidence_tier);
CREATE INDEX idx_knowledge_doc_type      ON knowledge_chunks(document_type);

CREATE TRIGGER trg_knowledge_chunks_updated_at
  BEFORE UPDATE ON knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
