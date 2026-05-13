# F1 Engine Build Prompts for Claude Code

Paste these into Claude Code one at a time, in order. Each prompt is self-contained. **Do not** paste two at once: each one ends with a verification step that needs to pass before the next begins.

## How to use

1. Open Claude Code in the `nuqe_engine/` directory (inside your existing `nuqe` repo).
2. First, ensure the scaffold from M1 is present (the tarball is already extracted).
3. Activate the venv: `source .venv/bin/activate`.
4. Paste **PROMPT 1** as your first message. Wait for it to complete and confirm all tests pass.
5. Then paste **PROMPT 2**. Continue.
6. If any prompt fails, paste the error output and ask Claude Code to fix it before moving on.

---

## PROMPT 1: M2 Validator

```
Read F1_HANDOFF.md fully before starting. It defines the architecture, locked decisions, and what's already built.

You are building M2: the validator module at nuqe_engine/validator.py.

Responsibilities:
1. Take a list of RawObligationRow (from M1) and produce a list of ObligationRow plus a list of defects.
2. Parse the structured sub-fields (trigger_condition, requirement, evidence_required, exceptions) using the existing parser in nuqe_engine/jsparser.py.
3. Validate cross-field rules that Pydantic field_validators can't express alone.
4. Validate controlled vocabularies against the schema.py enums.
5. Never raise on a bad row: collect defects with row provenance and continue.

Required cross-field validation rules (Method Section 9):
- deadline_value is null if and only if deadline_unit == 'none'.
- deadline_value > 0 if deadline_unit is calendar_days, business_days, or hours.
- If overlay_of is set, it must reference an obligation_id that exists in the same library.
- If supersedes is set, the superseded obligation_id must exist.
- effective_to must be >= effective_from if both are set.
- Every framework value in the library must match the obligation_id's framework prefix (UK-DISP-NNN must have framework=DISP, etc).
- product_types and customer_segments lists must contain at least one element from their respective enums.

Output type:

class ValidationDefect(BaseModel):
    row_number: int             # Source spreadsheet row
    obligation_id: str | None   # May be None if the row has no parseable id
    column: str                 # Which column is at fault, or "row" for cross-field
    severity: Literal["error", "warning"]
    message: str

class ValidationResult(BaseModel):
    valid: list[ObligationRow]
    defects: list[ValidationDefect]

Public API:

def validate(raw_rows: list[RawObligationRow]) -> ValidationResult: ...

Tests (write all of these in tests/test_validator.py):
- Validates the full library fixture without errors (all 141 approved rows valid, zero defects).
- Catches a deliberately malformed trigger_condition (bad JS-like syntax).
- Catches deadline_value/deadline_unit mismatches (value present when unit is 'none', value missing when unit is 'calendar_days').
- Catches an overlay_of pointing to a non-existent obligation.
- Catches a framework that doesn't match the obligation_id prefix.
- Returns ObligationRow with sub-fields properly typed (trigger_condition is a TriggerCondition, not a string).
- Defects carry the source row number.

Verification:

pytest tests/test_loader.py tests/test_validator.py -v
ruff check nuqe_engine/validator.py
mypy nuqe_engine/validator.py

All tests must pass. If the real library has defects, report them; do not fix the library. The library is canonical.
```

---

## PROMPT 2: M3 Sync + migrations

