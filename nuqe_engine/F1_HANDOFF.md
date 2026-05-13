# Nuqe F1 Engine — Build Handoff

This document is the source of truth for the F1 engineering work. Read it fully before writing code.

## Context

Nuqe is an AI compliance agent platform for small regulated firms. The architectural core is a **deterministic obligation engine** that consumes a structured library of regulatory rules and bounds an AI agent inside deterministic guardrails (deadlines, evidence chains, audit trails).

The obligation library is complete: 153 rows total, 141 approved, decomposed per the Obligation Decomposition Method v0.1. F1 is the engine that consumes it.

## Locked architectural decisions

These are **not open for re-discussion**. Reject any design choice that conflicts with them.

1. **Rules as data, not code.** The engine never hardcodes regulatory logic. Every rule lives in the library.
2. **Deterministic engine.** Triggers, requirements, evidence, and deadlines are all expressible as code over structured data. No LLM reasoning inside the engine.
3. **Versioned obligations.** Cases bind to `(obligation_id, version)`, never to `obligation_id` alone. This preserves historical accuracy across rule changes.
4. **Append-only audit.** The `audit_log` table accepts INSERT only. UPDATE and DELETE are blocked at the database level via triggers.
5. **Agent-bounding.** The engine constrains the AI agent. The agent never overrides deadlines, evidence chains, or audit trails. F1 is engine-only — no agent integration yet.
6. **API-first.** Every operation is exposed through a Python API surface. UI and agent layers (F2+) are clients.
7. **Stack:** Python 3.12 core. Postgres 16 (local Docker for dev, Supabase Pro at pilot). TypeScript API/UI layer in a later milestone.

## F1 scope

Eight modules. The first (M1) is complete.

| Module | File | Status | Responsibility |
|---|---|---|---|
| M1 | `loader.py` | **Done** | Read .xlsx, emit `RawObligationRow` |
| M2 | `validator.py` | Build | Parse sub-fields, validate, emit `ObligationRow` |
| M3 | `sync.py` + migrations | Build | Push validated rows to Postgres |
| M4 | `trigger.py` | Build | Given an event, return obligations that fire |
| M5 | `requirement.py` | Build | Register required actions, check assertions |
| M6 | `evidence.py` | Build | Resolve selectors against named locations |
| M7 | `deadline.py` | Build | UK business-day calendar, deadline calculation |
| M8 | `audit.py` | Build | Append-only signed audit entries |
| API | `engine.py` | Build | `process_event`, `due_obligations`, `evidence_for`, `audit_trail` |
| CLI | `cli.py` | Build | `migrate`, `load`, `validate`, `sync`, `status` |

## What already exists

```
nuqe_engine/
├── pyproject.toml              Python 3.12, deps locked
├── docker-compose.yml          Postgres 16-alpine on port 5432
├── README.md
├── .env.example
├── .gitignore
├── nuqe_engine/
│   ├── __init__.py
│   ├── schema.py               Pydantic models for the 24-col Method schema
│   ├── jsparser.py             Custom parser for the JS-like sub-field syntax
│   └── loader.py               M1 — done, 9 passing tests
└── tests/
    ├── conftest.py
    ├── test_loader.py
    └── fixtures/
        └── Nuqe_Obligation_Library.xlsx    (Real library, 153 rows)
```

### `schema.py` defines

- 11 controlled-vocabulary enums (Jurisdiction, Regulator, Framework, ProvisionType, ProductType, CustomerSegment, DeadlineUnit, DeadlineAnchor, BreachConsequence, ReviewStatus, TriggerEvent, RequirementAction, EvidenceType, EvidenceLocation)
- `TriggerCondition`, `Requirement`, `Evidence`, `Exception_` — sub-schemas
- `ObligationRow` — the fully-parsed, validated obligation (24 columns)
- `RawObligationRow` — what the loader emits, sub-fields still strings
- `column_order()` — canonical column list

### `jsparser.py` parses the JS-like syntax

The spreadsheet stores sub-fields as JS-like object literals. Example:

