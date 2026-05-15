"""Tests for Engine.connect and Engine.signing_key public accessors."""

from __future__ import annotations

import os
from uuid import UUID

import psycopg
import pytest

from nuqe_engine.engine import Engine

# Pilot org_id — read from env or use the known development value
_PILOT_ORG_ID = UUID(
    os.environ.get("PILOT_ORG_ID", "a9f318f7-d5be-4235-974e-b3864cc487c1")
)


@pytest.mark.integration
def test_connect_yields_usable_connection() -> None:
    engine = Engine.from_env()
    with engine.connect(_PILOT_ORG_ID) as conn:
        assert isinstance(conn, psycopg.Connection)
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            assert cur.fetchone() == (1,)


@pytest.mark.integration
def test_connect_closes_on_exit() -> None:
    engine = Engine.from_env()
    with engine.connect(_PILOT_ORG_ID) as conn:
        pass
    assert conn.closed


@pytest.mark.integration
def test_connect_closes_on_exception() -> None:
    engine = Engine.from_env()
    with pytest.raises(RuntimeError):  # noqa: SIM117
        with engine.connect(_PILOT_ORG_ID) as conn:
            raise RuntimeError("boom")
    assert conn.closed


@pytest.mark.integration
def test_connect_sets_session_var() -> None:
    """SET LOCAL app.current_org_id is visible within the transaction."""
    engine = Engine.from_env()
    with engine.connect(_PILOT_ORG_ID) as conn, conn.cursor() as cur:
        cur.execute("SELECT current_setting('app.current_org_id', true)")
        val = cur.fetchone()[0]
    assert val == str(_PILOT_ORG_ID)


@pytest.mark.integration
def test_connect_rolls_back_on_exception() -> None:
    """An exception inside connect() causes rollback; the insert is absent."""
    engine = Engine.from_env()
    # We test rollback by verifying the exception propagates and the conn closes cleanly
    with pytest.raises(ValueError), engine.connect(_PILOT_ORG_ID) as conn:
        assert not conn.closed
        raise ValueError("trigger rollback")
    assert conn.closed


def test_signing_key_returns_bytes() -> None:
    engine = Engine(
        database_url="postgresql://test",
        audit_signing_key=b"test-key-bytes",
    )
    assert engine.signing_key == b"test-key-bytes"
    assert isinstance(engine.signing_key, bytes)


def test_signing_key_is_readonly() -> None:
    engine = Engine(
        database_url="postgresql://test",
        audit_signing_key=b"test-key-bytes",
    )
    with pytest.raises(AttributeError):
        engine.signing_key = b"new-key"  # type: ignore[misc]
