# Component 01: Database Schema

## Status
PARTIAL — 13 of 15 required tables exist. tokeniser_additions and knowledge_documents missing.

## Purpose
The foundation of the entire system. All other components depend on
the database schema being correct. Every table, column, constraint,
index, and trigger must be exactly as specified before any other
component can be verified.

## Current Tables (confirmed 22 April 2026)
_migrations, ai_actions, audit_log, cases, communications, customers,
deadlines, knowledge_chunks, notifications, organisation_ai_config,
regulatory_monitoring_log, regulatory_sources, ruleset

## Missing Tables
- tokeniser_additions (migration 003)
- knowledge_documents (migration 004)

## Required Tables (15 total)
customers, cases, communications, deadlines, ruleset, ai_actions,
audit_log, organisation_ai_config, tokeniser_additions,
knowledge_chunks, knowledge_documents, regulatory_sources,
regulatory_monitoring_log, notifications, users (added by auth migration)

## Critical Constraints
- audit_log: UPDATE and DELETE must be blocked by rules
- cases: case_ref must auto-generate as NQ-YYYY-NNNN via trigger
- cases: status must be one of the defined enum values
- ai_actions: action_type must be one of the defined enum values
- all mutable tables: updated_at must auto-update via trigger

## Critical Indexes
- cases: status, opened_at, customer_id
- deadlines: due_at, breached, case_id
- ai_actions: status, action_type, case_id
- audit_log: entity_type + entity_id, ts
- knowledge_chunks: embedding (ivfflat), jurisdiction, organisation_id

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| DB-001 | All required tables exist in public schema | NOT RUN | |
| DB-002 | customers table has all required columns | NOT RUN | |
| DB-003 | cases table has check constraints on status field | NOT RUN | |
| DB-004 | audit_log cannot be updated or deleted | NOT RUN | |
| DB-005 | case_ref auto-generates in NQ-YYYY-NNNN format | NOT RUN | |
| DB-006 | updated_at triggers fire on mutable tables | NOT RUN | |
| DB-007 | ruleset table is seeded with UK, India, and EU rules | NOT RUN | |
| DB-008 | Foreign key constraints enforced (e.g. cases.customer_id) | NOT RUN | |

## Known Issues
- tokeniser_additions table missing. Migration 003 may have been named
  differently by Claude Code (003_knowledge_base.sql seen in _migrations).
- knowledge_documents table missing. Migration 004 may not have run.

## Claude Code Prompt
```
Read spec/components/01_database.md carefully.
Do not build anything yet.

First run this query and report the results:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

Then check the _migrations table to see which migrations have run:
SELECT * FROM _migrations ORDER BY run_at;

Then identify any missing tables and missing migrations.

For each missing table, check if the migration file exists in
api/src/db/migrations/. If the file exists but did not run,
run it via: docker exec -it nuqe-api-1 npm run migrate

If the tokeniser_additions table is missing and no migration
file exists for it, create migration
003_tokeniser_additions.sql with the correct schema from the
original design (check the build log or ask me for the schema).

After all tables exist, write and run the DB-001 through DB-008
tests in api/src/db/database.test.js using Jest.

Update the test status in this file and in spec/test_registry.md
after running.
```