```
Read F1_HANDOFF.md first.

You are building M3: the Postgres sync module at nuqe_engine/sync.py, plus the database migrations.

Migrations live in migrations/ at the project root. Numbered NNN_description.sql, starting from 001. Schema name is nuqe_engine.

Create migrations/001_initial_schema.sql with these tables:

1. obligations
   - obligation_id TEXT (e.g. 'UK-DISP-001')
   - version TEXT (e.g. '1.0.1')
   - PRIMARY KEY (obligation_id, version)
   - jurisdiction, regulator, framework, source_provision_type all TEXT
   - obligation_name TEXT NOT NULL
   - source_document, source_url TEXT NOT NULL
   - product_types JSONB NOT NULL (array of strings)
   - customer_segments JSONB NOT NULL (array of strings)
   - trigger_condition JSONB NOT NULL
   - requirement JSONB NOT NULL
   - deadline_value INTEGER (nullable)
   - deadline_unit TEXT NOT NULL
   - deadline_anchor TEXT NOT NULL
   - evidence_required JSONB NOT NULL (array of objects)
   - breach_consequence TEXT NOT NULL
   - exceptions JSONB NOT NULL DEFAULT '[]'
   - overlay_of TEXT (nullable)
   - supersedes TEXT (nullable)
   - effective_from DATE NOT NULL
   - effective_to DATE
   - review_status TEXT NOT NULL
   - created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   - synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   - Indexes: framework, jurisdiction, effective_from, overlay_of

2. cases
   - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - external_ref TEXT (firm's own case reference, optional)
   - type TEXT NOT NULL  -- 'complaint', 'credit_application', etc
   - status TEXT NOT NULL
   - customer_id TEXT  -- soft FK, customer system is separate
   - opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   - closed_at TIMESTAMPTZ
   - context JSONB NOT NULL DEFAULT '{}'  -- product type, customer attributes, etc
   - created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

3. fired_obligations  (one row per obligation that fired against a case)
   - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - case_id UUID NOT NULL REFERENCES cases(id)
   - obligation_id TEXT NOT NULL
   - obligation_version TEXT NOT NULL
   - FOREIGN KEY (obligation_id, obligation_version) REFERENCES obligations(obligation_id, version)
   - fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   - trigger_event TEXT NOT NULL
   - status TEXT NOT NULL DEFAULT 'open'  -- open, satisfied, breached, exempted
   - satisfied_at TIMESTAMPTZ
   - UNIQUE (case_id, obligation_id, obligation_version)

4. deadlines
   - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - fired_obligation_id UUID NOT NULL REFERENCES fired_obligations(id)
   - due_at TIMESTAMPTZ NOT NULL
   - anchor_event_at TIMESTAMPTZ NOT NULL
   - deadline_value INTEGER NOT NULL
   - deadline_unit TEXT NOT NULL
   - deadline_anchor TEXT NOT NULL
   - status TEXT NOT NULL DEFAULT 'pending'  -- pending, met, breached, irrelevant
   - met_at TIMESTAMPTZ
   - created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   - INDEX on (status, due_at) for fast "what's due" queries

5. evidence_checks
   - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - fired_obligation_id UUID NOT NULL REFERENCES fired_obligations(id)
   - evidence_index INTEGER NOT NULL  -- which entry in evidence_required array
   - checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   - found BOOLEAN NOT NULL
   - location TEXT NOT NULL
   - selector TEXT NOT NULL
   - notes TEXT

6. audit_log  -- APPEND-ONLY
   - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - entity_type TEXT NOT NULL  -- 'case', 'fired_obligation', 'deadline', etc
   - entity_id UUID NOT NULL
   - event_type TEXT NOT NULL  -- 'obligation_fired', 'deadline_set', etc
   - actor TEXT NOT NULL  -- 'engine', 'agent', 'user:<id>'
   - payload JSONB NOT NULL DEFAULT '{}'
   - hmac_signature TEXT NOT NULL  -- HMAC-SHA256 over (id, entity_type, entity_id, event_type, actor, payload, created_at)
   - created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   - Trigger or RULE blocking UPDATE and DELETE

Create CREATE OR REPLACE RULE blocks (or BEFORE UPDATE/DELETE triggers raising EXCEPTION) so audit_log rejects modifications.

Create migrations/002_audit_immutability.sql separately if it's cleaner to express the append-only protection.

Now nuqe_engine/sync.py:

class SyncResult(BaseModel):
    inserted: int
    updated: int
    unchanged: int
    skipped_versions: list[str]  # (obligation_id, version) pairs already present

def sync_to_database(rows: list[ObligationRow], conn) -> SyncResult: ...

Idempotency: run twice with the same input, second run is all "unchanged". A new version of an existing obligation_id is an INSERT (cases bind to versions). If an existing (obligation_id, version) row differs from the input, raise ValueError — versions are immutable.

migrations runner: write scripts/migrate.py that applies all migrations in order, tracks applied migrations in a schema_migrations table, idempotent. Expose as `nuqe-engine migrate` via the CLI we'll wire up later.

Tests (tests/test_sync.py, mark with @pytest.mark.integration):
- Migrations apply cleanly to a fresh database.
- Re-running migrations is a no-op.
- Syncing the full library inserts 141 rows.
- Re-running sync is all "unchanged".
- Attempting to modify an existing version raises.
- audit_log rejects UPDATE and DELETE with a database-level error.

Use a separate test database (nuqe_engine_test) for integration tests. Create a conftest fixture that resets it between tests.

Verification:

docker compose up -d
nuqe-engine migrate  # or python -m scripts.migrate
pytest -v -m integration

All integration tests must pass.
```

