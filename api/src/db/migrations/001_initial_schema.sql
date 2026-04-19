-- ============================================================
-- NUQE — PostgreSQL Schema v0.1
-- Paste each block into Claude Code in sequence
-- ============================================================


-- ── BLOCK 1: Extensions and setup ───────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ── BLOCK 2: Ruleset (load before cases – FK dependency) ─────
-- Compliance rules as data, not code.
-- One row per rule per jurisdiction per version.
CREATE TABLE ruleset (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  jurisdiction      VARCHAR(10) NOT NULL CHECK (jurisdiction IN ('UK', 'IN', 'EU')),
  version           VARCHAR(20) NOT NULL,               -- e.g. 'UK-2024-v1'
  rule_type         VARCHAR(60) NOT NULL,               -- e.g. 'ACKNOWLEDGE', 'FINAL_RESPONSE', 'FOS_REFERRAL'
  threshold_days    INTEGER NOT NULL,                   -- calendar days from case open
  threshold_business_days BOOLEAN DEFAULT FALSE,        -- true = business days only
  escalation_path   VARCHAR(100),                       -- e.g. 'FOS', 'RBI_OMBUDSMAN', 'NCA'
  regulatory_ref    VARCHAR(100),                       -- e.g. 'DISP 1.6.2', 'RBI/2023/45'
  is_active         BOOLEAN DEFAULT TRUE,
  effective_from    DATE NOT NULL,
  effective_to      DATE,                               -- null = currently active
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ruleset_jurisdiction ON ruleset(jurisdiction, is_active);
CREATE INDEX idx_ruleset_version ON ruleset(version);

-- Seed: UK FCA / DISP rulesets
INSERT INTO ruleset (jurisdiction, version, rule_type, threshold_days, threshold_business_days, escalation_path, regulatory_ref, effective_from) VALUES
('UK', 'UK-FCA-2024-v1', 'ACKNOWLEDGE',       3,  FALSE, NULL,  'DISP 1.6.1', '2024-01-01'),
('UK', 'UK-FCA-2024-v1', 'FINAL_RESPONSE',   56,  FALSE, NULL,  'DISP 1.6.2', '2024-01-01'),
('UK', 'UK-FCA-2024-v1', 'FOS_REFERRAL',     56,  FALSE, 'FOS', 'DISP 2.8',   '2024-01-01');

-- Seed: India RBI / Integrated Ombudsman Scheme
INSERT INTO ruleset (jurisdiction, version, rule_type, threshold_days, threshold_business_days, escalation_path, regulatory_ref, effective_from) VALUES
('IN', 'IN-RBI-2024-v1', 'ACKNOWLEDGE',       5,  TRUE,  NULL,           'RBI/IOS/2021', '2024-01-01'),
('IN', 'IN-RBI-2024-v1', 'FINAL_RESPONSE',   30,  FALSE, NULL,           'RBI/IOS/2021', '2024-01-01'),
('IN', 'IN-RBI-2024-v1', 'OMBUDSMAN_REFERRAL', 30, FALSE, 'RBI_OMBUDSMAN','RBI/IOS/2021', '2024-01-01');

-- Seed: EU EBA complaint handling guidelines
INSERT INTO ruleset (jurisdiction, version, rule_type, threshold_days, threshold_business_days, escalation_path, regulatory_ref, effective_from) VALUES
('EU', 'EU-EBA-2024-v1', 'ACKNOWLEDGE',        5, TRUE,  NULL,  'EBA/GL/2012/01', '2024-01-01'),
('EU', 'EU-EBA-2024-v1', 'FINAL_RESPONSE',    15, TRUE,  NULL,  'EBA/GL/2012/01', '2024-01-01'),
('EU', 'EU-EBA-2024-v1', 'FINAL_RESPONSE_EXT', 35, TRUE, NULL,  'EBA/GL/2012/01', '2024-01-01'),
('EU', 'EU-EBA-2024-v1', 'ADR_REFERRAL',      35, TRUE,  'NCA', 'ADR Directive',  '2024-01-01');


-- ── BLOCK 3: Customers ───────────────────────────────────────
CREATE TABLE customers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_ref      VARCHAR(50) UNIQUE,                 -- lender's own customer ID
  full_name         VARCHAR(150) NOT NULL,
  email             VARCHAR(200),
  phone             VARCHAR(30),
  jurisdiction      VARCHAR(10) NOT NULL CHECK (jurisdiction IN ('UK', 'IN', 'EU')),
  consent_status    VARCHAR(20) DEFAULT 'given'
                    CHECK (consent_status IN ('given', 'withdrawn', 'pending')),
  vulnerable_flag   BOOLEAN DEFAULT FALSE,              -- Consumer Duty / CONC vulnerability
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_jurisdiction ON customers(jurisdiction);
CREATE INDEX idx_customers_external_ref ON customers(external_ref);


-- ── BLOCK 4: Cases ───────────────────────────────────────────
CREATE TABLE cases (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_ref          VARCHAR(30) UNIQUE NOT NULL,        -- e.g. NQ-2024-0001
  customer_id       UUID NOT NULL REFERENCES customers(id),
  ruleset_id        UUID NOT NULL REFERENCES ruleset(id),-- jurisdiction ruleset at time of open
  status            VARCHAR(30) DEFAULT 'open'
                    CHECK (status IN ('open','under_review','pending_response',
                                      'awaiting_customer','fos_referred',
                                      'ombudsman_referred','closed_upheld',
                                      'closed_not_upheld','closed_withdrawn')),
  category          VARCHAR(60),                        -- e.g. 'irresponsible_lending', 'arrears_handling'
  channel_received  VARCHAR(20)
                    CHECK (channel_received IN ('email','chat','postal','phone','in_person')),
  assigned_to       UUID,                               -- staff member UUID (users table – add later)
  opened_at         TIMESTAMPTZ DEFAULT NOW(),
  closed_at         TIMESTAMPTZ,
  is_implicit       BOOLEAN DEFAULT FALSE,              -- AI-detected complaint, not explicitly labelled
  ai_detected       BOOLEAN DEFAULT FALSE,              -- flagged by communication engine
  fos_ref           VARCHAR(50),                        -- FOS / ombudsman reference if escalated
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cases_customer ON cases(customer_id);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_opened_at ON cases(opened_at);

-- Auto-generate case reference
CREATE SEQUENCE case_ref_seq START 1;
CREATE OR REPLACE FUNCTION generate_case_ref()
RETURNS TRIGGER AS $$
BEGIN
  NEW.case_ref := 'NQ-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                  LPAD(nextval('case_ref_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_case_ref
  BEFORE INSERT ON cases
  FOR EACH ROW
  WHEN (NEW.case_ref IS NULL OR NEW.case_ref = '')
  EXECUTE FUNCTION generate_case_ref();


-- ── BLOCK 5: Communications ──────────────────────────────────
-- Every customer-facing written communication unified in one table.
CREATE TABLE communications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id           UUID REFERENCES cases(id),          -- null if not yet linked to a case
  customer_id       UUID NOT NULL REFERENCES customers(id),
  channel           VARCHAR(20) NOT NULL
                    CHECK (channel IN ('email','chat','postal')),
  direction         VARCHAR(10) NOT NULL
                    CHECK (direction IN ('inbound','outbound')),
  subject           VARCHAR(300),                       -- email subject / postal title
  body              TEXT NOT NULL,
  body_plain        TEXT,                               -- stripped version for AI processing
  author_type       VARCHAR(20)
                    CHECK (author_type IN ('customer','staff','ai_draft','system')),
  author_id         UUID,                               -- staff UUID if author_type = staff
  ai_generated      BOOLEAN DEFAULT FALSE,
  ai_approved_by    UUID,                               -- staff UUID who approved AI draft
  ai_approved_at    TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  read_at           TIMESTAMPTZ,
  external_ref      VARCHAR(100),                       -- email message-id, chat thread id
  metadata          JSONB,                              -- channel-specific extra fields
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comms_case ON communications(case_id);
CREATE INDEX idx_comms_customer ON communications(customer_id);
CREATE INDEX idx_comms_channel ON communications(channel);
CREATE INDEX idx_comms_sent_at ON communications(sent_at);


-- ── BLOCK 6: Deadlines ───────────────────────────────────────
-- Calculated regulatory deadlines per case, derived from ruleset.
CREATE TABLE deadlines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id           UUID NOT NULL REFERENCES cases(id),
  ruleset_id        UUID NOT NULL REFERENCES ruleset(id),
  deadline_type     VARCHAR(60) NOT NULL,               -- mirrors ruleset.rule_type
  due_at            TIMESTAMPTZ NOT NULL,               -- calculated from case opened_at + threshold
  alerted_at_5d     TIMESTAMPTZ,                        -- when 5-day alert was fired
  alerted_at_48h    TIMESTAMPTZ,                        -- when 48-hour alert was fired
  alerted_at_24h    TIMESTAMPTZ,                        -- when 24-hour alert was fired
  met_at            TIMESTAMPTZ,                        -- when deadline was satisfied
  breached          BOOLEAN DEFAULT FALSE,
  breached_at       TIMESTAMPTZ,
  breach_reason     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deadlines_case ON deadlines(case_id);
CREATE INDEX idx_deadlines_due_at ON deadlines(due_at);
CREATE INDEX idx_deadlines_breached ON deadlines(breached);


-- ── BLOCK 7: AI Actions ──────────────────────────────────────
-- Every AI action with human review gate.
-- Nothing AI-generated goes out without an approval row here.
CREATE TABLE ai_actions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id           UUID REFERENCES cases(id),
  communication_id  UUID REFERENCES communications(id),
  action_type       VARCHAR(60) NOT NULL
                    CHECK (action_type IN (
                      'complaint_classification',
                      'implicit_complaint_detection',
                      'response_draft',
                      'risk_flag',
                      'conduct_risk_flag',
                      'fos_pack_generation',
                      'deadline_alert',
                      'ruleset_impact_assessment'
                    )),
  ai_input          TEXT,                               -- prompt / context sent to model
  ai_output         TEXT NOT NULL,                      -- raw model response
  ai_model          VARCHAR(60),                        -- e.g. claude-sonnet-4-6
  confidence_score  NUMERIC(4,3),                       -- 0.000 to 1.000
  status            VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','superseded')),
  reviewed_by       UUID,                               -- staff UUID
  reviewed_at       TIMESTAMPTZ,
  review_note       TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_actions_case ON ai_actions(case_id);
CREATE INDEX idx_ai_actions_status ON ai_actions(status);
CREATE INDEX idx_ai_actions_type ON ai_actions(action_type);


-- ── BLOCK 8: Audit Log ───────────────────────────────────────
-- Immutable append-only record. No updates, no deletes ever.
CREATE TABLE audit_log (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type       VARCHAR(40) NOT NULL,               -- 'case', 'communication', 'ai_action', 'ruleset', etc.
  entity_id         UUID NOT NULL,
  action            VARCHAR(60) NOT NULL,               -- 'created', 'status_changed', 'deadline_breached', etc.
  actor_type        VARCHAR(20) NOT NULL
                    CHECK (actor_type IN ('staff','ai','system','customer')),
  actor_id          UUID,                               -- staff or customer UUID
  previous_value    JSONB,                              -- state before action
  new_value         JSONB,                              -- state after action
  ip_address        INET,
  user_agent        TEXT,
  ts                TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_ts ON audit_log(ts);
CREATE INDEX idx_audit_actor ON audit_log(actor_type, actor_id);

-- Prevent any modifications to audit log
CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;


-- ── BLOCK 9: Utility triggers ────────────────────────────────
-- Auto-update updated_at on all mutable tables
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_cases_updated_at
  BEFORE UPDATE ON cases FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_deadlines_updated_at
  BEFORE UPDATE ON deadlines FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ruleset_updated_at
  BEFORE UPDATE ON ruleset FOR EACH ROW EXECUTE FUNCTION update_updated_at();
