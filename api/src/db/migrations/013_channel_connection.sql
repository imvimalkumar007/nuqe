-- ============================================================
-- NUQE — Migration 013: Per-channel SMTP / IMAP connection config
-- Replaces the Mailgun forwarding approach (nuqe_inbound) with
-- direct connection to the client's own mailbox.
-- ============================================================

-- Drop the Mailgun-era routing column (no longer used)
DROP INDEX IF EXISTS idx_channels_inbound;
ALTER TABLE channels DROP COLUMN IF EXISTS nuqe_inbound;

-- IMAP inbound — read the client's own mailbox
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS imap_host        text,
  ADD COLUMN IF NOT EXISTS imap_port        integer  DEFAULT 993,
  ADD COLUMN IF NOT EXISTS imap_username    text,
  ADD COLUMN IF NOT EXISTS imap_password    text,        -- AES-256-GCM encrypted (crypto.js)
  ADD COLUMN IF NOT EXISTS imap_tls         boolean  DEFAULT true;

-- SMTP outbound — send from the client's own address
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS smtp_host        text,
  ADD COLUMN IF NOT EXISTS smtp_port        integer  DEFAULT 587,
  ADD COLUMN IF NOT EXISTS smtp_username    text,
  ADD COLUMN IF NOT EXISTS smtp_password    text,        -- AES-256-GCM encrypted
  ADD COLUMN IF NOT EXISTS smtp_from        text,        -- "Acme Complaints <complaints@acme.com>"
  ADD COLUMN IF NOT EXISTS smtp_tls         boolean  DEFAULT true;

-- OAuth2 (Google Workspace / Microsoft 365) — alternative to SMTP/IMAP passwords
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS oauth_provider   text
    CHECK (oauth_provider IN ('google', 'microsoft')),
  ADD COLUMN IF NOT EXISTS oauth_token      text;        -- encrypted refresh token (future use)

-- Connection health tracking
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS connection_status text DEFAULT 'unconfigured'
    CHECK (connection_status IN ('unconfigured', 'connected', 'error')),
  ADD COLUMN IF NOT EXISTS connection_error  text,
  ADD COLUMN IF NOT EXISTS last_synced_at    timestamptz;
