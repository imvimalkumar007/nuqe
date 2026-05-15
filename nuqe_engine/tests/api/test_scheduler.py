"""
Tests for the deadline scanner (nuqe_api.scheduler).

Unit tests: mock engine, no DB.
Integration tests: require live Postgres, @pytest.mark.integration.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

import pytest

from nuqe_api.scheduler import scan_deadlines
from nuqe_engine.engine import ObligationStatus


# ── Unit tests — no DB ─────────────────────────────────────────────────────


def _mock_engine(due_obligations_return: list[Any] | None = None) -> MagicMock:
    engine = MagicMock()
    engine._database_url = "postgresql://test:test@localhost:5432/test"
    engine._signing_key = b"test-signing-key"
    engine.due_obligations.return_value = due_obligations_return or []
    return engine


def _mock_psycopg_connect(case_ids: list[UUID]) -> MagicMock:
    """Return a mock psycopg.connect that yields case rows then supports cursor ops."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()

    # Cursor fetchall returns case_id rows
    mock_cursor.fetchall.return_value = [(str(cid),) for cid in case_ids]
    mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
    mock_cursor.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value = mock_cursor
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)

    return mock_conn


def _make_breached_status(obl_id: str = "UK-DISP-001", version: str = "1.0") -> MagicMock:
    """Create a mock ObligationStatus with deadline_status='breached'."""
    obl = MagicMock()
    obl.obligation_id = obl_id
    obl.version = version

    status = MagicMock(spec=ObligationStatus)
    status.deadline_status = "breached"
    status.obligation = obl
    status.due_at = datetime.now(tz=UTC) - timedelta(days=1)
    return status


