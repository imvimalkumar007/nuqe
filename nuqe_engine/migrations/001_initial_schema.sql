-- Migration 001: Initial schema
-- Schema: nuqe_engine
-- All tables live in the nuqe_engine schema, isolated from any legacy schema.

CREATE SCHEMA IF NOT EXISTS nuqe_engine;

-- ── obligations ────────────────────────────────────────────────────────
-- One row per (obligation_id, version). Cases bind to this composite key,
-- never to obligation_id alone (locked architectural decision).

CREATE TABLE IF NOT EXISTS nuqe_engine.obligations (
    obligation_id           TEXT NOT NULL,
    version                 TEXT NOT NULL,
    jurisdiction            TEXT NOT NULL,
    regulator               TEXT NOT NULL,
    framework               TEXT NOT NULL,
    source_provision_type   TEXT NOT NULL,
    obligation_name         TEXT NOT NULL,
    source_document         TEXT NOT NULL,
    source_url              TEXT NOT NULL,
    product_types           JSONB NOT NULL,
    customer_segments       JSONB NOT NULL,
    trigger_condition       JSONB NOT NULL,
    requirement             JSONB NOT NULL,
    deadline_value          INTEGER,
    deadline_unit           TEXT NOT NULL,
    deadline_anchor         TEXT NOT NULL,
    evidence_required       JSONB NOT NULL,
    breach_consequence      TEXT NOT NULL,
    exceptions              JSONB NOT NULL DEFAULT '[]',
    overlay_of              TEXT,
    supersedes              TEXT,
    effective_from          DATE NOT NULL,
    effective_to            DATE,
    review_status           TEXT NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (obligation_id, version)
);

CREATE INDEX IF NOT EXISTS idx_obligations_framework
    ON nuqe_engine.obligations (framework);

CREATE INDEX IF NOT EXISTS idx_obligations_jurisdiction
    ON nuqe_engine.obligations (jurisdiction);

CREATE INDEX IF NOT EXISTS idx_obligations_effective_from
    ON nuqe_engine.obligations (effective_from);

CREATE INDEX IF NOT EXISTS idx_obligations_overlay_of
    ON nuqe_engine.obligations (overlay_of)
    WHERE overlay_of IS NOT NULL;


-- ── cases ──────────────────────────────────────────────────────────────
-- Opened by F2+ via the API; the engine reads cases to resolve context.

CREATE TABLE IF NOT EXISTS nuqe_engine.cases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_ref    TEXT,
    type            TEXT NOT NULL,
    status          TEXT NOT NULL,
    customer_id     TEXT,
    opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ,
    context         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── fired_obligations ──────────────────────────────────────────────────
-- One row per obligation that fired against a case. UNIQUE on
-- (case_id, obligation_id, obligation_version) prevents double-firing.

CREATE TABLE IF NOT EXISTS nuqe_engine.fired_obligations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES nuqe_engine.cases (id),
    obligation_id       TEXT NOT NULL,
    obligation_version  TEXT NOT NULL,
    fired_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trigger_event       TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'open',
    satisfied_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (obligation_id, obligation_version)
        REFERENCES nuqe_engine.obligations (obligation_id, version),

    UNIQUE (case_id, obligation_id, obligation_version)
);


-- ── deadlines ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nuqe_engine.deadlines (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fired_obligation_id     UUID NOT NULL REFERENCES nuqe_engine.fired_obligations (id),
    due_at                  TIMESTAMPTZ NOT NULL,
    anchor_event_at         TIMESTAMPTZ NOT NULL,
    deadline_value          INTEGER NOT NULL,
    deadline_unit           TEXT NOT NULL,
    deadline_anchor         TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'pending',
    met_at                  TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deadlines_status_due_at
    ON nuqe_engine.deadlines (status, due_at);


-- ── evidence_checks ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nuqe_engine.evidence_checks (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fired_obligation_id     UUID NOT NULL REFERENCES nuqe_engine.fired_obligations (id),
    evidence_index          INTEGER NOT NULL,
    checked_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    found                   BOOLEAN NOT NULL,
    location                TEXT NOT NULL,
    selector                TEXT NOT NULL,
    notes                   TEXT
);


-- ── audit_log — APPEND ONLY ────────────────────────────────────────────
-- UPDATE and DELETE are blocked at the database level via rules.
-- Every row is HMAC-signed by the engine before insert.

CREATE TABLE IF NOT EXISTS nuqe_engine.audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     TEXT NOT NULL,
    entity_id       UUID NOT NULL,
    event_type      TEXT NOT NULL,
    actor           TEXT NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}',
    hmac_signature  TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
    ON nuqe_engine.audit_log (entity_id, entity_type, created_at);

-- Block UPDATE and DELETE via triggers that raise an exception.
-- DO INSTEAD NOTHING rules would silently swallow the operation; triggers
-- ensure the caller receives a hard error, which is what the audit tests verify.

CREATE OR REPLACE FUNCTION nuqe_engine.audit_log_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION
        'audit_log is append-only: % operations are not permitted', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE TRIGGER audit_log_no_update
    BEFORE UPDATE ON nuqe_engine.audit_log
    FOR EACH ROW EXECUTE FUNCTION nuqe_engine.audit_log_immutable();

CREATE OR REPLACE TRIGGER audit_log_no_delete
    BEFORE DELETE ON nuqe_engine.audit_log
    FOR EACH ROW EXECUTE FUNCTION nuqe_engine.audit_log_immutable();
