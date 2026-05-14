"""
End-to-end integration test for the Nuqe obligation engine.

This test verifies the full F1 pipeline against a live Postgres database
and the real obligation library fixture:

  1. Fresh test database with migrations applied.
  2. engine.refresh_library() syncs all 141 approved obligations.
  3. A case row is inserted directly (F2+ will open cases via API).
  4. engine.process_event() with COMPLAINT_RECEIVED fires the expected DISP rules.
  5. Fired obligations contain UK-DISP-001 and UK-DISP-009.
  6. UK-DISP-009 has a deadline ~56 calendar days from the event.
  7. Audit log has OBLIGATION_FIRED and DEADLINE_SET entries with valid signatures.
  8. engine.due_obligations() returns consistent statuses.
  9. engine.audit_trail() returns all entries for the case in order.

Run with:
    pytest -v -m integration tests/test_engine_integration.py
"""

from __future__ import annotations

import os
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Generator
from uuid import UUID, uuid4

import psycopg
import pytest

from nuqe_engine.audit import AuditEventType
from nuqe_engine.engine import Engine, ProcessEventResult
from nuqe_engine.schema import TriggerEvent
from nuqe_engine.trigger import Event
from scripts.migrate import run_migrations

# ── Constants ─────────────────────────────────────────────────────────────

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine_test",
)
ADMIN_DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine",
)
SIGNING_KEY = b"integration-test-signing-key"

LIBRARY_PATH = Path(__file__).parent / "fixtures" / "Nuqe_Obligation_Library.xlsx"

# Event context that satisfies UK-DISP rules:
# - UK-DISP-001, -006, -007, -009 fire on jurisdiction=='UK'
# - -007 and -009 exclusions require resolved_by_close_of_third_business_day==false
COMPLAINT_CONTEXT: dict = {
    "jurisdiction": "UK",
    "case": {
        "type": "complaint",
        "status": "received",
        "resolved_by_close_of_third_business_day": False,
    },
    "complainant": {
        "written_acceptance_recorded": False,
    },
}

# ── Fixtures ───────────────────────────────────────────────────────────────


def _ensure_test_database() -> None:
    maintenance_url = re.sub(r"/[^/]+$", "/postgres", ADMIN_DATABASE_URL)
    with psycopg.connect(maintenance_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM pg_database WHERE datname = 'nuqe_engine_test'"
            )
            if not cur.fetchone():
                cur.execute("CREATE DATABASE nuqe_engine_test")


@pytest.fixture(scope="module")
def engine() -> Engine:
    """Construct and return a configured Engine pointing at the test database."""
    pytest.importorskip("psycopg")
    if not LIBRARY_PATH.exists():
        pytest.skip(f"Library fixture not present at {LIBRARY_PATH}")

    try:
        _ensure_test_database()
    except Exception as exc:
        pytest.skip(f"Cannot create test database: {exc}")

    try:
        run_migrations(TEST_DATABASE_URL)
    except Exception as exc:
        pytest.skip(f"Migrations failed: {exc}")

    return Engine(
        database_url=TEST_DATABASE_URL,
        library_path=LIBRARY_PATH,
        audit_signing_key=SIGNING_KEY,
    )


@pytest.fixture(autouse=True)
def _clean_tables(engine: Engine) -> Generator[None, None, None]:
    """Truncate all data tables before each test for isolation (FK-safe CASCADE)."""
    from tests.conftest import clean_all_tables

    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        clean_all_tables(conn)
    yield


