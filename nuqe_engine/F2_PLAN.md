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
- [x] Unit test coverage ≥ 80% (gate enforced — all 22 modules ≥80%)
- [x] Integration tests written (skip gracefully without DB; CI runs against real Postgres)
- [x] `nuqe-engine migrate` runs cleanly in Docker entrypoint
- [x] `POST /cases` creates case + fires opening event in single transaction (F2.2)
- [x] `POST /library/sync` + `GET /library/status` (F2.3)
- [x] Deadline scanner with APScheduler, idempotent breach detection (F2.4)
- [x] Structlog JSON logging, Prometheus metrics, Sentry integration (F2.5)
- [x] Dockerfile, docker-compose API service, full CI matrix (F2.6)
- [x] E2e smoke test: POST /cases → obligations → audit → metrics (F2.6)

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
| 2026-05-14 | Gap 65 closed: coverage gate hardened. pyproject.toml: --cov=nuqe_api, branch=true, coverage.json report. scripts/check_coverage.py: per-module gate (exit 1 if any module <threshold). .github/workflows/ci.yml: CI stub with lint → mypy → migrate → pytest → check_coverage.py. 350 unit tests, 95% aggregate, all 14 measured modules ≥80%. Sanity-checked. |
| 2026-05-15 | F2.2: engine.process_event(conn=) transactional variant, POST /cases, OpeningEvent/CaseCreate models, 9 unit tests pass. |
| 2026-05-15 | F2.3: POST /library/sync (validate-before-sync), GET /library/status, unit tests for cases_read and cases_audit (27 tests). |
| 2026-05-15 | F2.4: APScheduler deadline scanner, notifications table (002_notifications.sql), scan_deadlines() idempotent, 12 unit tests. |
| 2026-05-15 | F2.5: structlog configure_logging, Prometheus metrics (6 metrics), GET /metrics endpoint, Sentry before_send filter, 14 tests. |
| 2026-05-15 | F2.6: Dockerfile, docker-compose api service, full CI matrix (lint+unit+integration+build-image jobs), e2e smoke test. F2 complete. |
