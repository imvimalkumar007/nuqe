# Admin Role Runbook

This document describes the PostgreSQL roles used in the Nuqe engine and their
intended use. Read this before running migrations or granting access.

---

## Role summary

| Role | Superuser | BypassRLS | Login | Purpose |
|------|-----------|-----------|-------|---------|
| `nuqe` | yes | yes | yes | Migration role only |
| `nuqe_app` | no | no | yes | Application runtime role |
| `nuqe_admin` | no | yes | yes | Read-only ops / analytics role |

---

## nuqe — migration superuser

- Created by the Docker / Postgres init as `POSTGRES_USER`.
- Superuser: bypasses RLS unconditionally.
- **ONLY used for migrations** (`nuqe-engine migrate` / `MIGRATION_DATABASE_URL`).
- NEVER used by application code paths (API, scheduler, engine).
- Connection string: `MIGRATION_DATABASE_URL` env var.

---

## nuqe_app — application runtime role

- Non-privileged: `rolsuper=f`, `rolbypassrls=f`.
- Subject to all RLS policies — cannot read data outside its org context.
- Has `SELECT, INSERT, UPDATE, DELETE` on `nuqe_engine.*`.
- Created once (manually or via setup script) with password `nuqe_secret` (dev).
  In production, rotate the password and store it in a secrets manager.
- Connection string: `DATABASE_URL` env var.

### Creation (if re-running from scratch)

```sql
CREATE ROLE nuqe_app WITH LOGIN PASSWORD '<password>';
GRANT CONNECT ON DATABASE nuqe TO nuqe_app;
GRANT USAGE ON SCHEMA nuqe_engine TO nuqe_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA nuqe_engine TO nuqe_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA nuqe_engine TO nuqe_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nuqe IN SCHEMA nuqe_engine
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nuqe_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nuqe IN SCHEMA nuqe_engine
    GRANT USAGE, SELECT ON SEQUENCES TO nuqe_app;
```

### Verification

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'nuqe_app';
-- Must show: rolsuper=f, rolbypassrls=f
```

---

## nuqe_admin — read-only BYPASSRLS ops role (created in Step 4)

- `rolsuper=f`, `rolbypassrls=t`.
- Can read all rows across all organisations (bypasses RLS).
- Read-only: `SELECT` only — no INSERT, UPDATE, DELETE.
- Used for: cross-tenant analytics, support escalations, production debugging.
- NEVER used by application code paths.
- Password: `PLACEHOLDER_SET_VIA_ENV_BEFORE_PROD` — **must be changed before
  production use**. Store the real password in a secrets manager.

### Creation

```sql
CREATE ROLE nuqe_admin WITH LOGIN PASSWORD 'PLACEHOLDER_SET_VIA_ENV_BEFORE_PROD' BYPASSRLS;
GRANT CONNECT ON DATABASE nuqe TO nuqe_admin;
GRANT USAGE ON SCHEMA nuqe_engine TO nuqe_admin;
GRANT SELECT ON ALL TABLES IN SCHEMA nuqe_engine TO nuqe_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE nuqe IN SCHEMA nuqe_engine
    GRANT SELECT ON TABLES TO nuqe_admin;
```

### Verification

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'nuqe_admin';
-- Must show: rolsuper=f, rolbypassrls=t
```

---

## Critical rules

1. **Migrations MUST run as `nuqe`** (superuser). Use `MIGRATION_DATABASE_URL`.
2. **App connects as `nuqe_app`** (non-privileged). Use `DATABASE_URL`.
3. `nuqe_admin` password MUST be rotated before production.
4. Never set `BYPASSRLS` on `nuqe_app` — this would defeat all RLS policies.
5. Never grant `nuqe_app` the `SUPERUSER` attribute.
6. All three roles use scram-sha-256 authentication.

---

## Access log

All `nuqe_admin` cross-org queries should be logged to `nuqe_engine.admin_access_log`
by the calling code. This is not enforced at the DB level — it is a code convention.
