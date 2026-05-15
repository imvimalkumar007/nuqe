"""
Integration tests for engine.process_event(conn=) transactional behaviour.

Verifies that:
- When called with an external conn that is subsequently rolled back, no rows
  are persisted (fired_obligations, audit_log).
- When called without conn (the default), the event commits as before.

Run with:
    pytest -v -m integration tests/test_engine_transactional.py
"""

from __future__ import annotations

import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Generator
from uuid import UUID, uuid4

import psycopg
import pytest

from nuqe_engine.audit import AuditEventType
from nuqe_engine.engine import Engine
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

COMPLAINT_CONTEXT: dict = {
    "jurisdiction": "UK",
    "case": {
        "type": "complaint",
        "status": "received",
        "resolved_by_close_of_third_business_day": False,
    },
    "complainant": {"written_acceptance_recorded": False},
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
    eng = Engine(
        database_url=TEST_DATABASE_URL,
        library_path=LIBRARY_PATH,
        audit_signing_key=SIGNING_KEY,
    )
    eng.refresh_library()
    return eng


@pytest.fixture(autouse=True)
def _clean_tables(engine: Engine) -> Generator[None, None, None]:
    from tests.conftest import clean_all_tables

    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        clean_all_tables(conn)
    yield


def _insert_case(case_id: UUID) -> None:
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO nuqe_engine.cases (id, type, status) VALUES (%s, 'complaint', 'open')",
                (str(case_id),),
            )


def _count_fired_obligations(case_id: UUID) -> int:
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM nuqe_engine.fired_obligations WHERE case_id = %s",
                (str(case_id),),
            )
            row = cur.fetchone()
    return int(row[0]) if row else 0


def _count_audit_entries(case_id: UUID) -> int:
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM nuqe_engine.audit_log WHERE entity_id = %s",
                (str(case_id),),
            )
            row = cur.fetchone()
    return int(row[0]) if row else 0


# ── Tests ──────────────────────────────────────────────────────────────────


@pytest.mark.integration
def test_process_event_with_conn_rolls_back_on_outer_rollback(
    engine: Engine,
) -> None:
    """
    process_event(event, conn=conn) within a transaction that is subsequently
    rolled back must leave no fired_obligations or audit_log rows.
    """
    case_id = uuid4()
    _insert_case(case_id)

    event = Event(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        case_id=case_id,
        occurred_at=datetime.now(tz=UTC),
        context=COMPLAINT_CONTEXT,
    )

    with psycopg.connect(TEST_DATABASE_URL) as outer_conn:
        engine.process_event(event, conn=outer_conn)
        # Do NOT commit — fall out of context manager to roll back
        outer_conn.rollback()

    assert _count_fired_obligations(case_id) == 0, (
        "Rolled-back transaction should leave no fired_obligations rows"
    )
    assert _count_audit_entries(case_id) == 0, (
        "Rolled-back transaction should leave no audit_log rows"
    )


@pytest.mark.integration
def test_process_event_without_conn_commits(engine: Engine) -> None:
    """
    process_event(event) without conn opens its own connection and commits,
    so rows persist after the call returns.
    """
    case_id = uuid4()
    _insert_case(case_id)

    event = Event(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        case_id=case_id,
        occurred_at=datetime.now(tz=UTC),
        context=COMPLAINT_CONTEXT,
    )

    result = engine.process_event(event)

    assert len(result.fired_obligations) > 0, "Expected at least one fired obligation"
    assert _count_fired_obligations(case_id) == len(result.fired_obligations), (
        "Fired obligations should be persisted"
    )
    assert _count_audit_entries(case_id) > 0, (
        "Audit log entries should be persisted"
    )
