# F3.1 Rollback Runbook

This runbook describes how to roll back the F3.1 multi-tenant foundation
migration if a critical issue is discovered after deployment.

**Run all psql commands as the `nuqe` migration role** (BYPASSRLS, table owner).

---

## Pre-conditions

Before rolling back, confirm:

1. No F3.2 or later migrations have been applied (they depend on F3.1 schema).
2. You have a post-F3.1 snapshot from `backups/` (taken by `scripts/f31_backfill.py`).
3. The rollback will destroy all multi-tenant data permanently.

---

## Step-by-step rollback

### 1. Take a safety snapshot

```powershell
# Windows PowerShell
$pgbin = "C:\Program Files\PostgreSQL\18\bin"
& "$pgbin\pg_dump.exe" "postgresql://nuqe:nuqe_secret@localhost:5432/nuqe" `
    -f "backups\f31_pre_rollback_snapshot.sql"
```

### 2. Verify current state

```sql
-- Check which migrations are applied
SELECT filename FROM nuqe_engine.schema_migrations ORDER BY filename;

-- Check org count and data
SELECT count(*) FROM nuqe_engine.organisations;
SELECT count(*) FROM nuqe_engine.cases WHERE org_id IS NOT NULL;
```

### 3. Apply the rollback migration

```powershell
$pgbin = "C:\Program Files\PostgreSQL\18\bin"
$env:PGPASSWORD = "nuqe_secret"
& "$pgbin\psql.exe" "postgresql://nuqe:nuqe_secret@localhost:5432/nuqe" `
    -f "migrations/004_multi_tenant_foundation_rollback.sql"
```

### 4. Verify rollback

```sql
-- RLS should be disabled
SELECT tablename, rowsecurity FROM pg_tables
    WHERE schemaname = 'nuqe_engine'
    AND tablename IN ('cases','fired_obligations','audit_log','notifications','obligations');
-- All should show rowsecurity = false

-- org_id columns should be gone
SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'nuqe_engine'
    AND table_name = 'cases'
    AND column_name = 'org_id';
-- Should return 0 rows

-- New tables should be gone
SELECT tablename FROM pg_tables
    WHERE schemaname = 'nuqe_engine'
    AND tablename IN ('organisations','users','organisation_memberships','admin_access_log');
-- Should return 0 rows

-- migration record should be gone
SELECT filename FROM nuqe_engine.schema_migrations;
-- Should NOT include 004_multi_tenant_foundation.sql
```

### 5. Run F2 unit tests to confirm baseline

```powershell
cd nuqe_engine
.\.venv\Scripts\pytest -m "not integration" -q
```

### 6. Restore from F3.1 snapshot (if needed)

If the rollback was a mistake and you want to re-apply F3.1:

```powershell
# Restore database from post-F3.1 snapshot
$pgbin = "C:\Program Files\PostgreSQL\18\bin"
& "$pgbin\psql.exe" "postgresql://nuqe:nuqe_secret@localhost:5432/nuqe" `
    -f "backups/f31_pre_migration_snapshot.sql"

# Re-apply F3.1 migration
& "$pgbin\psql.exe" "postgresql://nuqe:nuqe_secret@localhost:5432/nuqe" `
    -f "migrations/004_multi_tenant_foundation.sql"

# Re-run backfill
$env:MIGRATION_DATABASE_URL = "postgresql://nuqe:nuqe_secret@localhost:5432/nuqe"
.\.venv\Scripts\python scripts/f31_backfill.py
```

---

## What is NOT rolled back

- `nuqe_app` role: survives rollback. It was created before F3.1 and is
  required for the application regardless of the multi-tenant schema.
- `MIGRATION_DATABASE_URL` environment variable: survives rollback.
- Application code changes (settings.py, cli.py): survive rollback.

---

## Known issues

- `DROP ROLE nuqe_admin` may fail if the role owns objects or has granted
  privileges not yet cleaned up. In that case, run:
  ```sql
  REASSIGN OWNED BY nuqe_admin TO nuqe;
  DROP OWNED BY nuqe_admin;
  DROP ROLE nuqe_admin;
  ```
- The audit_log trigger bypass (`session_replication_role = replica`) requires
  superuser. The `nuqe` role has BYPASSRLS but not superuser after F3.1 setup.
  For audit_log DDL (e.g., `DROP COLUMN`), connect as the postgres superuser if needed.
