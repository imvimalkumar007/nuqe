-- ============================================================
-- NUQE — Migration 009: Add embedding column to knowledge_chunks
-- Required for the RAG knowledge retrieval engine.
-- ============================================================

ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- HNSW index for fast approximate nearest-neighbour cosine search
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
