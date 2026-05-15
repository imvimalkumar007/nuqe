"""Tests for Engine.connect and Engine.signing_key public accessors."""

from __future__ import annotations

import psycopg
import pytest

from nuqe_engine.engine import Engine


@pytest.mark.integration
def test_connect_yields_usable_connection() -> None:
    engine = Engine.from_env()
    with engine.connect() as conn:
        assert isinstance(conn, psycopg.Connection)
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            assert cur.fetchone() == (1,)


@pytest.mark.integration
def test_connect_closes_on_exit() -> None:
    engine = Engine.from_env()
    with engine.connect() as conn:
        pass
    assert conn.closed


@pytest.mark.integration
def test_connect_closes_on_exception() -> None:
    engine = Engine.from_env()
    with pytest.raises(RuntimeError):
        with engine.connect() as conn:
            raise RuntimeError("boom")
    assert conn.closed


def test_signing_key_returns_bytes(tmp_path) -> None:
    lib = tmp_path / "empty.xlsx"
    lib.touch()
    engine = Engine(
        database_url="postgresql://test",
        library_path=lib,
        audit_signing_key=b"test-key-bytes",
    )
    assert engine.signing_key == b"test-key-bytes"
    assert isinstance(engine.signing_key, bytes)


def test_signing_key_is_readonly(tmp_path) -> None:
    lib = tmp_path / "empty.xlsx"
    lib.touch()
    engine = Engine(
        database_url="postgresql://test",
        library_path=lib,
        audit_signing_key=b"test-key-bytes",
    )
    with pytest.raises(AttributeError):
        engine.signing_key = b"new-key"  # type: ignore[misc]
