-- ============================================================
-- NUQE — Migration 007: Knowledge documents
-- Parent document records for the RAG knowledge layer.
-- knowledge_chunks rows belong to these documents.
-- ============================================================

CREATE TABLE knowledge_documents (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id  UUID,                       -- NULL = global / cross-org regulatory
  jurisdiction     VARCHAR(10)
                   CHECK (jurisdiction IN ('UK', 'IN', 'EU')),
  document_type    VARCHAR(50)
                   CHECK (document_type IN (
                     'regulation', 'guidance', 'circular',
                     'directive', 'decision', 'industry_guidance', 'internal_policy'
                   )),
  source_ref       VARCHAR(300),               -- e.g. 'DISP 1.6', 'RBI/2021/117'
  title            VARCHAR(300) NOT NULL,
  description      TEXT,
  version          VARCHAR(50),
  status           VARCHAR(20) NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'archived', 'draft')),
  published_at     DATE,
  url              TEXT,
  metadata         JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_docs_jurisdiction ON knowledge_documents(jurisdiction);
CREATE INDEX idx_knowledge_docs_doc_type     ON knowledge_documents(document_type);
CREATE INDEX idx_knowledge_docs_status       ON knowledge_documents(status);
CREATE INDEX idx_knowledge_docs_org          ON knowledge_documents(organisation_id);

CREATE TRIGGER trg_knowledge_documents_updated_at
  BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