def _insert_case(case_id: UUID, context: dict) -> None:
    """Insert a case row directly. In F2+, the API will handle this."""
    import json

    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO nuqe_engine.cases (id, type, status, context)
                VALUES (%s, 'complaint', 'received', %s::jsonb)
                """,
                (str(case_id), json.dumps(context)),
            )


# ── Tests ──────────────────────────────────────────────────────────────────


@pytest.mark.integration
def test_refresh_library_syncs_obligations(engine: Engine) -> None:
    """refresh_library loads and syncs all approved obligations to the DB."""
    result = engine.refresh_library()
    assert result.inserted == 141
    assert result.unchanged == 0


@pytest.mark.integration
def test_refresh_library_idempotent(engine: Engine) -> None:
    """Running refresh_library twice leaves all rows unchanged on the second run."""
    engine.refresh_library()
    result2 = engine.refresh_library()
    assert result2.inserted == 0
    assert result2.unchanged == 141


@pytest.mark.integration
def test_process_event_fires_expected_obligations(engine: Engine) -> None:
    """
    COMPLAINT_RECEIVED with UK jurisdiction fires at least UK-DISP-001 and UK-DISP-009.
    """
    engine.refresh_library()
    case_id = uuid4()
    _insert_case(case_id, COMPLAINT_CONTEXT)

    event = Event(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        case_id=case_id,
        occurred_at=datetime(2026, 1, 7, 9, 0, 0, tzinfo=UTC),
        context=COMPLAINT_CONTEXT,
    )
    result: ProcessEventResult = engine.process_event(event)

    fired_ids = {f.obligation.obligation_id for f in result.fired_obligations}
    assert "UK-DISP-001" in fired_ids, f"UK-DISP-001 not fired. Fired: {fired_ids}"
    assert "UK-DISP-009" in fired_ids, f"UK-DISP-009 not fired. Fired: {fired_ids}"


@pytest.mark.integration
def test_process_event_returns_deadlines(engine: Engine) -> None:
    """Deadlines are calculated for obligations with deadline_unit != 'none'."""
    engine.refresh_library()
    case_id = uuid4()
    _insert_case(case_id, COMPLAINT_CONTEXT)

    occurred_at = datetime(2026, 1, 7, 9, 0, 0, tzinfo=UTC)
    event = Event(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        case_id=case_id,
        occurred_at=occurred_at,
        context=COMPLAINT_CONTEXT,
    )
    result = engine.process_event(event)

    # UK-DISP-009 has deadline of 56 calendar_days
    timed_deadlines = [d for d in result.deadlines if d.due_at is not None]
    assert len(timed_deadlines) > 0, "Expected at least one timed deadline"

    # Find UK-DISP-009's deadline
    disp009_fired = [
        f for f in result.fired_obligations
        if f.obligation.obligation_id == "UK-DISP-009"
    ]
    if disp009_fired:
        # UK-DISP-009: 56 calendar_days from 2026-01-07
        # 56 days = anchor + 56 days = 2026-03-04
        expected_due = occurred_at + timedelta(days=56)
        matching = [d for d in result.deadlines if d.due_at == expected_due]
        assert matching, (
            f"UK-DISP-009 due_at not found. Expected {expected_due.date()}. "
            f"Deadlines: {[d.due_at for d in result.deadlines]}"
        )


@pytest.mark.integration
def test_process_event_creates_requirements(engine: Engine) -> None:
    """register_requirement is called for each fired obligation."""
    engine.refresh_library()
    case_id = uuid4()
    _insert_case(case_id, COMPLAINT_CONTEXT)

    event = Event(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        case_id=case_id,
        occurred_at=datetime(2026, 1, 7, 9, 0, 0, tzinfo=UTC),
        context=COMPLAINT_CONTEXT,
    )
    result = engine.process_event(event)

    assert len(result.requirements) == len(result.fired_obligations)
    for req in result.requirements:
        assert req.action is not None
        assert req.assertion


@pytest.mark.integration
def test_process_event_audit_entries_exist(engine: Engine) -> None:
    """Audit log gets OBLIGATION_FIRED entries for each fired obligation."""
    engine.refresh_library()
    case_id = uuid4()
    _insert_case(case_id, COMPLAINT_CONTEXT)

    event = Event(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        case_id=case_id,
        occurred_at=datetime(2026, 1, 7, 9, 0, 0, tzinfo=UTC),
        context=COMPLAINT_CONTEXT,
    )
    result = engine.process_event(event)

    fired_events = [
        a for a in result.audit_entries
        if a.event_type == AuditEventType.OBLIGATION_FIRED
    ]
    assert len(fired_events) == len(result.fired_obligations)


@pytest.mark.integration
def test_process_event_audit_signatures_valid(engine: Engine) -> None:
    """All audit entries returned from process_event have valid HMAC signatures."""
    engine.refresh_library()
    case_id = uuid4()
    _insert_case(case_id, COMPLAINT_CONTEXT)

    event = Event(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        case_id=case_id,
        occurred_at=datetime(2026, 1, 7, 9, 0, 0, tzinfo=UTC),
        context=COMPLAINT_CONTEXT,
    )
    result = engine.process_event(event)

    from nuqe_engine.audit import verify_signature

    for entry in result.audit_entries:
        assert verify_signature(entry, SIGNING_KEY), (
            f"Signature invalid for audit entry {entry.id} ({entry.event_type})"
        )


@pytest.mark.integration
def test_process_event_idempotent(engine: Engine) -> None:
    """Re-processing the same event is a no-op (UNIQUE conflict on fired_obligations)."""
    engine.refresh_library()
    case_id = uuid4()
    _insert_case(case_id, COMPLAINT_CONTEXT)

    event = Event(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        case_id=case_id,
        occurred_at=datetime(2026, 1, 7, 9, 0, 0, tzinfo=UTC),
        context=COMPLAINT_CONTEXT,
    )
    result1 = engine.process_event(event)
    result2 = engine.process_event(event)

    # Second run returns no new fired obligations (all were conflicts)
    assert len(result2.fired_obligations) == 0
    assert len(result2.audit_entries) == 0
    # First run had obligations
    assert len(result1.fired_obligations) > 0


@pytest.mark.integration
def test_due_obligations_returns_statuses(engine: Engine) -> None:
    """due_obligations returns one ObligationStatus per fired obligation."""
    engine.refresh_library()
    case_id = uuid4()
    _insert_case(case_id, COMPLAINT_CONTEXT)

    event = Event(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        case_id=case_id,
        occurred_at=datetime(2026, 1, 7, 9, 0, 0, tzinfo=UTC),
        context=COMPLAINT_CONTEXT,
    )
    process_result = engine.process_event(event)
    statuses = engine.due_obligations(case_id)

    assert len(statuses) == len(process_result.fired_obligations)
    for status in statuses:
        assert status.deadline_status in ("pending", "met", "breached", "irrelevant")
        assert status.requirement_status in ("pending", "satisfied")
        assert status.evidence_status in ("found", "missing", "not_checked")


@pytest.mark.integration
def test_due_obligations_disp009_has_pending_deadline(engine: Engine) -> None:
    """UK-DISP-009 fires with a future deadline → status is 'pending'."""
    engine.refresh_library()
    case_id = uuid4()
    _insert_case(case_id, COMPLAINT_CONTEXT)

    event = Event(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        case_id=case_id,
        occurred_at=datetime(2026, 1, 7, 9, 0, 0, tzinfo=UTC),
        context=COMPLAINT_CONTEXT,
    )
    engine.process_event(event)

    # Check status as_of one day after the event (deadline is definitely still pending then)
    occurred_at = datetime(2026, 1, 7, 9, 0, 0, tzinfo=UTC)
    statuses = engine.due_obligations(case_id, as_of=occurred_at + timedelta(days=1))
    disp009 = [s for s in statuses if s.obligation.obligation_id == "UK-DISP-009"]

    if not disp009:
        pytest.skip("UK-DISP-009 not fired in this test run")

    assert disp009[0].due_at is not None
    assert disp009[0].deadline_status == "pending"


@pytest.mark.integration
def test_audit_trail_returns_entries_in_order(engine: Engine) -> None:
    """engine.audit_trail returns all entries for the case in chronological order."""
    engine.refresh_library()
    case_id = uuid4()
    _insert_case(case_id, COMPLAINT_CONTEXT)

    event = Event(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        case_id=case_id,
        occurred_at=datetime(2026, 1, 7, 9, 0, 0, tzinfo=UTC),
        context=COMPLAINT_CONTEXT,
    )
    process_result = engine.process_event(event)
    trail = engine.audit_trail(entity_id=case_id)

    assert len(trail) == len(process_result.audit_entries)
    timestamps = [e.created_at for e in trail]
    assert timestamps == sorted(timestamps), "Audit trail not in chronological order"


@pytest.mark.integration
def test_audit_trail_signatures_valid_on_retrieval(engine: Engine) -> None:
    """Signatures are verified on retrieval and all pass for unmodified entries."""
    engine.refresh_library()
    case_id = uuid4()
    _insert_case(case_id, COMPLAINT_CONTEXT)

    event = Event(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        case_id=case_id,
        occurred_at=datetime(2026, 1, 7, 9, 0, 0, tzinfo=UTC),
        context=COMPLAINT_CONTEXT,
    )
    engine.process_event(event)
    trail = engine.audit_trail(entity_id=case_id)

    assert len(trail) > 0
    for entry in trail:
        assert entry.signature_valid is True, (
            f"Signature invalid for {entry.event_type} entry {entry.id}"
        )


@pytest.mark.integration
def test_deadline_set_audit_entries_exist(engine: Engine) -> None:
    """DEADLINE_SET audit entries are created for obligations with deadlines."""
    engine.refresh_library()
    case_id = uuid4()
    _insert_case(case_id, COMPLAINT_CONTEXT)

    event = Event(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        case_id=case_id,
        occurred_at=datetime(2026, 1, 7, 9, 0, 0, tzinfo=UTC),
        context=COMPLAINT_CONTEXT,
    )
    result = engine.process_event(event)

    timed_deadlines = [d for d in result.deadlines if d.due_at is not None]
    deadline_set_entries = [
        a for a in result.audit_entries
        if a.event_type == AuditEventType.DEADLINE_SET
    ]
    assert len(deadline_set_entries) == len(timed_deadlines)