---

## PROMPT 3: M7 Deadline scheduler

```
Read F1_HANDOFF.md first. (Note: we are building M7 before M4/M5/M6 because it's independent and has the cleanest test cases.)

You are building M7: the deadline scheduler at nuqe_engine/deadline.py.

Responsibilities:
1. Given an obligation and an anchor event timestamp, compute the deadline due_at.
2. Handle the three temporal deadline_units correctly:
   - calendar_days: anchor + N days, time-of-day preserved
   - business_days: anchor + N business days, skipping weekends and England & Wales bank holidays
   - hours: anchor + N hours
   - none: returns None (no deadline)
3. Decide whether a deadline is met, breached, or pending at any point in time.

Use the `holidays` package (already in pyproject.toml) for England & Wales. UK FCA rules generally use England & Wales bank holidays by default; if a row needs Scotland or NI, that's an extension we'll add later.

Public API:

class DeadlineCalculation(BaseModel):
    due_at: datetime | None  # None when deadline_unit is 'none'
    anchor_event_at: datetime
    deadline_value: int | None
    deadline_unit: DeadlineUnit
    deadline_anchor: DeadlineAnchor

def calculate_deadline(
    obligation: ObligationRow,
    anchor_event_at: datetime,
) -> DeadlineCalculation: ...

def deadline_status(due_at: datetime | None, as_of: datetime, satisfied_at: datetime | None) -> Literal["pending", "met", "breached", "irrelevant"]:
    """
    irrelevant: due_at is None (no deadline)
    met: satisfied_at is not None AND satisfied_at <= due_at
    breached: satisfied_at is None AND as_of > due_at, OR satisfied_at > due_at
    pending: due_at is in the future and not yet satisfied
    """

def add_business_days(start: datetime, days: int, country: str = "GB-ENG") -> datetime: ...

Test cases (tests/test_deadline.py):
- 3 calendar_days from Wednesday 2026-01-07 00:00 = Saturday 2026-01-10 00:00
- 3 business_days from Wednesday 2026-01-07 = Monday 2026-01-12 (skips Sat+Sun)
- 56 business_days for DISP final response from 2026-01-02 = correct date, with Easter and May bank holidays accounted for
- 8 hours from 2026-01-07 10:00 = 2026-01-07 18:00
- deadline_unit='none' returns due_at=None
- A real ObligationRow from the library (UK-DISP-001, 5 business_days for complaint acknowledgement) computes correctly
- deadline_status correctly identifies met/breached/pending across edge cases:
  - satisfied_at == due_at exactly: met
  - satisfied_at one second after due_at: breached
  - now == due_at exactly and not satisfied: pending (still has microseconds to spare)
  - now one second after due_at, not satisfied: breached

Time-zone behaviour: anchor_event_at is timezone-aware. All output is timezone-aware. Default to UTC. Document this clearly in the docstring.

Bank holiday verification: add a test that 2026-04-03 (Good Friday) is recognised as a holiday and that 3 business_days from 2026-04-02 lands on 2026-04-09 (Thursday) — skipping Good Friday, Easter Monday, and the weekend.

Verification:

pytest tests/test_deadline.py -v

All tests must pass. No integration test marker needed; this is pure computation.
```

---

## PROMPT 4: M4 Trigger evaluator

