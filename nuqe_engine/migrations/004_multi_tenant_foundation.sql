-- Migration 004: F3.1 Multi-tenant foundation
-- Run as: nuqe (migration role via MIGRATION_DATABASE_URL)

-- ── organisations ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nuqe_engine.organisations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth0_org_id TEXT UNIQUE,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    status      TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_organisations_status
    ON nuqe_engine.organisations(status)
    WHERE status = 'active';


-- ── users ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nuqe_engine.users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth0_sub    TEXT UNIQUE,
    email        TEXT NOT NULL UNIQUE,
    display_name TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_auth0_sub
    ON nuqe_engine.users(auth0_sub)
    WHERE auth0_sub IS NOT NULL;


-- ── organisation_memberships ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nuqe_engine.organisation_memberships (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID NOT NULL REFERENCES nuqe_engine.organisations(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES nuqe_engine.users(id) ON DELETE CASCADE,
    roles      TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user
    ON nuqe_engine.organisation_memberships(user_id);

CREATE INDEX IF NOT EXISTS idx_memberships_org
    ON nuqe_engine.organisation_memberships(org_id);


-- ── admin_access_log ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nuqe_engine.admin_access_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor         TEXT NOT NULL,
    org_id_accessed UUID,
    action        TEXT NOT NULL,
    query_hash    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_access_log_created
    ON nuqe_engine.admin_access_log(created_at DESC);


-- ── org_id columns on tenant-owned tables (nullable first, backfill in 005) ──

ALTER TABLE nuqe_engine.cases
    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES nuqe_engine.organisations(id);

ALTER TABLE nuqe_engine.fired_obligations
    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES nuqe_engine.organisations(id);

ALTER TABLE nuqe_engine.audit_log
    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES nuqe_engine.organisations(id);

ALTER TABLE nuqe_engine.notifications
    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES nuqe_engine.organisations(id);

ALTER TABLE nuqe_engine.obligations
    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES nuqe_engine.organisations(id);


-- Grant new tables to nuqe_app (needed before ALTER DEFAULT PRIVILEGES takes effect)
GRANT SELECT, INSERT, UPDATE, DELETE
    ON nuqe_engine.organisations TO nuqe_app;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON nuqe_engine.users TO nuqe_app;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON nuqe_engine.organisation_memberships TO nuqe_app;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON nuqe_engine.admin_access_log TO nuqe_app;
