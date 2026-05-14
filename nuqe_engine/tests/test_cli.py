"""
Tests for nuqe_engine.cli (M9) using click.testing.CliRunner.

All tests run in isolation (no real database required) except those
explicitly marked 'integration'. The CLI is exercised via CliRunner
so subprocess launch overhead and environment leakage are avoided.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import openpyxl
import pytest
from click.testing import CliRunner

from nuqe_engine.cli import cli

FIXTURES_DIR = Path(__file__).parent / "fixtures"
LIBRARY_PATH = FIXTURES_DIR / "Nuqe_Obligation_Library.xlsx"


# ── Helpers ────────────────────────────────────────────────────────────────


def _runner() -> CliRunner:
    return CliRunner()


def _malformed_xlsx(tmp_path: Path) -> Path:
    """
    Write an xlsx file whose header row does not match the canonical 24-column
    schema, so load_library raises LoaderError → CLI exits non-zero.
    """
    p = tmp_path / "malformed.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["wrong_col_1", "wrong_col_2", "wrong_col_3"])  # type: ignore[union-attr]
    ws.append(["a", "b", "c"])  # type: ignore[union-attr]
    wb.save(str(p))
    return p


# ── Help / group ───────────────────────────────────────────────────────────


def test_cli_help_exits_zero() -> None:
    result = _runner().invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "obligation engine" in result.output.lower()


def test_load_help_exits_zero() -> None:
    result = _runner().invoke(cli, ["load", "--help"])
    assert result.exit_code == 0
    assert "PATH" in result.output


def test_validate_help_exits_zero() -> None:
    result = _runner().invoke(cli, ["validate", "--help"])
    assert result.exit_code == 0


def test_sync_help_exits_zero() -> None:
    result = _runner().invoke(cli, ["sync", "--help"])
    assert result.exit_code == 0


def test_migrate_help_exits_zero() -> None:
    result = _runner().invoke(cli, ["migrate", "--help"])
    assert result.exit_code == 0


def test_status_help_exits_zero() -> None:
    result = _runner().invoke(cli, ["status", "--help"])
    assert result.exit_code == 0


# ── load command ───────────────────────────────────────────────────────────


@pytest.mark.skipif(
    not LIBRARY_PATH.exists(),
    reason="Library fixture not present",
)
def test_load_real_library_exits_zero() -> None:
    """load with the real library reports valid rows and exits 0."""
    result = _runner().invoke(cli, ["load", str(LIBRARY_PATH)])
    assert result.exit_code == 0, result.output
    assert "Valid:" in result.output
    assert "Defects:" in result.output


@pytest.mark.skipif(
    not LIBRARY_PATH.exists(),
    reason="Library fixture not present",
)
def test_load_all_flag_loads_more_rows() -> None:
    """--all flag loads non-approved rows too; count >= approved count."""
    result_approved = _runner().invoke(cli, ["load", str(LIBRARY_PATH)])
    result_all = _runner().invoke(cli, ["load", "--all", str(LIBRARY_PATH)])
    assert result_approved.exit_code == 0
    assert result_all.exit_code == 0

    def _extract_loaded(output: str) -> int:
        for line in output.splitlines():
            if "Loaded" in line and "raw rows" in line:
                return int(line.split()[1])
        return -1

    approved_count = _extract_loaded(result_approved.output)
    all_count = _extract_loaded(result_all.output)
    assert all_count >= approved_count


def test_load_missing_file_exits_nonzero() -> None:
    """load with a non-existent path is caught by Click before our code runs."""
    result = _runner().invoke(cli, ["load", "/no/such/file.xlsx"])
    assert result.exit_code != 0


def test_load_malformed_xlsx_exits_nonzero(tmp_path: Path) -> None:
    """load with a bad header exits non-zero and prints an error."""
    bad = _malformed_xlsx(tmp_path)
    result = _runner().invoke(cli, ["load", str(bad)])
    assert result.exit_code != 0


# ── validate command ───────────────────────────────────────────────────────


@pytest.mark.skipif(
    not LIBRARY_PATH.exists(),
    reason="Library fixture not present",
)
def test_validate_real_library_exits_zero() -> None:
    """validate with the real library finds no errors and exits 0."""
    result = _runner().invoke(cli, ["validate", "--path", str(LIBRARY_PATH)])
    assert result.exit_code == 0, result.output
    assert "Valid:" in result.output
    assert "Errors:" in result.output


def test_validate_malformed_xlsx_exits_nonzero(tmp_path: Path) -> None:
    """validate with a malformed file exits 1."""
    bad = _malformed_xlsx(tmp_path)
    result = _runner().invoke(cli, ["validate", "--path", str(bad)])
    assert result.exit_code != 0


# ── status command ─────────────────────────────────────────────────────────


def test_status_without_db_exits_nonzero() -> None:
    """status with no reachable database must exit non-zero and complete in <100 ms."""
    import time

    import psycopg

    start = time.monotonic()
    with patch("psycopg.connect", side_effect=psycopg.OperationalError("refused")):
        result = _runner().invoke(cli, ["status"])
    elapsed_ms = (time.monotonic() - start) * 1000

    assert result.exit_code != 0
    assert elapsed_ms < 100, f"status took {elapsed_ms:.0f} ms — expected < 100 ms"


# ── verbose flag ───────────────────────────────────────────────────────────


@pytest.mark.skipif(
    not LIBRARY_PATH.exists(),
    reason="Library fixture not present",
)
def test_verbose_flag_enables_debug_output() -> None:
    """-v flag should not cause a crash; load still works."""
    result = _runner().invoke(cli, ["-v", "load", str(LIBRARY_PATH)])
    assert result.exit_code == 0, result.output