```
Read F1_HANDOFF.md first.

You are building M4: the trigger evaluator at nuqe_engine/trigger.py.

Responsibilities:
1. Given an incoming Event and a list of ObligationRows, determine which obligations fire.
2. An obligation fires when:
   a. obligation.trigger_condition.event matches the Event's event field, AND
   b. The conditions expression evaluates to True against the context, AND
   c. The exclusions expression evaluates to False against the context (or is 'null'/'false').
3. The conditions and exclusions expressions are strings in a small DSL.

Event model:

class Event(BaseModel):
    event: TriggerEvent
    case_id: UUID
    occurred_at: datetime
    context: dict[str, Any]  # Nested dict: case, customer, product, communication, agreement, firm

The DSL grammar (intentionally minimal):

expression := disjunction
disjunction := conjunction ("OR" conjunction)*
conjunction := comparison ("AND" comparison)*
comparison := operand operator operand
            | "(" expression ")"
            | "NOT" comparison
            | bool_literal
operator := "==" | "!=" | "<" | "<=" | ">" | ">=" | "IN" | "NOT IN"
operand := dotted_path | string_literal | number_literal | bool_literal | null_literal | list_literal
dotted_path := identifier ("." identifier)+
list_literal := "[" string_literal ("," string_literal)* "]"
bool_literal := "true" | "false"
null_literal := "null"

Examples from the actual library:
- "case.type=='complaint' AND case.status=='received'"
- "communication.type=='withdrawal_notice' AND communication.received_within_14_days_of_relevant_day==true"
- "case.status IN ('arrears','default') AND customer.vulnerability_indicator==true"
- "agreement.is_excluded_under_s_66A_14==true OR agreement.total_credit > 60260 AND agreement.is_residential_renovation==false"

The special string 'null' (in exclusions) means "no exclusions" — treat as False.

Build the evaluator as:

1. A lexer that emits tokens.
2. A recursive-descent parser that produces an AST.
3. An evaluator that walks the AST against a context dict.

Resolve dotted paths by walking the context dict. A missing path resolves to None. None compared with == returns False (not an error). None compared with < or > raises ExpressionError.

Public API:

class FiredObligation(BaseModel):
    obligation: ObligationRow
    matched_at: datetime
    trigger_event: TriggerEvent

class ExpressionError(ValueError): ...

def evaluate_expression(expr: str, context: dict[str, Any]) -> bool:
    """Evaluate a boolean expression against a context. Returns True or False."""

def find_fired_obligations(
    event: Event,
    obligations: list[ObligationRow],
) -> list[FiredObligation]:
    """Filter obligations to those whose trigger fires for this event."""

Tests (tests/test_trigger.py):
- Simple equality: case.status=='open' against {"case": {"status": "open"}} returns True.
- AND short-circuits: false AND <expr> doesn't evaluate the right side.
- OR short-circuits.
- IN with string list: case.status IN ('arrears','default') matches.
- NOT inversion.
- Nested parentheses.
- Missing path resolves to None safely.
- Comparing None with == False returns True; with == something returns False.
- 'null' or 'false' exclusion strings evaluate to False.
- A real obligation from the library fires correctly when the appropriate event arrives.
- A real obligation does not fire when the exclusions match.

End-to-end test against the library: load all 141 approved obligations, fire a COMPLAINT_RECEIVED event with a realistic context, assert that the expected DISP rules (at least UK-DISP-001 acknowledgement, UK-DISP-009 final response) appear in the fired list.

Verification:

pytest tests/test_trigger.py -v
ruff check nuqe_engine/trigger.py
mypy nuqe_engine/trigger.py

All tests pass. Coverage on trigger.py must be 90%+.
```

---

## PROMPT 5: M5 Requirement enforcer and M6 Evidence checker

```
Read F1_HANDOFF.md first.

You are building M5 (requirement enforcer) and M6 (evidence checker) together because they share a context model.

M5: nuqe_engine/requirement.py

Responsibilities:
1. Given a fired obligation, register the required action.
2. Translate the requirement.assertion into a deterministic check that can be re-evaluated later (when claimed-satisfied).
3. Return a RequirementRegistration that the engine persists.

Note: M5 does NOT execute actions (it doesn't send emails or write to external systems). It registers them as pending work and provides the assertion that determines when they're satisfied.

Public API:

class RequirementRegistration(BaseModel):
    fired_obligation_id: UUID
    action: RequirementAction
    action_parameters: dict[str, Any]
    assertion: str  # The raw assertion expression for later re-evaluation

class AssertionResult(BaseModel):
    satisfied: bool
    failed_clause: str | None  # If not satisfied, which conjunct failed
    evaluated_at: datetime

def register_requirement(fired_obligation: FiredObligation) -> RequirementRegistration: ...

def check_assertion(
    registration: RequirementRegistration,
    context: dict[str, Any],
) -> AssertionResult:
    """Re-evaluate the assertion against current context. Uses the same DSL as M4."""

M6: nuqe_engine/evidence.py

Responsibilities:
1. Given an Evidence specification and a case context, determine whether the evidence exists.
2. The selector is a string expression like "type==statutory_pre_contract_explanation AND communication.sent_before_agreement == true".
3. The location names a data source: communications_table, case_notes_table, document_store, external_system.

For F1, we don't query real customer data — those tables are populated by F2+. M6's job is:
- Validate that the selector is syntactically valid (uses our DSL parser from M4).
- Provide a clear API surface that F2+ can implement against.
- Implement an in-memory backend for testing.

Public API:

class EvidenceResult(BaseModel):
    found: bool
    location: EvidenceLocation
    selector: str
    matched_records: int  # 0 or more
    notes: str | None

class EvidenceBackend(Protocol):
    def find(self, location: EvidenceLocation, selector_ast: Any, case_id: UUID) -> int:
        """Return the count of records matching the selector at the given location."""

class InMemoryEvidenceBackend:
    """Test/dev backend. Stores records in a dict keyed by location."""
    def add(self, location: EvidenceLocation, record: dict[str, Any]) -> None: ...
    def find(self, location: EvidenceLocation, selector_ast: Any, case_id: UUID) -> int: ...

def check_evidence(
    evidence: Evidence,
    case_id: UUID,
    backend: EvidenceBackend,
) -> EvidenceResult: ...

Tests:

tests/test_requirement.py:
- Registering a requirement returns the expected fields.
- check_assertion with a satisfied assertion returns satisfied=True.
- check_assertion with a failed assertion returns satisfied=False, failed_clause names the conjunct.
- Real requirement from UK-DISP-001 registers and is checkable.

tests/test_evidence.py:
- InMemoryEvidenceBackend with a matching record returns found=True.
- No match returns found=False, matched_records=0.
- The selector goes through the same DSL parser; malformed selector raises ExpressionError at registration time, not at check time.
- A real evidence spec from UK-DISP-001 (communications_table, type==acknowledgement) finds an added record.

Verification:

pytest tests/test_requirement.py tests/test_evidence.py -v

All tests pass.
```

