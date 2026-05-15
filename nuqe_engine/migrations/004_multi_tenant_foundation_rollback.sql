-- F3.1 rollback migration
-- Run as: nuqe (migration role, BYPASSRLS)
-- WARNING: destroys all multi-tenant data. See docs/f31_rollback_runbook.md
-- WARNING: this drops all org_id columns — existing row data is lost permanently.

-- ── 1. Drop RLS policies ────────────────────────────────────────────────────

DROP POLICY IF EXISTS cases_org_isolation ON nuqe_engine.cases;
DROP POLICY IF EXISTS fired_obligations_org_isolation ON nuqe_engine.fired_obligations;
DROP POLICY IF EXISTS audit_log_org_isolation ON nuqe_engine.audit_log;
DROP POLICY IF EXISTS notifications_org_isolation ON nuqe_engine.notifications;
DROP POLICY IF EXISTS obligations_org_isolation ON nuqe_engine.obligations;


-- ── 2. Disable RLS ──────────────────────────────────────────────────────────

ALTER TABLE nuqe_engine.cases             DISABLE ROW LEVEL SECURITY;
ALTER TABLE nuqe_engine.fired_obligations DISABLE ROW LEVEL SECURITY;
ALTER TABLE nuqe_engine.audit_log         DISABLE ROW LEVEL SECURITY;
ALTER TABLE nuqe_engine.notifications     DISABLE ROW LEVEL SECURITY;
ALTER TABLE nuqe_engine.obligations       DISABLE ROW LEVEL SECURITY;


-- ── 3. Drop org_id indexes ──────────────────────────────────────────────────

DROP INDEX IF EXISTS nuqe_engine.idx_cases_org_id;
DROP INDEX IF EXISTS nuqe_engine.idx_fired_obligations_org_id;
DROP INDEX IF EXISTS nuqe_engine.idx_audit_log_org_id;
DROP INDEX IF EXISTS nuqe_engine.idx_notifications_org_id;
DROP INDEX IF EXISTS nuqe_engine.idx_obligations_org_id;


-- ── 4. Drop org_id columns ──────────────────────────────────────────────────
-- Re-enable audit_log trigger bypass via session_replication_role so ALTER TABLE
-- can modify audit_log (triggers don't run on DDL, but FK constraints may fire).

ALTER TABLE nuqe_engine.cases             DROP COLUMN IF EXISTS org_id;
ALTER TABLE nuqe_engine.fired_obligations DROP COLUMN IF EXISTS org_id;
ALTER TABLE nuqe_engine.audit_log         DROP COLUMN IF EXISTS org_id;
ALTER TABLE nuqe_engine.notifications     DROP COLUMN IF EXISTS org_id;
ALTER TABLE nuqe_engine.obligations       DROP COLUMN IF EXISTS org_id;


-- ── 5. Drop new tables (FK-safe order: children before parents) ─────────────

DROP TABLE IF EXISTS nuqe_engine.admin_access_log;
DROP TABLE IF EXISTS nuqe_engine.organisation_memberships;
DROP TABLE IF EXISTS nuqe_engine.users;
DROP TABLE IF EXISTS nuqe_engine.organisations;


-- ── 6. Remove migration record ──────────────────────────────────────────────

DELETE FROM nuqe_engine.schema_migrations
    WHERE filename = '004_multi_tenant_foundation.sql';


-- ── 7. Drop nuqe_admin role (nuqe_app survives rollback) ────────────────────
-- Note: DROP ROLE fails if the role has objects or granted privileges.
-- Run REASSIGN OWNED BY nuqe_admin TO nuqe; DROP OWNED BY nuqe_admin; first
-- if needed (unlikely since nuqe_admin is SELECT-only).

DROP ROLE IF EXISTS nuqe_admin;
