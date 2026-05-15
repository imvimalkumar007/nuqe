"""Shared pytest fixtures."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Generator
from uuid import UUID

import psycopg
import pytest

TESTS_DIR = Path(__file__).parent
FIXTURES_DIR = TESTS_DIR / "fixtures"


@pytest.fixture
def library_path() -> Path:
    """Path to the real Nuqe_Obligation_Library.xlsx fixture."""
    p = FIXTURES_DIR / "Nuqe_Obligation_Library.xlsx"
    if not p.exists():
        pytest.skip(f"Library fixture not present at {p}")
    return p


# ── Integration DB helpers ────────────────────────────────────────────────

# Tables in FK-safe truncation order (children before parents).
# Using TRUNCATE … CASCADE so a missed entry doesn't block the others.
_TRUNCATE_TABLES = [
    "nuqe_engine.audit_log",
    "nuqe_engine.evidence_checks",
    "nuqe_engine.deadlines",
    "nuqe_engine.fired_obligations",
    "nuqe_engine.cases",
    "nuqe_engine.obligations",
]

_TRUNCATE_SQL = (
    "TRUNCATE "
    + ", ".join(_TRUNCATE_TABLES)
    + " CASCADE"
)


def clean_all_tables(conn) -> None:  # type: ignore[type-arg]
    """Truncate every engine table in FK-safe order using CASCADE.

    The audit_log has immutability triggers that block TRUNCATE; they are
    bypassed via session_replication_role = replica (requires superuser/owner).
    Must be called on a MIGRATION_DATABASE_URL connection (nuqe owner).
    """
    with conn.cursor() as cur:
        cur.execute("SET session_replication_role = replica")
        cur.execute(_TRUNCATE_SQL)
        cur.execute("SET session_replication_role = DEFAULT")


# ── F3.1 org-aware fixtures ───────────────────────────────────────────────────

_MIGRATION_DSN = os.environ.get(
    "MIGRATION_DATABASE_URL",
    os.environ.get(
        "DATABASE_URL",
        "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine",
    ),
)

_APP_DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://nuqe_app:nuqe_secret@localhost:5433/nuqe_engine",
)


@pytest.fixture(scope="session")
def migration_conn() -> Generator[psycopg.Connection, None, None]:  # type: ignore[type-arg]
    """Session-scoped connection using the migration role (nuqe, BYPASSRLS)."""
    with psycopg.connect(_MIGRATION_DSN, autocommit=True) as conn:
        yield conn


@pytest.fixture(scope="session")
def pilot_org_id(migration_conn: psycopg.Connection) -> UUID:  # type: ignore[type-arg]
    """Return the UUID of the pilot org (created in F3.1 backfill)."""
    with migration_conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM nuqe_engine.organisations WHERE slug = 'pilot' LIMIT 1"
        )
        row = cur.fetchone()
        if row is None:
            pytest.skip("Pilot org not found — run F3.1 migration first")
        return row[0]


@pytest.fixture()
def org_conn(pilot_org_id: UUID) -> Generator[psycopg.Connection, None, None]:  # type: ignore[type-arg]
    """nuqe_app connection with org context set to pilot org.

    Rolls back after each test — data written inside this connection is not
    committed to the database.
    """
    with psycopg.connect(_APP_DSN, autocommit=False) as conn:
        conn.execute(f"SET LOCAL app.current_org_id = '{pilot_org_id}'")
        yield conn
        conn.rollback()
