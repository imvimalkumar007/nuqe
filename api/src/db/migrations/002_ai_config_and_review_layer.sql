-- ============================================================
-- NUQE — Migration 002: AI config and human review layer
-- ============================================================


-- ── 1. Extend ai_actions with review and provider columns ────
ALTER TABLE ai_actions
  ADD COLUMN human_output                      TEXT,
  ADD COLUMN was_edited                        BOOLEAN      DEFAULT FALSE,
  ADD COLUMN ai_classification                 VARCHAR(60),
  ADD COLUMN human_classification              VARCHAR(60),
  ADD COLUMN ai_provider                       VARCHAR(30),
  ADD COLUMN tokenisation_applied              BOOLEAN      DEFAULT TRUE,
  ADD COLUMN tokenisation_low_confidence_flags INTEGER      DEFAULT 0;


-- ── 2. Indexes to support model comparison queries ───────────
CREATE INDEX idx_ai_actions_provider ON ai_actions(ai_provider);
CREATE INDEX idx_ai_actions_model    ON ai_actions(ai_model);


-- ── 3. Organisation AI configuration table ───────────────────
-- Stores primary and challenger provider config per organisation.
-- API keys are stored encrypted — the application layer is
-- responsible for encrypt/decrypt via a KMS or secret store.
CREATE TABLE organisation_ai_config (
  id                               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id                  UUID NOT NULL,

  -- Primary provider
  primary_provider                 VARCHAR(30) NOT NULL
                                   CHECK (primary_provider IN ('claude', 'openai', 'gemini', 'custom')),
  primary_model                    VARCHAR(100) NOT NULL,
  primary_api_key_encrypted        TEXT NOT NULL,
  primary_endpoint_url             VARCHAR(300),

  -- Challenger provider (A/B routing)
  challenger_provider              VARCHAR(30)
                                   CHECK (challenger_provider IN ('claude', 'openai', 'gemini', 'custom')),
  challenger_model                 VARCHAR(100),
  challenger_api_key_encrypted     TEXT,
  challenger_endpoint_url          VARCHAR(300),
  challenger_percentage            INTEGER DEFAULT 0
                                   CHECK (challenger_percentage BETWEEN 0 AND 100),

  -- Data governance
  data_agreement_tier              VARCHAR(30) NOT NULL
                                   CHECK (data_agreement_tier IN (
                                     'standard',
                                     'enterprise_zero_retention',
                                     'self_hosted'
                                   )),
  tokenisation_enabled             BOOLEAN DEFAULT TRUE,

  created_at                       TIMESTAMPTZ DEFAULT NOW(),
  updated_at                       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_org_ai_config_updated_at
  BEFORE UPDATE ON organisation_ai_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
