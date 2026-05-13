# nuqe-engine

Deterministic obligation engine for the Nuqe platform. Consumes the v1 obligation library and processes case events against it.

## Status

F1 milestone, May 2026. Active development.

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

```
DATABASE_URL=postgresql://nuqe:nuqe_secret@localhost:5432/nuqe_engine
LIBRARY_PATH=./Nuqe_Obligation_Library.xlsx
AUDIT_SIGNING_KEY=replace-me
```

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