---

## PROMPT 6: M8 Audit log

```
Read F1_HANDOFF.md first.

You are building M8: the append-only audit log at nuqe_engine/audit.py.

Responsibilities:
1. Append an audit entry to the audit_log table for every state change.
2. HMAC-sign every entry using the AUDIT_SIGNING_KEY env variable.
3. Provide a query API for retrieving the audit trail of any entity.
4. Verify signatures on retrieval to detect tampering.

The audit_log table already exists from M3 migrations. Confirm the schema matches:
- id UUID PRIMARY KEY
- entity_type TEXT, entity_id UUID
- event_type TEXT
- actor TEXT
- payload JSONB
- hmac_signature TEXT
- created_at TIMESTAMPTZ

Signature algorithm:
- Canonical JSON serialisation of {id, entity_type, entity_id, event_type, actor, payload, created_at_iso}
- HMAC-SHA256 with AUDIT_SIGNING_KEY
- Hex-encoded result stored in hmac_signature

Public API:

class AuditEntry(BaseModel):
    id: UUID
    entity_type: str
    entity_id: UUID
    event_type: str
    actor: str
    payload: dict[str, Any]
    created_at: datetime
    hmac_signature: str
    signature_valid: bool | None = None  # Populated by verify_*, not by append

def append_audit_entry(
    conn,
    *,
    entity_type: str,
    entity_id: UUID,
    event_type: str,
    actor: str,
    payload: dict[str, Any],
) -> AuditEntry: ...

def get_audit_trail(
    conn,
    *,
    entity_id: UUID | None = None,
    entity_type: str | None = None,
    event_type: str | None = None,
    since: datetime | None = None,
    verify_signatures: bool = True,
) -> list[AuditEntry]: ...

def verify_signature(entry: AuditEntry, key: bytes) -> bool: ...

Standard event_type values (define as an Enum):
- OBLIGATION_FIRED
- DEADLINE_SET
- DEADLINE_MET
- DEADLINE_BREACHED
- EVIDENCE_FOUND
- EVIDENCE_MISSING
- REQUIREMENT_REGISTERED
- REQUIREMENT_SATISFIED
- LIBRARY_SYNCED
- CASE_OPENED
- CASE_CLOSED

Tests (tests/test_audit.py, @pytest.mark.integration):

- Append entry; round-trip retrieval preserves all fields.
- HMAC signature is generated on append.
- Signature verification passes for an untampered entry.
- Signature verification fails for a row whose payload was directly modified in the database (you'll need to use raw SQL to simulate tampering, since the engine API won't allow it).
- Querying by entity_id returns all entries for that entity in chronological order.
- UPDATE on audit_log raises database-level error.
- DELETE on audit_log raises database-level error.

Verification:

docker compose up -d
pytest tests/test_audit.py -v -m integration
ruff check nuqe_engine/audit.py
mypy nuqe_engine/audit.py
```

---

## PROMPT 7: Engine API + CLI + Integration test

