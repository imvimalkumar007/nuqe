# nuqe-engine

Deterministic obligation engine for the Nuqe platform. Consumes the v1 obligation library and processes case events against it.

## Status

F1 milestone, May 2026. Active development.

## Test coverage

Coverage is measured over modules with unit-testable logic. Modules that require a live Postgres instance (`engine.py`, `sync.py`, `trigger.py`, `deadline.py`, `evidence.py`, `requirement.py`) are exercised by `pytest -m integration` against a Docker database and excluded from the unit-test gate.

| Scope | Tests | Coverage |
|---|---|---|
| Unit (no DB) | 305 | **97%** |
| Integration (`-m integration`) | 13 | engine.py + sync.py + trigger.py + deadline.py + evidence.py + requirement.py |
| Combined | 318 | ~97% est. |

Per-module coverage (unit gate):

| Module | Coverage |
|---|---|
| audit.py | 100% |
| cli.py | 99% |
| jsparser.py | 99% |
| schema.py | 99% |
| validator.py | 93% |
| loader.py | 83% |

The 80% gate applies to unit tests and is enforced automatically on every `pytest` run via `pyproject.toml`.

## Architecture

Eight modules, each with a single responsibility. The public API is in `nuqe_engine/engine.py`.

```
nuqe_engine/
├── loader.py        M1   Reads xlsx, returns Pydantic ObligationRow models
├── validator.py     M2   Schema, vocab, and grammar checks
├── sync.py          M3   Syncs validated rows to Postgres
├── trigger.py       M4   Event matcher and condition evaluator
├── requirement.py   M5   Action runner and assertion checker
├── evidence.py      M6   Deterministic evidence selector
├── deadline.py      M7   UK business calendar deadline scheduler
├── audit.py         M8   Append-only signed audit log
├── engine.py        Public API: process_event, due_obligations, evidence_for, audit_trail
├── schema.py        Shared Pydantic models
└── cli.py           Command-line tool: load, validate, sync, status
```

## Setup

### Local development

```bash
# Python 3.12 required
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Start Postgres in Docker
docker compose up -d

# Run migrations
nuqe-engine migrate

# Load the library
nuqe-engine load /path/to/Nuqe_Obligation_Library.xlsx
nuqe-engine validate
nuqe-engine sync

# Run tests
pytest
```

### Configuration

Copy `.env.example` to `.env` and edit:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres connection string |
| `AUDIT_SIGNING_KEY` | Yes | HMAC-SHA256 key for audit log entries (`openssl rand -hex 32`) |
| `NUQE_API_TOKEN` | Yes (static mode) | Static Bearer token for API auth |
| `AUTH_MODE` | No | `static` (default) or `auth0` |
| `AUTH0_DOMAIN` | auth0 mode | Auth0 tenant domain (e.g. `your-tenant.eu.auth0.com`) |
| `AUTH0_AUDIENCE` | auth0 mode | Auth0 API audience (e.g. `https://api.nuqe.io`) |
| `AUTH0_ALGORITHMS` | No | JWT algorithms accepted (default: `RS256`) |
| `AUTH0_JWKS_CACHE_TTL_SECONDS` | No | JWKS cache TTL in seconds (default: `3600`) |
| `LIBRARY_PATH` | No | Legacy library xlsx path (used by `POST /library/sync` only) |
| `LOG_LEVEL` | No | Logging verbosity (default: `INFO`) |
| `SCHEDULER_ENABLED` | No | Set `false` to disable deadline scanner (default: `true`) |
| `SENTRY_DSN` | No | Sentry DSN for error tracking |

See `docs/f33_auth0_setup.md` for the full Auth0 cutover runbook.

## Method conformance

This engine consumes obligations decomposed per the Obligation Decomposition Method v0.1. Every row in the library must conform to the 24-column schema and controlled vocabularies. Engineering does not author obligations: only consumes them.

## Locked architectural decisions

Per `CLAUDE.md` and the Project Document:

1. Rules as data. The engine never hardcodes regulatory logic.
2. Deterministic. Triggers, requirements, evidence, and deadlines are all expressible as code over structured data.
3. Versioned. Cases bind to `(obligation_id, version)`, not `obligation_id` alone.
4. Append-only audit. The `audit_log` table cannot accept UPDATE or DELETE.
5. Agent-bounding. The engine constrains the AI agent. The agent never overrides deadlines, evidence chains, or audit trails.

## License

Proprietary. Anthropic, Nuqe, and Vimal Kumar.
