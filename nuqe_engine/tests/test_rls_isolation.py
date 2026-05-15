"""
Adversarial RLS isolation tests — F3.1

All tests connect at the DB level (raw psycopg, not the Engine layer) to
verify that Row Level Security enforces org-level isolation.

Connection roles:
  APP_DSN          — nuqe_app (non-privileged, subject to RLS)
  MIGRATION_DSN    — nuqe     (owner, bypasses RLS — used for setup only)
  ADMIN_BYPASS_DSN — nuqe_admin (BYPASSRLS, read-only — analytics role)

Run with: pytest -m integration tests/test_rls_isolation.py
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Generator

import psycopg
import pytest

# ── Connection strings ────────────────────────────────────────────────────────

APP_DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://nuqe_app:nuqe_secret@localhost:5432/nuqe",
)

MIGRATION_DSN = os.environ.get(
    "MIGRATION_DATABASE_URL",
    os.environ.get(
        "DATABASE_URL",
        "postgresql://nuqe:nuqe_secret@localhost:5432/nuqe",
    ),
)

ADMIN_BYPASS_DSN = os.environ.get(
    "NUQE_ADMIN_DSN",
    "postgresql://nuqe_admin:PLACEHOLDER_SET_VIA_ENV_BEFORE_PROD@localhost:5432/nuqe",
)


# ── Fixtures ──────────────────────────────────────────────────────────────────


def _create_org(cur: psycopg.Cursor, suffix: str) -> uuid.UUID:
    """Insert a fresh test org and return its id."""
    cur.execute(
        """
        INSERT INTO nuqe_engine.organisations (name, slug, created_by)
        VALUES (%s, %s, 'test')
        RETURNING id
        """,
        (f"Test Org {suffix}", f"test-org-{suffix}-{uuid.uuid4().hex[:8]}"),
    )
    row = cur.fetchone()
    assert row is not None
    return row[0]


def _create_case(cur: psycopg.Cursor, org_id: uuid.UUID) -> uuid.UUID:
    """Insert a minimal case row and return its id."""
    cur.execute(
        """
        INSERT INTO nuqe_engine.cases
            (type, status, org_id)
        VALUES ('complaint', 'open', %s)
        RETURNING id
        """,
        (org_id,),
    )
    row = cur.fetchone()
    assert row is not None
    return row[0]


@pytest.fixture()
def two_orgs() -> Generator[tuple[uuid.UUID, uuid.UUID], None, None]:
    """Create org_a and org_b; seed one case each. Clean up after the test.

    Uses the MIGRATION_DSN (nuqe owner) to bypass RLS during setup.
    """
    # nuqe has BYPASSRLS so can insert without setting org context
    with psycopg.connect(MIGRATION_DSN, autocommit=False) as conn:
        with conn.cursor() as cur:
            org_a = _create_org(cur, "a")
            org_b = _create_org(cur, "b")
            _create_case(cur, org_a)
            _create_case(cur, org_b)
        conn.commit()

    yield org_a, org_b

    # Teardown: delete the test orgs and their cases (nuqe bypasses RLS)
    with psycopg.connect(MIGRATION_DSN, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM nuqe_engine.cases WHERE org_id IN (%s, %s)",
                (org_a, org_b),
            )
            cur.execute(
                "DELETE FROM nuqe_engine.organisations WHERE id IN (%s, %s)",
                (org_a, org_b),
            )
        conn.commit()


# ── Tests ─────────────────────────────────────────────────────────────────────


@pytest.mark.integration
def test_unset_org_context_blocks_all_reads() -> None:
    """nuqe_app with no app.current_org_id sees zero rows in every RLS table."""
    tables = [
        "nuqe_engine.cases",
        "nuqe_engine.fired_obligations",
        "nuqe_engine.audit_log",
        "nuqe_engine.notifications",
        "nuqe_engine.obligations",
    ]
    with psycopg.connect(APP_DSN, autocommit=True) as conn, conn.cursor() as cur:
        for table in tables:
            cur.execute(f"SELECT count(*) FROM {table}")
            count = cur.fetchone()[0]  # type: ignore[index]
            assert count == 0, (
                f"{table}: expected 0 rows with no org context, got {count}"
            )


@pytest.mark.integration
def test_set_org_context_returns_only_that_orgs_rows(
    two_orgs: tuple[uuid.UUID, uuid.UUID],
) -> None:
    """Setting org context returns only that org's rows."""
    org_a, org_b = two_orgs

    with psycopg.connect(APP_DSN, autocommit=False) as conn:
        with conn.cursor() as cur:
            # org_a context
            conn.execute(
                f"SET LOCAL app.current_org_id = '{org_a}'"
            )
            cur.execute("SELECT count(*) FROM nuqe_engine.cases")
            count_a = cur.fetchone()[0]  # type: ignore[index]
            assert count_a == 1, f"Expected 1 case for org_a, got {count_a}"

        conn.rollback()

        with conn.cursor() as cur:
            # org_b context
            conn.execute(
                f"SET LOCAL app.current_org_id = '{org_b}'"
            )
            cur.execute("SELECT count(*) FROM nuqe_engine.cases")
            count_b = cur.fetchone()[0]  # type: ignore[index]
            assert count_b == 1, f"Expected 1 case for org_b, got {count_b}"

        conn.rollback()


