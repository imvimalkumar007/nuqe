# F3.0 — audit_log.actor audit (2026-05-15)

## Schema (from migrations)

Source file: `migrations/001_initial_schema.sql`, lines 131–140.
No subsequent migration (002, 003) alters this column.

- Column type: TEXT
- Nullable: NO (NOT NULL)
- Constraints: none (no ENUM, no CHECK constraint, no FK)
- Index: `idx_audit_log_entity` on `(entity_id, entity_type, created_at)` — actor is NOT indexed

## Current values

No live DB in this environment — review of migration SQL only.

## Findings

- TEXT is unbounded in Postgres; it accepts Auth0 `sub` values of any length (Auth0 subs are
  typically 30–60 chars, e.g. `auth0|64a1b2c3d4e5f6`, `google-oauth2|117304...|`, `m2m|...`).
- NOT NULL means every audit row must carry an actor. Callers must supply a non-null value;
  the engine currently sets actor to a static string (Gap 66 — closes F3.5). This is acceptable
  for F3.0 through F3.4; F3.5 will wire the real Auth0 sub.
- No ENUM, CHECK, or FK constraints — no risk that Auth0 sub formats are rejected.
- No index on actor. F3.7 query patterns (audit trail by actor) will benefit from one;
  this is flagged for F3.7, not a blocker for F3.1.

## F3.3 readiness verdict

- [x] Schema accepts arbitrary Auth0 `sub` values up to 255 chars (TEXT is unbounded)
- [x] No constraints reject expected values like `"auth0|..."`, `"google-oauth2|..."`, `"m2m|..."`
- [ ] Index plan acceptable for F3.7 query patterns (or flagged for review)
      — no actor index currently; flagged for F3.7. Acceptable for F3.1–F3.6.

- Verdict: READY
- No schema change needed before F3.1. Actor column is TEXT NOT NULL with no restrictive
  constraints. A `CREATE INDEX ON audit_log (actor)` should be added in F3.7 before
  actor-filtered queries are exposed in the API, but this does not block F3.1.
