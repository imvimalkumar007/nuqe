"""Shared pytest fixtures."""

from pathlib import Path

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
    briefly disabled and re-enabled around the operation.
    """
    with conn.cursor() as cur:
        cur.execute("ALTER TABLE nuqe_engine.audit_log DISABLE TRIGGER ALL")
        cur.execute(_TRUNCATE_SQL)
        cur.execute("ALTER TABLE nuqe_engine.audit_log ENABLE TRIGGER ALL")