class TestScanDeadlinesUnit:
    def test_returns_correct_keys(self) -> None:
        engine = _mock_engine()
        mock_conn = _mock_psycopg_connect([])
        with patch("nuqe_api.scheduler.psycopg.connect", return_value=mock_conn):
            result = scan_deadlines(engine)
        assert "cases_scanned" in result
        assert "breaches_found" in result
        assert "breaches_recorded" in result

    def test_no_cases_returns_zeros(self) -> None:
        engine = _mock_engine()
        mock_conn = _mock_psycopg_connect([])
        with patch("nuqe_api.scheduler.psycopg.connect", return_value=mock_conn):
            result = scan_deadlines(engine)
        assert result["cases_scanned"] == 0
        assert result["breaches_found"] == 0
        assert result["breaches_recorded"] == 0

    def test_empty_due_obligations_no_breaches(self) -> None:
        case_id = uuid4()
        engine = _mock_engine(due_obligations_return=[])
        mock_conn = _mock_psycopg_connect([case_id])
        with patch("nuqe_api.scheduler.psycopg.connect", return_value=mock_conn):
            result = scan_deadlines(engine)
        assert result["cases_scanned"] == 1
        assert result["breaches_found"] == 0
        assert result["breaches_recorded"] == 0

    def test_future_deadline_no_breach(self) -> None:
        case_id = uuid4()
        obl = MagicMock()
        obl.obligation_id = "UK-DISP-001"
        obl.version = "1.0"

        status = MagicMock(spec=ObligationStatus)
        status.deadline_status = "pending"  # not breached
        status.obligation = obl
        status.due_at = datetime.now(tz=UTC) + timedelta(days=10)

        engine = _mock_engine(due_obligations_return=[status])
        mock_conn = _mock_psycopg_connect([case_id])
        with patch("nuqe_api.scheduler.psycopg.connect", return_value=mock_conn):
            result = scan_deadlines(engine)
        assert result["breaches_found"] == 0

    def test_breached_deadline_calls_append_audit_and_insert(self) -> None:
        """Unit: a breached deadline writes audit + notification, no prior entry."""
        case_id = uuid4()
        breached_status = _make_breached_status()
        engine = _mock_engine(due_obligations_return=[breached_status])
        mock_conn = _mock_psycopg_connect([case_id])

        with (
            patch("nuqe_api.scheduler.psycopg.connect", return_value=mock_conn),
            patch("nuqe_api.scheduler.get_audit_trail", return_value=[]),
            patch("nuqe_api.scheduler.append_audit_entry") as mock_append,
        ):
            result = scan_deadlines(engine)

        assert result["breaches_found"] == 1
        assert result["breaches_recorded"] == 1
        mock_append.assert_called_once()

    def test_already_recorded_breach_skipped(self) -> None:
        """Unit: if audit trail already has DEADLINE_BREACHED, skip."""
        case_id = uuid4()
        breached_status = _make_breached_status(obl_id="UK-DISP-001", version="1.0")
        engine = _mock_engine(due_obligations_return=[breached_status])
        mock_conn = _mock_psycopg_connect([case_id])

        # Existing audit entry matches this obligation
        existing_entry = MagicMock()
        existing_entry.payload = {"obligation_id": "UK-DISP-001", "version": "1.0"}

        with (
            patch("nuqe_api.scheduler.psycopg.connect", return_value=mock_conn),
            patch("nuqe_api.scheduler.get_audit_trail", return_value=[existing_entry]),
            patch("nuqe_api.scheduler.append_audit_entry") as mock_append,
        ):
            result = scan_deadlines(engine)

        assert result["breaches_found"] == 1
        assert result["breaches_recorded"] == 0
        mock_append.assert_not_called()

    def test_due_obligations_error_continues(self) -> None:
        """Unit: if due_obligations raises, the case is skipped gracefully."""
        case_id = uuid4()
        engine = _mock_engine()
        engine.due_obligations.side_effect = RuntimeError("DB error")
        mock_conn = _mock_psycopg_connect([case_id])

        with patch("nuqe_api.scheduler.psycopg.connect", return_value=mock_conn):
            result = scan_deadlines(engine)
        assert result["cases_scanned"] == 1
        assert result["breaches_recorded"] == 0

    def test_multiple_cases_scanned(self) -> None:
        case_ids = [uuid4(), uuid4(), uuid4()]
        engine = _mock_engine(due_obligations_return=[])
        mock_conn = _mock_psycopg_connect(case_ids)

        with patch("nuqe_api.scheduler.psycopg.connect", return_value=mock_conn):
            result = scan_deadlines(engine)
        assert result["cases_scanned"] == 3

    def test_signing_key_str_converted_to_bytes(self) -> None:
        """Engine with str signing_key should not crash."""
        engine = _mock_engine()
        engine._signing_key = "string-key-not-bytes"
        mock_conn = _mock_psycopg_connect([])

        with patch("nuqe_api.scheduler.psycopg.connect", return_value=mock_conn):
            result = scan_deadlines(engine)
        assert result["cases_scanned"] == 0


# ── Integration tests ──────────────────────────────────────────────────────