```
{ event: 'communication_received',
  conditions: "communication.type=='withdrawal_notice'",
  exclusions: 'null' }
```

`parse()`, `parse_object()`, `parse_array()` return Python data. `ParseError` carries a position hint. Supports nested objects/arrays, single+double quotes with escapes, bare keys, true/false/null, numbers, trailing commas.

### `loader.py` (M1) handles

- Reading the xlsx, validating the header against `column_order()`
- Excel-serial dates AND ISO date strings (the library has both)
- Filtering by `review_status` (defaults to approved only)
- Provenance: each row carries `_source_row_number`
- Graceful errors with `LoaderError`

## Method conformance

Every rule in the library conforms to the Method. The engine must too. Key Method rules:

- **24 columns in canonical order** (see `column_order()`)
- **`deadline_unit` vocabulary:** `calendar_days`, `business_days`, `hours`, `none` only. NEVER weeks, months, or weeks-as-text.
- **`deadline_value` is null iff `deadline_unit == 'none'`.** Cross-field rule.
- **Version format:** `MAJOR.MINOR.PATCH` (e.g. `1.0.1`). Cases bind to `(obligation_id, version)`.
- **Overlay obligations** reference a base via `overlay_of`. They are additional, not replacement, requirements.

## Coding standards

- British spelling everywhere (behaviour, colour, organisation)
- No em dashes anywhere; use commas, colons, or restructure
- Type hints required on all public functions
- Pydantic v2 syntax (`field_validator`, `model_validator`, `ConfigDict`)
- Tests are mandatory: every module ships with `tests/test_<module>.py`
- Run `pytest` and `mypy` and `ruff` clean before marking a module done
- No version numbers in filenames
- Use `nuqe_engine.schema` enums everywhere — never raw strings for vocab

## Database conventions

- Schema name: `nuqe_engine` (separate from any legacy schema)
- Migrations in `migrations/` as `NNN_description.sql`, numbered from 001
- All tables have `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- All UUIDs use `gen_random_uuid()` (Postgres 13+)
- `audit_log` has CREATE RULE blocking UPDATE and DELETE
- Use `psycopg` (v3) sync API for now; we can add async later

## Testing approach

- Unit tests per module with mocks for I/O
- Integration tests in `tests/integration/` requiring a live Postgres
- The real library at `tests/fixtures/Nuqe_Obligation_Library.xlsx` is the integration corpus
- pytest markers: `@pytest.mark.integration` for tests needing Postgres
- Coverage target: 80%+ on engine modules

## How to verify your work

After each module:

```bash
# In the engine directory with the venv active
pytest -v                          # all tests pass
pytest --cov=nuqe_engine           # check coverage
ruff check nuqe_engine/            # lint clean
mypy nuqe_engine/                  # type clean
```

Integration tests:

```bash
docker compose up -d               # start Postgres
nuqe-engine migrate                # apply migrations
pytest -v -m integration           # run integration tests
```

## What "F1 done" looks like

```python
from nuqe_engine import Engine, Event, TriggerEvent
from uuid import uuid4

engine = Engine.from_env()

# Load and sync the library (one time, or after library updates)
engine.refresh_library("./Nuqe_Obligation_Library.xlsx")

# Process a real event
case_id = uuid4()
result = engine.process_event(Event(
    event=TriggerEvent.COMPLAINT_RECEIVED,
    case_id=case_id,
    occurred_at=datetime.now(),
    context={
        "case": {"type": "complaint", "status": "open"},
        "customer": {"is_vulnerable": False, "segment": "retail"},
        "product": {"type": "loan"},
        "communication": {"type": "complaint"},
    }
))

print(f"Fired {len(result.fired_obligations)} obligations")
print(f"Created {len(result.deadlines)} deadlines")
print(f"Logged {len(result.audit_entries)} audit entries")

# Later
due = engine.due_obligations(case_id)
trail = engine.audit_trail(entity_id=case_id, entity_type="case")
```

This should run end-to-end against the real library without hardcoding anything.
