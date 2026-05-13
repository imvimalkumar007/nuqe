# F2 Build Plan

**Date drafted:** 2026-05-13
**F1 status:** Complete — all 164 unit tests pass, 83% coverage, 13 integration tests written.

---

## Outstanding F1 items (carry-forward)

These are known gaps deferred from F1. Address before shipping F2.

| # | Item | Owner | Notes |
|---|------|-------|-------|
| 1 | `audit.py` unit coverage 46% | Eng | DB-level append/verify logic needs mocks or in-memory sqlite fixture |
| 2 | `cli.py` unit coverage 52% | Eng | `migrate`, `sync`, `status` commands require DB; mock psycopg.connect |
| 3 | `validator.py` coverage 73% | Eng | Warning-path branches untested |
| 4 | `jsparser.py` coverage 77% | Eng | Error recovery branches unreached |
| 5 | Integration test DB stability | Eng | `_clean_tables` truncates on every test — verify FK ordering is safe under concurrent fixture runs |
| 6 | `test_status_without_db_exits_nonzero` latency | Eng | Still waits 2 s for TCP timeout; consider patching psycopg.connect directly |

---

## F2 scope

F2 introduces the **REST API layer** that exposes the engine to external consumers (case management UI, inbound webhooks, pilot integrations).

### F2.1 — FastAPI application shell

- `nuqe_api/` package alongside `nuqe_engine/`
- `GET /health` — liveness probe
- `POST /events` — accepts a `TriggerEvent` payload, calls `engine.process_event()`, returns `ProcessEventResult`
- `GET /cases/{case_id}/obligations` — calls `engine.due_obligations()`
- `GET /cases/{case_id}/audit` — calls `engine.audit_trail()`
- Auth: Bearer token (static secret for pilot; full OAuth2 in F3)

### F2.2 — Case ingestion

- `POST /cases` — creates a case row and fires the opening event in a single transaction
- Replaces the manual `_insert_case()` pattern used in integration tests
- Returns `case_id` for subsequent calls

### F2.3 — Obligation library management

- `POST /library/sync` — triggers `engine.refresh_library()` from an uploaded xlsx or a configured S3/blob path
- `GET /library/status` — wraps `nuqe-engine status`

### F2.4 — Async deadline scanner

- Background task (APScheduler or Celery beat) that calls `engine.due_obligations()` for all open cases daily
- Emits `DEADLINE_BREACHED` audit entries for overdue obligations
- Sends notification stub (email/webhook) — real channel integration in F3

### F2.5 — Observability

- Structured JSON logging via `structlog`
- Prometheus metrics endpoint (`/metrics`): events processed, obligations fired, deadline breach rate
- Sentry integration for exception capture

### F2.6 — Docker + CI

- `Dockerfile` for the API service
- `docker-compose.yml` extended with API service + migrations run
- GitHub Actions workflow: lint → unit tests (80% gate) → build image → integration tests against real DB

---

## F2 exit criteria

- [ ] `POST /events` end-to-end: receive webhook → fire obligations → return result
- [ ] `GET /cases/{id}/obligations` returns live statuses
- [ ] Auth gate rejects requests without valid Bearer token
- [ ] Unit test coverage ≥ 80% (gate enforced)
- [ ] Integration tests pass against Docker DB in CI
- [ ] `nuqe-engine migrate` runs cleanly in Docker entrypoint

---

## Architecture decisions needed before F2

| Decision | Options | Deadline |
|----------|---------|----------|
| Async vs sync FastAPI | Sync (consistent with psycopg sync) vs async (psycopg async) | Before F2.1 |
| Auth strategy for pilot | Static token vs Clerk/Auth0 | Before F2.1 |
| Library storage for pilot | Local path vs S3 vs DB blob | Before F2.3 |
| Scheduler approach | APScheduler (simple) vs Celery (complex, later) | Before F2.4 |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-13 | F2_PLAN.md created at end of F1 hardening session |
