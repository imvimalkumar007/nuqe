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
