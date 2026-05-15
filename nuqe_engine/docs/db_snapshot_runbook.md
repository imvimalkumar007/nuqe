# DB Snapshot Runbook

> This is a runbook. The actual snapshot is taken immediately before F3.1 DDL runs.
> Do not run this in advance of the F3.1 session — run it right before applying migrations.

## Purpose

Capture a point-in-time snapshot of the Postgres database before any F3.1 schema changes
(RLS enablement, new columns, new indexes). Provides a safe restore point if a migration
must be rolled back.

---

## How to snapshot (pg_dump)

### Prerequisites

- `pg_dump` installed locally (ships with Postgres client tools; version must match server major version)
- `DATABASE_URL` available (or `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` set)

### Command

```bash
# Set these from Render dashboard → nuqe-engine database → Connection Details
export PGHOST=<host>
export PGPORT=5432
export PGUSER=nuqe
export PGPASSWORD=<password>
export PGDATABASE=nuqe_engine

# Custom format — compressed, supports selective restore
pg_dump \
  --format=custom \
  --compress=9 \
  --schema=nuqe_engine \
  --file="snapshots/nuqe_engine_$(date +%Y%m%dT%H%M%S)_pre_f3.1.dump"
```

Use `--schema=nuqe_engine` to restrict to the nuqe_engine schema only. Omit if you want
a full-database dump (useful if other schemas exist).

---

## Where snapshots are stored

```
nuqe_engine/snapshots/
```

This directory is gitignored (`.gitignore` entry: `snapshots/`). Do NOT commit dumps to
the repository — they may contain PII or credentials.

For production snapshots: copy to a secure location outside the repo (e.g. an encrypted
S3 bucket or local encrypted volume) before proceeding with the migration.

---

## How to restore

```bash
# Full schema restore (drops and recreates nuqe_engine schema objects)
pg_restore \
  --host=$PGHOST \
  --port=$PGPORT \
  --username=$PGUSER \
  --dbname=$PGDATABASE \
  --schema=nuqe_engine \
  --clean \
  --if-exists \
  --no-owner \
  snapshots/<filename>.dump
```

`--clean --if-exists` drops existing objects before recreating them.
`--no-owner` skips ownership assignments that may fail if restoring as a different user.

For a selective restore (single table):

```bash
pg_restore \
  --table=audit_log \
  --schema=nuqe_engine \
  --host=$PGHOST --port=$PGPORT \
  --username=$PGUSER --dbname=$PGDATABASE \
  snapshots/<filename>.dump
```

---

## Retention guidance

| Context | Retain for |
|---------|-----------|
| Pre-migration snapshots (F3.x DDL) | Keep until the next migration is confirmed stable in production (minimum 7 days post-deploy) |
| Pre-release snapshots | Keep for 30 days |
| Periodic production backups | Render PostgreSQL Basic plan provides 7-day PITR; supplement with monthly pg_dump for longer retention |

Delete old dumps explicitly — they are not purged automatically.

---

## Notes on Render managed Postgres

Render PostgreSQL Basic plan provides point-in-time recovery (PITR) for any timestamp
in the past 7 days, plus on-demand logical export. For F3.1:

1. Take a pg_dump snapshot as above (gives you a portable, versioned restore point).
2. Optionally trigger a Render on-demand backup from the Render dashboard before running migrations.
3. Apply migrations via `scripts/migrate.py`.
4. Verify with a smoke test before declaring the migration complete.
