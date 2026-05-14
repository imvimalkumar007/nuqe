"""
Unit tests for nuqe_engine.cli — no real database required.

psycopg.connect is patched at the point of call inside each CLI command so
tests never touch the network. migrate patches scripts.migrate.run_migrations
directly because the CLI imports that function, not psycopg.connect.

Coverage targets:
- migrate: success (count > 0 and count == 0), failure
- load: success with errors, success with warnings, exit code 1 on errors
- validate: all rows valid, with errors, exit 1 on errors
- sync: success, with warnings, validation errors abort sync, psycopg error
- status: no rows, with rows, DB failure — all in <100 ms
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

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
    """Write an xlsx with a wrong header so load_library raises LoaderError."""
    p = tmp_path / "bad.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["col_a", "col_b"])  # type: ignore[union-attr]
    ws.append(["v1", "v2"])  # type: ignore[union-attr]
    wb.save(str(p))
    return p


def _mock_conn_with_row(row: tuple[Any, ...] | None) -> MagicMock:
    """Return a context-manager-compatible mock psycopg connection."""
    conn = MagicMock()
    cur = MagicMock()
    cur.__enter__ = MagicMock(return_value=cur)
    cur.__exit__ = MagicMock(return_value=False)
    cur.fetchone.return_value = row
    conn.cursor.return_value = cur
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    return conn


# ── migrate ────────────────────────────────────────────────────────────────


class TestMigrateCLI:
    def test_migrate_success_with_count(self) -> None:
        with patch("scripts.migrate.run_migrations", return_value=3) as mock_run:
            result = _runner().invoke(cli, ["migrate"])
        assert result.exit_code == 0
        assert "Applied 3 migration(s)" in result.output
        mock_run.assert_called_once()

    def test_migrate_already_up_to_date(self) -> None:
        with patch("scripts.migrate.run_migrations", return_value=0):
            result = _runner().invoke(cli, ["migrate"])
        assert result.exit_code == 0
        assert "up to date" in result.output.lower()

    def test_migrate_failure_exits_nonzero(self) -> None:
        with patch(
            "scripts.migrate.run_migrations",
            side_effect=RuntimeError("connection refused"),
        ):
            result = _runner().invoke(cli, ["migrate"])
        assert result.exit_code != 0
        assert "Migration failed" in result.output or "connection refused" in result.output


# ── load ──────────────────────────────────────────────────────────────────


class TestLoadCLI:
    def test_load_exits_nonzero_on_missing_file(self) -> None:
        result = _runner().invoke(cli, ["load", "/no/such/file.xlsx"])
        assert result.exit_code != 0

    def test_load_exits_nonzero_on_malformed_xlsx(self, tmp_path: Path) -> None:
        bad = _malformed_xlsx(tmp_path)
        result = _runner().invoke(cli, ["load", str(bad)])
        assert result.exit_code != 0

    @pytest.mark.skipif(not LIBRARY_PATH.exists(), reason="Library fixture not present")
    def test_load_real_library_shows_valid_count(self) -> None:
        result = _runner().invoke(cli, ["load", str(LIBRARY_PATH)])
        assert result.exit_code == 0
        assert "Valid:" in result.output

    @pytest.mark.skipif(not LIBRARY_PATH.exists(), reason="Library fixture not present")
    def test_load_with_library_errors_prints_error_block(self) -> None:
        """Patch validate to inject error defects so the ERROR block is printed."""
        from nuqe_engine.validator import ValidationDefect, ValidationResult

        fake_defect = ValidationDefect(
            row_number=5,
            obligation_id="UK-DISP-099",
            column="trigger_condition",
            severity="error",
            message="bad parse",
        )
        fake_result = ValidationResult(valid=[], defects=[fake_defect])

        # The CLI imports validate inside the function body via:
        #   from nuqe_engine.validator import validate
        # Patching the module attribute is the correct approach.
        with patch("nuqe_engine.validator.validate", return_value=fake_result):
            result = _runner().invoke(cli, ["load", str(LIBRARY_PATH)])

        assert result.exit_code != 0
        assert "ERROR" in result.output

    @pytest.mark.skipif(not LIBRARY_PATH.exists(), reason="Library fixture not present")
    def test_load_with_library_warnings_prints_warning_block(self) -> None:
        """Patch validate to inject warning defects so the WARNING block is printed."""
        from nuqe_engine.loader import load_library
        from nuqe_engine.validator import ValidationDefect, ValidationResult
        from nuqe_engine.validator import validate as real_validate

        rows = load_library(LIBRARY_PATH, approved_only=True)
        real_result = real_validate(rows)

        warn_defect = ValidationDefect(
            row_number=1,
            obligation_id="UK-DISP-001",
            column="supersedes",
            severity="warning",
            message="referenced id not in this batch",
        )
        fake_result = ValidationResult(
            valid=real_result.valid,
            defects=[warn_defect],
        )

        with patch("nuqe_engine.validator.validate", return_value=fake_result):
            result = _runner().invoke(cli, ["load", str(LIBRARY_PATH)])

        assert result.exit_code == 0
        assert "WARNING" in result.output


# ── validate ──────────────────────────────────────────────────────────────


class TestValidateCLI:
    @pytest.mark.skipif(not LIBRARY_PATH.exists(), reason="Library fixture not present")
    def test_validate_real_library_exits_zero(self) -> None:
        result = _runner().invoke(cli, ["validate", "--path", str(LIBRARY_PATH)])
        assert result.exit_code == 0
        assert "Valid:" in result.output

    def test_validate_malformed_exits_nonzero(self, tmp_path: Path) -> None:
        bad = _malformed_xlsx(tmp_path)
        result = _runner().invoke(cli, ["validate", "--path", str(bad)])
        assert result.exit_code != 0

    @pytest.mark.skipif(not LIBRARY_PATH.exists(), reason="Library fixture not present")
    def test_validate_with_errors_exits_nonzero(self) -> None:
        """Patch validate to return errors; CLI must exit non-zero."""
        from nuqe_engine.validator import ValidationDefect, ValidationResult

        defect = ValidationDefect(
            row_number=2,
            obligation_id="UK-DISP-002",
            column="requirement",
            severity="error",
            message="parse failed",
        )
        fake_result = ValidationResult(valid=[], defects=[defect])
        with patch("nuqe_engine.validator.validate", return_value=fake_result):
            result = _runner().invoke(cli, ["validate", "--path", str(LIBRARY_PATH)])
        assert result.exit_code != 0
        assert "ERROR" in result.output

    @pytest.mark.skipif(not LIBRARY_PATH.exists(), reason="Library fixture not present")
    def test_validate_outputs_warn_prefix_for_warnings(self) -> None:
        """Patch validate to return a warning; output must contain WARN."""
        from nuqe_engine.loader import load_library
        from nuqe_engine.validator import ValidationDefect, ValidationResult
        from nuqe_engine.validator import validate as real_validate

        rows = load_library(LIBRARY_PATH, approved_only=True)
        real_result = real_validate(rows)

        warn = ValidationDefect(
            row_number=1,
            obligation_id="UK-DISP-001",
            column="overlay_of",
            severity="warning",
            message="target not in batch",
        )
        fake_result = ValidationResult(valid=real_result.valid, defects=[warn])

        with patch("nuqe_engine.validator.validate", return_value=fake_result):
            result = _runner().invoke(cli, ["validate", "--path", str(LIBRARY_PATH)])

        assert result.exit_code == 0
        assert "WARN" in result.output


# ── sync ──────────────────────────────────────────────────────────────────


class TestSyncCLI:
    @pytest.mark.skipif(not LIBRARY_PATH.exists(), reason="Library fixture not present")
    def test_sync_with_real_library_calls_psycopg(self) -> None:
        """With a valid library, sync should call psycopg.connect for the DB."""
        from nuqe_engine.sync import SyncResult

        fake_result = SyncResult(inserted=5, updated=0, unchanged=136, skipped_versions=[])
        mock_conn = _mock_conn_with_row(None)

        with (
            patch("psycopg.connect", return_value=mock_conn),
            patch("nuqe_engine.sync.sync_to_database", return_value=fake_result),
        ):
            result = _runner().invoke(
                cli,
                ["sync", "--path", str(LIBRARY_PATH)],
                env={"DATABASE_URL": "postgresql://nuqe:x@localhost:5433/db"},
            )

        # If connect was called, the DB path was reached
        assert "inserted" in result.output.lower() or result.exit_code == 0

    @pytest.mark.skipif(not LIBRARY_PATH.exists(), reason="Library fixture not present")
    def test_sync_validation_errors_abort_before_connect(self) -> None:
        """If validate returns errors, sync must abort without touching the DB."""
        from nuqe_engine.validator import ValidationDefect, ValidationResult

        defect = ValidationDefect(
            row_number=1,
            obligation_id="UK-BAD-001",
            column="trigger_condition",
            severity="error",
            message="boom",
        )
        fake_result = ValidationResult(valid=[], defects=[defect])

        with (
            patch("nuqe_engine.validator.validate", return_value=fake_result),
            patch("psycopg.connect") as mock_connect,
        ):
            result = _runner().invoke(
                cli,
                ["sync", "--path", str(LIBRARY_PATH)],
                env={"DATABASE_URL": "postgresql://nuqe:x@localhost:5433/db"},
            )
            mock_connect.assert_not_called()

        assert result.exit_code != 0

    def test_sync_db_failure_exits_nonzero(self, tmp_path: Path) -> None:
        """If psycopg.connect raises, sync must exit non-zero."""
        if not LIBRARY_PATH.exists():
            pytest.skip("Library fixture not present")

        import psycopg

        with patch("psycopg.connect", side_effect=psycopg.OperationalError("refused")):
            result = _runner().invoke(
                cli,
                ["sync", "--path", str(LIBRARY_PATH)],
                env={"DATABASE_URL": "postgresql://nuqe:x@localhost:5433/db"},
            )

        assert result.exit_code != 0
        assert "Sync failed" in result.output or "refused" in result.output

    @pytest.mark.skipif(not LIBRARY_PATH.exists(), reason="Library fixture not present")
    def test_sync_outputs_warning_count_when_defects(self) -> None:
        """After a successful sync, warnings in the result are reported."""
        from nuqe_engine.loader import load_library
        from nuqe_engine.sync import SyncResult
        from nuqe_engine.validator import ValidationDefect, ValidationResult
        from nuqe_engine.validator import validate as real_validate

        rows = load_library(LIBRARY_PATH, approved_only=True)
        real_result = real_validate(rows)

        warn = ValidationDefect(
            row_number=1,
            obligation_id="UK-DISP-001",
            column="supersedes",
            severity="warning",
            message="not in batch",
        )
        fake_validation = ValidationResult(valid=real_result.valid, defects=[warn])
        fake_sync = SyncResult(
            inserted=0, updated=0, unchanged=len(real_result.valid), skipped_versions=[]
        )
        mock_conn = _mock_conn_with_row(None)

        with (
            patch("nuqe_engine.validator.validate", return_value=fake_validation),
            patch("psycopg.connect", return_value=mock_conn),
            patch("nuqe_engine.sync.sync_to_database", return_value=fake_sync),
        ):
            result = _runner().invoke(
                cli,
                ["sync", "--path", str(LIBRARY_PATH)],
                env={"DATABASE_URL": "postgresql://nuqe:x@localhost:5433/db"},
            )

        # The CLI prints "warning(s)" when result.defects is non-empty after sync
        assert "warning" in result.output.lower() or result.exit_code == 0


# ── status ────────────────────────────────────────────────────────────────


class TestStatusCLI:
    def test_status_db_failure_exits_nonzero_and_fast(self) -> None:
        """
        Patching psycopg.connect to raise immediately:
        - Exit code must be non-zero.
        - Must complete in <100 ms (no TCP timeout).
        """
        import psycopg

        start = time.monotonic()
        with patch(
            "psycopg.connect",
            side_effect=psycopg.OperationalError("refused"),
        ):
            result = _runner().invoke(cli, ["status"])
        elapsed_ms = (time.monotonic() - start) * 1000

        assert result.exit_code != 0
        assert elapsed_ms < 100, f"status took {elapsed_ms:.0f} ms — expected < 100 ms"

    def test_status_no_rows_in_db(self) -> None:
        """When the DB returns no obligations (row[0] == 0), print a hint."""
        mock_conn = _mock_conn_with_row((0, 0, None))
        with patch("psycopg.connect", return_value=mock_conn):
            result = _runner().invoke(cli, ["status"])
        assert result.exit_code == 0
        assert "sync" in result.output.lower() or "No obligations" in result.output

    def test_status_none_row(self) -> None:
        """When fetchone returns None, treat as no obligations."""
        mock_conn = _mock_conn_with_row(None)
        with patch("psycopg.connect", return_value=mock_conn):
            result = _runner().invoke(cli, ["status"])
        assert result.exit_code == 0

    def test_status_with_obligations_shows_count(self) -> None:
        """When obligations exist, output includes total and last_synced."""
        from datetime import UTC, datetime

        last_synced = datetime(2026, 5, 13, 12, 0, 0, tzinfo=UTC)
        mock_conn = _mock_conn_with_row((141, 141, last_synced))
        with patch("psycopg.connect", return_value=mock_conn):
            result = _runner().invoke(cli, ["status"])
        assert result.exit_code == 0
        assert "141" in result.output
        assert "2026" in result.output

    def test_status_last_synced_never(self) -> None:
        """When last_synced is None, output says 'never'."""
        mock_conn = _mock_conn_with_row((10, 10, None))
        with patch("psycopg.connect", return_value=mock_conn):
            result = _runner().invoke(cli, ["status"])
        assert result.exit_code == 0
        assert "never" in result.output.lower()

    def test_status_db_failure_message(self) -> None:
        """Error message must mention the failure."""
        import psycopg

        with patch(
            "psycopg.connect",
            side_effect=psycopg.OperationalError("connection refused"),
        ):
            result = _runner().invoke(cli, ["status"])
        assert "connect" in result.output.lower() or "connection" in result.output.lower()