```
Read F1_HANDOFF.md first.

This is the final F1 prompt. You are wiring all eight modules together into the public API and the CLI, and proving F1 works end-to-end.

Part 1: nuqe_engine/engine.py

Build the Engine class. This is the public surface. It composes M1-M8.

class Event(BaseModel):
    event: TriggerEvent
    case_id: UUID
    occurred_at: datetime
    context: dict[str, Any]

class ProcessEventResult(BaseModel):
    fired_obligations: list[FiredObligation]
    deadlines: list[DeadlineCalculation]
    requirements: list[RequirementRegistration]
    audit_entries: list[AuditEntry]

class ObligationStatus(BaseModel):
    obligation: ObligationRow
    fired_obligation_id: UUID
    fired_at: datetime
    due_at: datetime | None
    deadline_status: Literal["pending", "met", "breached", "irrelevant"]
    requirement_status: Literal["pending", "satisfied"]
    evidence_status: Literal["found", "missing", "not_checked"]

class Engine:
    def __init__(
        self,
        *,
        database_url: str,
        library_path: Path,
        audit_signing_key: bytes,
        evidence_backend: EvidenceBackend | None = None,
    ) -> None: ...

    @classmethod
    def from_env(cls) -> Engine:
        """Read DATABASE_URL, LIBRARY_PATH, AUDIT_SIGNING_KEY from environment."""

    def refresh_library(self, path: Path | None = None) -> SyncResult:
        """Load, validate, and sync the library to Postgres."""

    def process_event(self, event: Event) -> ProcessEventResult:
        """
        1. Load current library from Postgres (filter by review_status='approved').
        2. Find fired obligations via M4.
        3. Calculate deadlines via M7.
        4. Register requirements via M5.
        5. Write fired_obligations, deadlines to DB.
        6. Append audit entries via M8 for every step.
        Return the result.
        """

    def due_obligations(
        self,
        case_id: UUID,
        as_of: datetime | None = None,
    ) -> list[ObligationStatus]: ...

    def evidence_for(
        self,
        obligation_id: str,
        version: str,
        case_id: UUID,
    ) -> list[EvidenceResult]: ...

    def audit_trail(
        self,
        *,
        entity_id: UUID,
        entity_type: str | None = None,
    ) -> list[AuditEntry]: ...

Part 2: nuqe_engine/cli.py

Click-based CLI exposing:

nuqe-engine migrate                    # Apply migrations
nuqe-engine load <path>                # Load library, report any defects (does not sync)
nuqe-engine validate                   # Validate the library file from env, report defects
nuqe-engine sync                       # Validate + sync to Postgres
nuqe-engine status                     # Show library version, row count, last sync time

All commands read DATABASE_URL etc from .env (use python-dotenv or read os.environ directly).

Part 3: Integration test

tests/test_engine_integration.py with @pytest.mark.integration.

A single end-to-end test:

1. Fresh test database, migrations applied.
2. engine.refresh_library() against the real fixture.
3. Insert a case row directly (the case table will be populated by F2+ via API).
4. engine.process_event() with a COMPLAINT_RECEIVED event and a context that should fire DISP-001 and DISP-009.
5. Assert: ProcessEventResult.fired_obligations contains at least DISP-001 and DISP-009.
6. Assert: deadlines are set with sane due_at values (3 business days for DISP-001, 56 business days for DISP-009).
7. Assert: audit_log has entries for OBLIGATION_FIRED and DEADLINE_SET, signatures valid.
8. Call engine.due_obligations(case_id); assert returned statuses match.
9. Call engine.audit_trail(entity_id=case_id); assert it returns the expected events in order.

Part 4: Update README.md

Replace the "Status: F1 milestone, May 2026. Active development." section with a brief "F1 complete" section showing the public API usage example from F1_HANDOFF.md.

Verification:

docker compose up -d
nuqe-engine migrate
pytest -v                              # All unit tests pass
pytest -v -m integration               # All integration tests pass
ruff check nuqe_engine/                # Clean
mypy nuqe_engine/                      # Clean

If any of those fail, fix them. F1 is done when this entire verification block runs green.
```

---

## After F1 is done

You should have:

- 8 modules, each tested
- Postgres schema with 6 tables and append-only audit log
- A CLI for migrate/load/validate/sync/status
- An end-to-end integration test proving the engine processes real events against the real library
- A clean `pytest -v && pytest -v -m integration && ruff check && mypy` pass

That is F1 complete and you can begin F2 (the agent drafter).
