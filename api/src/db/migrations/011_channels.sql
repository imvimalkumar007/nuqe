-- ============================================================
-- NUQE — Migration 011: Channels and user channel assignments
-- Named case queues per organisation, with staff assignments.
-- ============================================================

-- ── 1. Channels ──────────────────────────────────────────────
-- One row per logical queue (complaints, arrears, general, dsar…).
-- inbound_email   = client's own address (complaints@lender.com) — display only
-- nuqe_inbound    = Nuqe-owned routing address (complaints-abc12345@inbound.nuqe.io)
CREATE TABLE channels (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id      UUID NOT NULL,
  name                 VARCHAR(60)  NOT NULL,    -- slug: 'complaints', 'arrears'
  display_name         VARCHAR(100) NOT NULL,    -- 'Complaints Team'
  inbound_email        VARCHAR(200),             -- client's own email (for display)
  nuqe_inbound         VARCHAR(200) UNIQUE,      -- Nuqe routing address (for webhook match)
  case_categories      text[],                   -- cases.category values routed here
  is_active            BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organisation_id, name)
);

CREATE INDEX idx_channels_org      ON channels(organisation_id, is_active);
CREATE INDEX idx_channels_inbound  ON channels(nuqe_inbound);

-- ── 2. User ↔ Channel (many-to-many) ─────────────────────────
CREATE TABLE user_channel_assignments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  channel_id  UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  can_write   BOOLEAN DEFAULT TRUE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, channel_id)
);

CREATE INDEX idx_uca_user    ON user_channel_assignments(user_id);
CREATE INDEX idx_uca_channel ON user_channel_assignments(channel_id);

-- ── 3. Link cases to a channel ────────────────────────────────
-- Nullable — existing cases are not broken; populated by routing webhook
-- or manual assignment from the UI.
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES channels(id);

CREATE INDEX idx_cases_channel ON cases(channel_id);
