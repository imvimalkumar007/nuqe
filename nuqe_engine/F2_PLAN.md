# F2 Build Plan

**Date drafted:** 2026-05-13
**F1 status:** Complete — all 164 unit tests pass, 83% coverage, 13 integration tests written.

---

## Outstanding F1 items (carry-forward)

All six F1 carry-forward items were closed in F2 Prompt 0 (2026-05-14).

| # | Item | Status | Closed |
|---|------|--------|--------|
| 1 | `audit.py` unit coverage 46% | **Closed** | `tests/test_audit_unit.py` — 100% coverage, 54 tests, zero DB dependency |
| 2 | `cli.py` unit coverage 52% | **Closed** | `tests/test_cli_unit.py` — 99% coverage, 17 tests, psycopg.connect patched |
| 3 | `validator.py` coverage 73% | **Closed** | `tests/test_validator_crossfield.py` — 93% coverage, 17 tests, all sub-parser error paths |
| 4 | `jsparser.py` coverage 77% | **Closed** | `tests/test_jsparser_unit.py` — 99% coverage, error recovery and ParseError position-hints |
| 5 | Integration test DB stability | **Closed** | `conftest.py` refactored with `TRUNCATE … CASCADE` + `test_integration_stability.py` leakage regression |
| 6 | `test_status_without_db_exits_nonzero` latency | **Closed** | `test_cli.py` patched `psycopg.connect` directly; asserts <100 ms |

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

- [x] `POST /events` end-to-end: receive webhook → fire obligations → return result
- [x] `GET /cases/{id}/obligations` returns live statuses
- [x] Auth gate rejects requests without valid Bearer token
- [x] Unit test coverage ≥ 80% (gate enforced — 93% nuqe_api, 97% nuqe_engine)
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
| 2026-05-14 | Prompt 0: closed all 6 F1 carry-forward items; 305 unit tests, 97% coverage, ruff+mypy clean |
| 2026-05-14 | Prompt 1: F2.1 FastAPI application shell complete. nuqe_api/ package: app.py (lifespan factory), deps.py (hmac.compare_digest auth), settings.py (pydantic-settings), middleware/request_id.py (X-Request-ID), routers/health+events+cases+errors. 45 unit tests (API-001–API-045), all PASS. 93% coverage (all modules ≥80%). ruff clean, mypy clean. |
