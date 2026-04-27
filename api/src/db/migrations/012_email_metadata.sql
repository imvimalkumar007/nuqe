-- ============================================================
-- NUQE — Migration 012: Email metadata on communications
-- Enables thread matching, CC/BCC, delivery tracking,
-- and internal staff notes.
-- ============================================================

ALTER TABLE communications
  ADD COLUMN IF NOT EXISTS cc              text[],
  ADD COLUMN IF NOT EXISTS bcc             text[],
  ADD COLUMN IF NOT EXISTS message_id      text,        -- RFC Message-ID header (outbound)
  ADD COLUMN IF NOT EXISTS in_reply_to     text,        -- RFC In-Reply-To header (inbound)
  ADD COLUMN IF NOT EXISTS resend_id       text,        -- Resend email ID for delivery tracking
  ADD COLUMN IF NOT EXISTS delivery_status text
    CHECK (delivery_status IN ('sent','delivered','opened','bounced','failed')),
  ADD COLUMN IF NOT EXISTS is_internal     boolean DEFAULT FALSE;  -- staff-only note, never sent

CREATE INDEX idx_comms_message_id  ON communications(message_id)  WHERE message_id  IS NOT NULL;
CREATE INDEX idx_comms_in_reply_to ON communications(in_reply_to) WHERE in_reply_to IS NOT NULL;
CREATE INDEX idx_comms_resend_id   ON communications(resend_id)   WHERE resend_id   IS NOT NULL;
CREATE INDEX idx_comms_is_internal ON communications(is_internal, case_id);
