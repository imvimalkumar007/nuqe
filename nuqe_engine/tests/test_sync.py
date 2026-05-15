"""
Integration tests for M3: migrations runner and sync module.

These tests require a live Postgres instance. Run with:
    pytest -v -m integration

The DATABASE_URL for the test database defaults to:
    postgresql://nuqe:nuqe_secret@localhost:5432/nuqe_engine_test

A separate database (nuqe_engine_test) is used so the integration tests
never touch the development database.
"""

from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

import psycopg
import pytest

from nuqe_engine.loader import load_library
from nuqe_engine.sync import sync_to_database
from nuqe_engine.validator import validate
from scripts.migrate import run_migrations

# ── Connection setup ──────────────────────────────────────────────────────

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine_test",
)

# The dev database (used to create the test DB if needed)
ADMIN_DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine",
)


def _ensure_test_database() -> None:
    """Create nuqe_engine_test if it does not exist.

    Connects to the postgres maintenance database so this works even before
    nuqe_engine or nuqe_engine_test have been created.
    """
    # Build the maintenance URL by swapping the database name to 'postgres'
    import re
    maintenance_url = re.sub(r"/[^/]+$", "/postgres", ADMIN_DATABASE_URL)
    with psycopg.connect(maintenance_url, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM pg_database WHERE datname = 'nuqe_engine_test'"
        )
        if not cur.fetchone():
            cur.execute("CREATE DATABASE nuqe_engine_test")


def _drop_schema(conn: psycopg.Connection) -> None:  # type: ignore[type-arg]
    """Drop and recreate the nuqe_engine schema to give each test a clean slate."""
    with conn.cursor() as cur:
        cur.execute("DROP SCHEMA IF EXISTS nuqe_engine CASCADE")


@pytest.fixture(scope="module")
def test_db_url() -> str:
    """Ensure the test database exists and return its URL."""
    _ensure_test_database()
    return TEST_DATABASE_URL


@pytest.fixture
def fresh_conn(test_db_url: str) -> Generator[psycopg.Connection, None, None]:  # type: ignore[type-arg]
    """
    A psycopg connection to a freshly reset test database.
    Drops and re-creates the nuqe_engine schema before yielding.
    """
    with psycopg.connect(test_db_url, autocommit=True) as conn:
        _drop_schema(conn)
        yield conn


@pytest.fixture
def migrated_conn(fresh_conn: psycopg.Connection) -> psycopg.Connection:  # type: ignore[type-arg]
    """A connection where migrations have already been applied."""
    run_migrations(TEST_DATABASE_URL)
    return fresh_conn


@pytest.fixture
def validated_rows(library_path: Path) -> list:
    """All 141 validated ObligationRows from the real library fixture."""
    raw = load_library(library_path, approved_only=True)
    result = validate(raw)
    assert not [d for d in result.defects if d.severity == "error"], (
        "Library validation produced errors — fix these before running sync tests."
    )
    return result.valid


# ── Migration tests ───────────────────────────────────────────────────────


@pytest.mark.integration
def test_migrations_apply_to_fresh_database(fresh_conn: psycopg.Connection) -> None:  # type: ignore[type-arg]
    """All migrations apply cleanly to an empty schema."""
    applied = run_migrations(TEST_DATABASE_URL)
    assert applied >= 1, "Expected at least one migration to be applied"

    # Confirm the tables exist
    with fresh_conn.cursor() as cur:
        cur.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'nuqe_engine'
            ORDER BY table_name
            """
        )
        tables = {row[0] for row in cur.fetchall()}

    expected = {
        "obligations",
        "cases",
        "fired_obligations",
        "deadlines",
        "evidence_checks",
        "audit_log",
        "schema_migrations",
    }
    assert expected.issubset(tables), (
        f"Missing tables after migration: {expected - tables}"
    )


@pytest.mark.integration
def test_migrations_are_idempotent(fresh_conn: psycopg.Connection) -> None:  # type: ignore[type-arg]
    """Re-running migrations when they are already applied is a no-op."""
    run_migrations(TEST_DATABASE_URL)
    second_run = run_migrations(TEST_DATABASE_URL)
    assert second_run == 0, (
        f"Expected 0 migrations on second run, got {second_run}"
    )


# ── Sync tests ────────────────────────────────────────────────────────────


@pytest.mark.integration
def test_sync_inserts_all_library_rows(
    migrated_conn: psycopg.Connection,  # type: ignore[type-arg]
    validated_rows: list,
) -> None:
    """Syncing the full library inserts 141 rows."""
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        result = sync_to_database(validated_rows, conn)
        conn.commit()

    assert result.inserted == 141, (
        f"Expected 141 insertions, got {result.inserted}"
    )
    assert result.unchanged == 0
    assert result.updated == 0


@pytest.mark.integration
def test_sync_is_idempotent(
    migrated_conn: psycopg.Connection,  # type: ignore[type-arg]
    validated_rows: list,
) -> None:
    """Re-running sync with the same rows is all 'unchanged'."""
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        sync_to_database(validated_rows, conn)
        conn.commit()

    with psycopg.connect(TEST_DATABASE_URL) as conn:
        result = sync_to_database(validated_rows, conn)
        conn.commit()

    assert result.inserted == 0
    assert result.unchanged == 141
    assert result.skipped_versions != []


@pytest.mark.integration
def test_sync_raises_on_version_content_conflict(
    migrated_conn: psycopg.Connection,  # type: ignore[type-arg]
    validated_rows: list,
) -> None:
    """Attempting to sync a different payload for an existing (id, version) raises."""
    first_row = validated_rows[0]

    # Insert the original
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        sync_to_database([first_row], conn)
        conn.commit()

    # Now mutate the row's name (same id and version, different content)
    mutated = first_row.model_copy(
        update={"obligation_name": "DELIBERATELY CHANGED NAME"}
    )

    with psycopg.connect(TEST_DATABASE_URL) as conn, pytest.raises(ValueError, match="Version conflict"):
        sync_to_database([mutated], conn)


@pytest.mark.integration
def test_audit_log_rejects_update(migrated_conn: psycopg.Connection) -> None:  # type: ignore[type-arg]
    """UPDATE on audit_log raises a database-level error."""
    import uuid

    row_id = str(uuid.uuid4())
    entity_id = str(uuid.uuid4())

    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO nuqe_engine.audit_log
                    (id, entity_type, entity_id, event_type, actor, payload, hmac_signature)
                VALUES (%s, 'case', %s, 'test_event', 'test', '{}', 'fakesig')
                """,
                (row_id, entity_id),
            )
        conn.commit()

    with psycopg.connect(TEST_DATABASE_URL) as conn, pytest.raises(psycopg.errors.RestrictViolation):
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE nuqe_engine.audit_log SET actor = 'tampered' WHERE id = %s",
                (row_id,),
            )
        conn.commit()


@pytest.mark.integration
def test_audit_log_rejects_delete(migrated_conn: psycopg.Connection) -> None:  # type: ignore[type-arg]
    """DELETE on audit_log raises a database-level error."""
    import uuid

    row_id = str(uuid.uuid4())
    entity_id = str(uuid.uuid4())

    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO nuqe_engine.audit_log
                    (id, entity_type, entity_id, event_type, actor, payload, hmac_signature)
                VALUES (%s, 'case', %s, 'test_event', 'test', '{}', 'fakesig')
                """,
                (row_id, entity_id),
            )
        conn.commit()

    with psycopg.connect(TEST_DATABASE_URL) as conn, pytest.raises(psycopg.errors.RestrictViolation):
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM nuqe_engine.audit_log WHERE id = %s",
                (row_id,),
            )
        conn.commit()