@pytest.mark.integration
class TestScanDeadlinesIntegration:
    """
    These tests require a real DB with migrations applied and a synced library.
    The real_engine fixture from conftest.py is used.
    """

    def _insert_case_with_obligation(
        self,
        real_engine: Any,
        *,
        breached: bool,
    ) -> UUID:
        """Insert a case + fired obligation + deadline. Returns case_id."""
        import psycopg as _psycopg

        case_id = uuid4()
        with _psycopg.connect(real_engine._database_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                # Insert case
                cur.execute(
                    "INSERT INTO nuqe_engine.cases (id, type, status) VALUES (%s, 'complaint', 'open')",
                    (str(case_id),),
                )
                # Insert fired_obligation
                cur.execute(
                    """
                    INSERT INTO nuqe_engine.fired_obligations
                        (case_id, obligation_id, obligation_version, trigger_event, status)
                    VALUES (%s, 'UK-DISP-001', '1.0', 'complaint_received', 'open')
                    RETURNING id
                    """,
                    (str(case_id),),
                )
                fo_row = cur.fetchone()
                fo_id = fo_row[0]

                # Insert deadline — past if breached, future otherwise
                if breached:
                    due_at = "NOW() - INTERVAL '1 day'"
                else:
                    due_at = "NOW() + INTERVAL '30 days'"
                cur.execute(
                    f"""
                    INSERT INTO nuqe_engine.deadlines
                        (fired_obligation_id, due_at, anchor_event_at,
                         deadline_value, deadline_unit, deadline_anchor, status)
                    VALUES (%s, {due_at}, NOW(), 56, 'calendar_days', 'case_opened', 'pending')
                    """,
                    (str(fo_id),),
                )
        return case_id

    def test_breached_deadline_creates_audit_and_notification(
        self, real_engine: Any
    ) -> None:
        import psycopg as _psycopg

        case_id = self._insert_case_with_obligation(real_engine, breached=True)
        result = scan_deadlines(real_engine)
        assert result["breaches_recorded"] >= 1

        # Verify audit entry
        with _psycopg.connect(real_engine._database_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM nuqe_engine.audit_log "
                    "WHERE entity_id = %s AND event_type = 'deadline_breached'",
                    (str(case_id),),
                )
                row = cur.fetchone()
        assert row is not None
        assert row[0] >= 1

        # Verify notification row
        with _psycopg.connect(real_engine._database_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM nuqe_engine.notifications WHERE case_id = %s",
                    (str(case_id),),
                )
                row = cur.fetchone()
        assert row is not None
        assert row[0] >= 1

    def test_idempotent_no_duplicate_on_second_run(
        self, real_engine: Any
    ) -> None:
        import psycopg as _psycopg

        case_id = self._insert_case_with_obligation(real_engine, breached=True)
        scan_deadlines(real_engine)  # First run
        scan_deadlines(real_engine)  # Second run — should be idempotent

        with _psycopg.connect(real_engine._database_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM nuqe_engine.audit_log "
                    "WHERE entity_id = %s AND event_type = 'deadline_breached'",
                    (str(case_id),),
                )
                audit_count = cur.fetchone()[0]
                cur.execute(
                    "SELECT COUNT(*) FROM nuqe_engine.notifications WHERE case_id = %s",
                    (str(case_id),),
                )
                notif_count = cur.fetchone()[0]

        assert audit_count == 1, f"Expected 1 audit entry, got {audit_count}"
        assert notif_count == 1, f"Expected 1 notification, got {notif_count}"

    def test_future_deadline_no_breach_recorded(
        self, real_engine: Any
    ) -> None:
        import psycopg as _psycopg

        case_id = self._insert_case_with_obligation(real_engine, breached=False)
        scan_deadlines(real_engine)

        with _psycopg.connect(real_engine._database_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM nuqe_engine.audit_log "
                    "WHERE entity_id = %s AND event_type = 'deadline_breached'",
                    (str(case_id),),
                )
                row = cur.fetchone()
        assert row is not None
        assert row[0] == 0

    def test_closed_case_not_scanned(self, real_engine: Any) -> None:
        import psycopg as _psycopg

        # Create a closed case with a breached deadline
        case_id = self._insert_case_with_obligation(real_engine, breached=True)
        with _psycopg.connect(real_engine._database_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE nuqe_engine.cases SET status = 'closed' WHERE id = %s",
                    (str(case_id),),
                )

        result = scan_deadlines(real_engine)

        # The closed case should not be included in cases_scanned for this case
        with _psycopg.connect(real_engine._database_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM nuqe_engine.audit_log "
                    "WHERE entity_id = %s AND event_type = 'deadline_breached'",
                    (str(case_id),),
                )
                row = cur.fetchone()
        assert row is not None
        assert row[0] == 0, "Closed case should not get a DEADLINE_BREACHED entry"
