"""
Integration test: verify no row leakage between tests in the same DB session.

Runs three successive operations against the live test database and asserts
that clean_all_tables() leaves zero rows between each test.

Run with: pytest -v -m integration tests/test_integration_stability.py
"""

from __future__ import annotations

import os
import re
from collections.abc import Generator
from uuid import uuid4

import psycopg
import pytest

from scripts.migrate import run_migrations
from tests.conftest import clean_all_tables

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine_test",
)
ADMIN_DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine",
)


def _ensure_test_database() -> None:
    maintenance_url = re.sub(r"/[^/]+$", "/postgres", ADMIN_DATABASE_URL)
    with psycopg.connect(maintenance_url, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_database WHERE datname = 'nuqe_engine_test'")
        if not cur.fetchone():
            cur.execute("CREATE DATABASE nuqe_engine_test")


@pytest.fixture(scope="module")
def conn() -> Generator[psycopg.Connection, None, None]:
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
        c = psycopg.connect(TEST_DATABASE_URL, autocommit=True)
    except Exception as exc:
        pytest.skip(f"Cannot connect to test database: {exc}")
    yield c
    c.close()


def _insert_case(conn: psycopg.Connection, case_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO nuqe_engine.cases (id, type, status, context) "
            "VALUES (%s, 'complaint', 'received', '{}'::jsonb)",
            (case_id,),
        )


def _count_cases(conn: psycopg.Connection) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM nuqe_engine.cases")
        row = cur.fetchone()
        return int(row[0]) if row else 0


@pytest.fixture(autouse=True)
def clean_before_each(conn: psycopg.Connection) -> Generator[None, None, None]:
    """Ensure a clean slate before each test."""
    clean_all_tables(conn)
    yield
    # Also clean after so a failing test doesn't pollute the next
    clean_all_tables(conn)


# ── Tests ─────────────────────────────────────────────────────────────────


@pytest.mark.integration
def test_first_operation_inserts_one_case(conn: psycopg.Connection) -> None:
    """Insert one case; assert exactly one row exists."""
    _insert_case(conn, str(uuid4()))
    assert _count_cases(conn) == 1


@pytest.mark.integration
def test_second_operation_sees_clean_state(conn: psycopg.Connection) -> None:
    """
    After the first test's cleanup, this test starts with zero cases.
    Inserts two cases; asserts exactly two rows (no leakage from test 1).
    """
    assert _count_cases(conn) == 0, "Leaked rows from previous test!"
    _insert_case(conn, str(uuid4()))
    _insert_case(conn, str(uuid4()))
    assert _count_cases(conn) == 2


@pytest.mark.integration
def test_third_operation_also_sees_clean_state(conn: psycopg.Connection) -> None:
    """Third test confirms the pattern holds across three consecutive tests."""
    assert _count_cases(conn) == 0, "Leaked rows from previous test!"
    _insert_case(conn, str(uuid4()))
    assert _count_cases(conn) == 1
