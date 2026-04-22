-- ============================================================
-- NUQE — Migration 006: Tokeniser additions
-- Custom tokens for the NLP/complaint-classification layer.
-- ============================================================

CREATE TABLE tokeniser_additions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pattern          TEXT,                       -- token pattern or regex to match
  label            VARCHAR(100),              -- classification label applied on match
  added_by         VARCHAR(20) NOT NULL DEFAULT 'human'
                   CHECK (added_by IN ('human', 'ai', 'system')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tokeniser_label ON tokeniser_additions(label);
