-- ============================================================
-- NUQE — Migration 010: Organisation profile settings
-- Adds jurisdiction toggles, email sending config, and firm details.
-- ============================================================

ALTER TABLE organisation_ai_config
  ADD COLUMN IF NOT EXISTS enabled_jurisdictions text[]  NOT NULL DEFAULT ARRAY['UK'],
  ADD COLUMN IF NOT EXISTS from_email             text,
  ADD COLUMN IF NOT EXISTS org_name               text,
  ADD COLUMN IF NOT EXISTS fca_firm_reference     text;

-- Ensure UPSERT by organisation_id works
ALTER TABLE organisation_ai_config
  DROP CONSTRAINT IF EXISTS uq_org_ai_config_org_id;

ALTER TABLE organisation_ai_config
  ADD CONSTRAINT uq_org_ai_config_org_id UNIQUE (organisation_id);