@pytest.mark.integration
def test_cross_org_insert_is_blocked(
    two_orgs: tuple[uuid.UUID, uuid.UUID],
) -> None:
    """Inserting a row with the wrong org_id under a different org context is blocked."""
    org_a, org_b = two_orgs

    with psycopg.connect(APP_DSN, autocommit=False) as conn:
        conn.execute(
            f"SET LOCAL app.current_org_id = '{org_a}'"
        )
        with pytest.raises(
            (psycopg.errors.RaiseException, psycopg.errors.CheckViolation,
             psycopg.errors.InsufficientPrivilege),
        ):
            conn.execute(
                """
                INSERT INTO nuqe_engine.cases (type, status, org_id)
                VALUES ('complaint', 'open', %s)
                """,
                (org_b,),
            )
        conn.rollback()


@pytest.mark.integration
def test_cross_org_update_is_blocked(
    two_orgs: tuple[uuid.UUID, uuid.UUID],
) -> None:
    """UPDATE on a row from another org is silently invisible (0 rows affected)."""
    org_a, org_b = two_orgs

    # Get org_a's case id via migration role (superuser bypasses RLS)
    with psycopg.connect(MIGRATION_DSN, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM nuqe_engine.cases WHERE org_id = %s LIMIT 1",
            (org_a,),
        )
        row = cur.fetchone()
        assert row is not None
        case_id = row[0]

    # Attempt UPDATE under org_b context — should affect 0 rows
    with psycopg.connect(APP_DSN, autocommit=False) as conn:
        conn.execute(
            f"SET LOCAL app.current_org_id = '{org_b}'"
        )
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE nuqe_engine.cases SET status = 'closed' WHERE id = %s",
                (case_id,),
            )
            assert cur.rowcount == 0, (
                f"Expected 0 rows updated (RLS should block), got {cur.rowcount}"
            )
        conn.rollback()


@pytest.mark.integration
def test_cross_org_delete_is_blocked(
    two_orgs: tuple[uuid.UUID, uuid.UUID],
) -> None:
    """DELETE on a row from another org is silently invisible (0 rows affected)."""
    org_a, org_b = two_orgs

    # Get org_a's case id via migration role
    with psycopg.connect(MIGRATION_DSN, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM nuqe_engine.cases WHERE org_id = %s LIMIT 1",
            (org_a,),
        )
        row = cur.fetchone()
        assert row is not None
        case_id = row[0]

    # Attempt DELETE under org_b context — should affect 0 rows
    with psycopg.connect(APP_DSN, autocommit=False) as conn:
        conn.execute(
            f"SET LOCAL app.current_org_id = '{org_b}'"
        )
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM nuqe_engine.cases WHERE id = %s",
                (case_id,),
            )
            assert cur.rowcount == 0, (
                f"Expected 0 rows deleted (RLS should block), got {cur.rowcount}"
            )
        conn.rollback()


@pytest.mark.integration
def test_admin_role_bypasses_rls() -> None:
    """nuqe_admin (BYPASSRLS) sees all rows without setting org context."""
    try:
        with psycopg.connect(ADMIN_BYPASS_DSN, autocommit=True) as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM nuqe_engine.cases")
            total = cur.fetchone()[0]  # type: ignore[index]
            # There should be existing data from the backfill
            assert total > 0, (
                "nuqe_admin should see all rows without org context"
            )
    except psycopg.OperationalError as exc:
        pytest.skip(
            f"nuqe_admin role not accessible (NUQE_ADMIN_DSN may need real password): {exc}"
        )


@pytest.mark.integration
def test_set_local_does_not_leak_across_transactions(
    two_orgs: tuple[uuid.UUID, uuid.UUID],
) -> None:
    """SET LOCAL app.current_org_id is transaction-scoped — does not leak."""
    org_a, _org_b = two_orgs

    with psycopg.connect(APP_DSN, autocommit=False) as conn:
        # First transaction: set org_a context
        with conn.transaction():
            conn.execute(
                f"SET LOCAL app.current_org_id = '{org_a}'"
            )
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM nuqe_engine.cases")
                in_txn = cur.fetchone()[0]  # type: ignore[index]
            assert in_txn == 1, f"Expected 1 in txn, got {in_txn}"
        # Transaction committed — SET LOCAL scope ended

        # Second transaction: NO SET — should see 0 rows
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM nuqe_engine.cases")
                after_txn = cur.fetchone()[0]  # type: ignore[index]
            assert after_txn == 0, (
                f"SET LOCAL leaked across transactions: got {after_txn}, expected 0"
            )
