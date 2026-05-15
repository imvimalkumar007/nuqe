"""
Integration tests for M8: audit log.

These tests require a live Postgres instance. Run with:
    pytest -v -m integration

Uses the same nuqe_engine_test database as test_sync.py.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Generator
from uuid import UUID, uuid4

import psycopg
import pytest

from nuqe_engine.audit import (
    AuditEntry,
    AuditEventType,
    append_audit_entry,
    get_audit_trail,
    verify_signature,
)
from scripts.migrate import run_migrations

# ── Connection setup ──────────────────────────────────────────────────────

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine_test",
)

ADMIN_DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine",
)

SIGNING_KEY = b"test-signing-key-for-audit-log"


def _ensure_test_database() -> None:
    maintenance_url = re.sub(r"/[^/]+$", "/postgres", ADMIN_DATABASE_URL)
    with psycopg.connect(maintenance_url, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM pg_database WHERE datname = 'nuqe_engine_test'"
        )
        if not cur.fetchone():
            cur.execute("CREATE DATABASE nuqe_engine_test")


@pytest.fixture(scope="module")
def db_conn() -> Generator[psycopg.Connection, None, None]:
    """Fresh test database with migrations applied, autocommit on."""
    pytest.importorskip("psycopg")
    try:
        _ensure_test_database()
    except Exception as exc:
        pytest.skip(f"Cannot create test database: {exc}")

    try:
        run_migrations(TEST_DATABASE_URL)
    except Exception as exc:
        pytest.skip(f"Migrations failed: {exc}")

    try:
        conn = psycopg.connect(TEST_DATABASE_URL, autocommit=True)
    except Exception as exc:
        pytest.skip(f"Cannot connect to test database: {exc}")

    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def _clean_audit_log(db_conn: psycopg.Connection) -> Generator[None, None, None]:
    """Truncate audit_log before each test for isolation."""
    with db_conn.cursor() as cur:
        # Disable the immutability triggers for truncation only
        cur.execute("ALTER TABLE nuqe_engine.audit_log DISABLE TRIGGER ALL")
        cur.execute("TRUNCATE nuqe_engine.audit_log")
        cur.execute("ALTER TABLE nuqe_engine.audit_log ENABLE TRIGGER ALL")
    yield


# ── Helpers ───────────────────────────────────────────────────────────────


def _append(conn: psycopg.Connection, **overrides: object) -> AuditEntry:
    defaults: dict = dict(
        entity_type="case",
        entity_id=uuid4(),
        event_type=AuditEventType.CASE_OPENED,
        actor="engine",
        payload={"test": True},
        signing_key=SIGNING_KEY,
    )
    defaults.update(overrides)
    return append_audit_entry(conn, **defaults)  # type: ignore[arg-type]


# ── append_audit_entry ────────────────────────────────────────────────────


@pytest.mark.integration
def test_append_returns_audit_entry(db_conn: psycopg.Connection) -> None:
    entry = _append(db_conn)
    assert isinstance(entry, AuditEntry)


@pytest.mark.integration
def test_append_entry_has_id(db_conn: psycopg.Connection) -> None:
    entry = _append(db_conn)
    assert isinstance(entry.id, UUID)


@pytest.mark.integration
def test_append_entry_has_created_at(db_conn: psycopg.Connection) -> None:
    entry = _append(db_conn)
    assert entry.created_at.tzinfo is not None


@pytest.mark.integration
def test_append_entry_has_hmac_signature(db_conn: psycopg.Connection) -> None:
    entry = _append(db_conn)
    assert len(entry.hmac_signature) == 64  # SHA-256 hex digest


@pytest.mark.integration
def test_append_and_retrieve_round_trip(db_conn: psycopg.Connection) -> None:
    """All fields survive a round-trip through the database."""
    entity_id = uuid4()
    payload = {"obligation_id": "UK-CD-001", "version": "1.0.0"}
    entry = _append(
        db_conn,
        entity_type="fired_obligation",
        entity_id=entity_id,
        event_type=AuditEventType.OBLIGATION_FIRED,
        actor="engine",
        payload=payload,
    )

    trail = get_audit_trail(db_conn, entity_id=entity_id, signing_key=SIGNING_KEY)
    assert len(trail) == 1
    retrieved = trail[0]

    assert retrieved.id == entry.id
    assert retrieved.entity_type == "fired_obligation"
    assert retrieved.entity_id == entity_id
    assert retrieved.event_type == AuditEventType.OBLIGATION_FIRED
    assert retrieved.actor == "engine"
    assert retrieved.payload == payload
    assert retrieved.hmac_signature == entry.hmac_signature


# ── verify_signature ──────────────────────────────────────────────────────


@pytest.mark.integration
def test_signature_verifies_for_untampered_entry(db_conn: psycopg.Connection) -> None:
    entry = _append(db_conn)
    trail = get_audit_trail(db_conn, entity_id=entry.entity_id, signing_key=SIGNING_KEY)
    assert trail[0].signature_valid is True


@pytest.mark.integration
def test_signature_fails_for_tampered_payload(db_conn: psycopg.Connection) -> None:
    """Directly modifying the payload in the DB should invalidate the signature."""
    entry = _append(db_conn, payload={"original": True})

    # Simulate tampering by updating the payload directly in the DB
    # (bypassing the append-only check which only blocks UPDATE/DELETE via triggers;
    # we disable it temporarily to simulate an out-of-band DB modification)
    with db_conn.cursor() as cur:
        cur.execute("ALTER TABLE nuqe_engine.audit_log DISABLE TRIGGER ALL")
        cur.execute(
            "UPDATE nuqe_engine.audit_log SET payload = %s::jsonb WHERE id = %s",
            (json.dumps({"tampered": True}), str(entry.id)),
        )
        cur.execute("ALTER TABLE nuqe_engine.audit_log ENABLE TRIGGER ALL")

    trail = get_audit_trail(db_conn, entity_id=entry.entity_id, signing_key=SIGNING_KEY)
    assert trail[0].signature_valid is False


@pytest.mark.integration
def test_verify_signature_direct_call(db_conn: psycopg.Connection) -> None:
    entry = _append(db_conn)
    assert verify_signature(entry, SIGNING_KEY) is True


@pytest.mark.integration
def test_verify_signature_wrong_key_fails(db_conn: psycopg.Connection) -> None:
    entry = _append(db_conn)
    assert verify_signature(entry, b"wrong-key") is False


# ── get_audit_trail: filtering ────────────────────────────────────────────


@pytest.mark.integration
def test_filter_by_entity_id(db_conn: psycopg.Connection) -> None:
    eid_a = uuid4()
    eid_b = uuid4()
    _append(db_conn, entity_id=eid_a)
    _append(db_conn, entity_id=eid_b)
    _append(db_conn, entity_id=eid_a)

    trail = get_audit_trail(db_conn, entity_id=eid_a, signing_key=SIGNING_KEY)
    assert len(trail) == 2
    assert all(e.entity_id == eid_a for e in trail)


@pytest.mark.integration
def test_filter_by_entity_type(db_conn: psycopg.Connection) -> None:
    _append(db_conn, entity_type="case")
    _append(db_conn, entity_type="deadline")
    _append(db_conn, entity_type="case")

    trail = get_audit_trail(db_conn, entity_type="case", signing_key=SIGNING_KEY)
    assert len(trail) == 2


@pytest.mark.integration
def test_filter_by_event_type(db_conn: psycopg.Connection) -> None:
    _append(db_conn, event_type=AuditEventType.OBLIGATION_FIRED)
    _append(db_conn, event_type=AuditEventType.DEADLINE_SET)

    trail = get_audit_trail(
        db_conn,
        event_type=AuditEventType.OBLIGATION_FIRED,
        signing_key=SIGNING_KEY,
    )
    assert len(trail) == 1
    assert trail[0].event_type == AuditEventType.OBLIGATION_FIRED


@pytest.mark.integration
def test_results_ordered_chronologically(db_conn: psycopg.Connection) -> None:
    entity_id = uuid4()
    for _ in range(3):
        _append(db_conn, entity_id=entity_id)

    trail = get_audit_trail(db_conn, entity_id=entity_id, signing_key=SIGNING_KEY)
    assert len(trail) == 3
    times = [e.created_at for e in trail]
    assert times == sorted(times)


@pytest.mark.integration
def test_get_audit_trail_without_verify_does_not_set_signature_valid(
    db_conn: psycopg.Connection,
) -> None:
    entity_id = uuid4()
    _append(db_conn, entity_id=entity_id)
    trail = get_audit_trail(db_conn, entity_id=entity_id, verify_signatures=False)
    assert trail[0].signature_valid is None


@pytest.mark.integration
def test_get_audit_trail_verify_requires_signing_key(
    db_conn: psycopg.Connection,
) -> None:
    with pytest.raises(ValueError, match="signing_key"):
        get_audit_trail(db_conn, verify_signatures=True, signing_key=None)


# ── Append-only enforcement ───────────────────────────────────────────────


@pytest.mark.integration
def test_update_audit_log_raises_database_error(db_conn: psycopg.Connection) -> None:
    """The DB trigger must reject UPDATE on audit_log."""
    entry = _append(db_conn)
    with pytest.raises(psycopg.errors.RestrictViolation), db_conn.cursor() as cur:
        cur.execute(
            "UPDATE nuqe_engine.audit_log SET actor = 'tampered' WHERE id = %s",
            (str(entry.id),),
        )


@pytest.mark.integration
def test_delete_audit_log_raises_database_error(db_conn: psycopg.Connection) -> None:
    """The DB trigger must reject DELETE on audit_log."""
    entry = _append(db_conn)
    with pytest.raises(psycopg.errors.RestrictViolation), db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM nuqe_engine.audit_log WHERE id = %s",
            (str(entry.id),),
        )
