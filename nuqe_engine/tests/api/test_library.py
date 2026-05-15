"""
Unit + integration tests for POST /library/sync and GET /library/status.

Unit tests mock the engine and psycopg — no real DB.
Integration tests require @pytest.mark.integration.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from nuqe_engine.sync import SyncResult
from nuqe_engine.validator import ValidationDefect, ValidationResult

_PILOT_ORG_ID = "a9f318f7-d5be-4235-974e-b3864cc487c1"
AUTH_HEADERS = {
    "Authorization": "Bearer test-secret-token-abc123",
    "X-Org-Id": _PILOT_ORG_ID,
}


# ── Helpers ────────────────────────────────────────────────────────────────


def _clean_sync_result() -> SyncResult:
    return SyncResult(inserted=10, updated=0, unchanged=131, skipped_versions=[])


def _make_validation_result(has_errors: bool = False) -> ValidationResult:
    defects = (
        [
            ValidationDefect(
                row_number=2,
                obligation_id="UK-DISP-001",
                column="deadline_value",
                severity="error",
                message="deadline_value must be positive",
            )
        ]
        if has_errors
        else []
    )
    return ValidationResult(valid=[], defects=defects)


# ── Unit tests — POST /library/sync ───────────────────────────────────────


class TestLibrarySyncNoPath:
    def test_no_library_path_returns_422(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine._library_path = None
        resp = client.post("/library/sync", headers=AUTH_HEADERS)
        assert resp.status_code == 422

    def test_no_library_path_error_code(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine._library_path = None
        body = client.post("/library/sync", headers=AUTH_HEADERS).json()
        assert body["error_code"] == "NO_LIBRARY_PATH"


class TestLibrarySyncValidationErrors:
    def test_validation_errors_returns_422(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine._library_path = Path("/tmp/library.xlsx")
        with patch(
            "nuqe_api.routers.library.load_library", return_value=[]
        ), patch(
            "nuqe_api.routers.library.validate",
            return_value=_make_validation_result(has_errors=True),
        ):
            resp = client.post("/library/sync", headers=AUTH_HEADERS)
        assert resp.status_code == 422

    def test_validation_errors_body_has_defects(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine._library_path = Path("/tmp/library.xlsx")
        with patch(
            "nuqe_api.routers.library.load_library", return_value=[]
        ), patch(
            "nuqe_api.routers.library.validate",
            return_value=_make_validation_result(has_errors=True),
        ):
            resp = client.post("/library/sync", headers=AUTH_HEADERS)
        body = resp.json()
        assert body["error_code"] == "LIBRARY_VALIDATION_ERRORS"
        assert len(body["defects"]) > 0

    def test_validation_errors_does_not_call_refresh(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine._library_path = Path("/tmp/library.xlsx")
        with patch(
            "nuqe_api.routers.library.load_library", return_value=[]
        ), patch(
            "nuqe_api.routers.library.validate",
            return_value=_make_validation_result(has_errors=True),
        ):
            client.post("/library/sync", headers=AUTH_HEADERS)
        stub_engine.refresh_library.assert_not_called()


class TestLibrarySyncSuccess:
    def test_success_returns_200(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine._library_path = Path("/tmp/library.xlsx")
        stub_engine.refresh_library.return_value = _clean_sync_result()
        with patch(
            "nuqe_api.routers.library.load_library", return_value=[]
        ), patch(
            "nuqe_api.routers.library.validate",
            return_value=_make_validation_result(has_errors=False),
        ), patch(
            "nuqe_api.routers.library.append_audit_entry"
        ):
            resp = client.post("/library/sync", headers=AUTH_HEADERS)
        assert resp.status_code == 200

    def test_success_body_has_counts(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine._library_path = Path("/tmp/library.xlsx")
        stub_engine.refresh_library.return_value = _clean_sync_result()
        with patch(
            "nuqe_api.routers.library.load_library", return_value=[]
        ), patch(
            "nuqe_api.routers.library.validate",
            return_value=_make_validation_result(has_errors=False),
        ), patch(
            "nuqe_api.routers.library.append_audit_entry"
        ):
            resp = client.post("/library/sync", headers=AUTH_HEADERS)
        body = resp.json()
        assert body["inserted"] == 10
        assert body["unchanged"] == 131
        assert "skipped_versions" in body


# ── Unit tests — GET /library/status ──────────────────────────────────────


def _make_lib_mock_conn(fetchone_result: tuple) -> MagicMock:
    """Return a mock conn configured to return fetchone_result from cursor."""
    mock_cursor = MagicMock()
    mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
    mock_cursor.__exit__ = MagicMock(return_value=False)
    mock_cursor.fetchone.return_value = fetchone_result
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value = mock_cursor
    return mock_conn


class TestLibraryStatusLoaded:
    def test_status_returns_200(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        synced_at = datetime(2026, 5, 14, 12, 0, 0, tzinfo=UTC)
        # F3.2: query returns (version, row_count, approved_count, synced_at)
        mock_conn = _make_lib_mock_conn(("2026-05-14", 141, 141, synced_at))
        stub_engine.connect.return_value.__enter__.return_value = mock_conn
        stub_engine.connect.return_value.__exit__.return_value = False
        resp = client.get("/library/status", headers=AUTH_HEADERS)
        assert resp.status_code == 200

    def test_status_body_shape(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        synced_at = datetime(2026, 5, 14, 12, 0, 0, tzinfo=UTC)
        # F3.2: query returns (version, row_count, approved_count, synced_at)
        mock_conn = _make_lib_mock_conn(("2026-05-14", 141, 141, synced_at))
        stub_engine.connect.return_value.__enter__.return_value = mock_conn
        stub_engine.connect.return_value.__exit__.return_value = False
        body = client.get("/library/status", headers=AUTH_HEADERS).json()
        assert body["approved_count"] == 141
        assert "synced_at" in body
        assert "version" in body


class TestLibraryStatusEmpty:
    def test_no_library_returns_404(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        # F3.2: None means no active library row found for this org
        mock_conn = _make_lib_mock_conn(None)
        stub_engine.connect.return_value.__enter__.return_value = mock_conn
        stub_engine.connect.return_value.__exit__.return_value = False
        resp = client.get("/library/status", headers=AUTH_HEADERS)
        assert resp.status_code == 404

    def test_no_library_error_code(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        # F3.2: None means no active library row found for this org
        mock_conn = _make_lib_mock_conn(None)
        stub_engine.connect.return_value.__enter__.return_value = mock_conn
        stub_engine.connect.return_value.__exit__.return_value = False
        body = client.get("/library/status", headers=AUTH_HEADERS).json()
        assert body["error_code"] == "NO_LIBRARY"


# ── Integration tests ──────────────────────────────────────────────────────


@pytest.mark.integration
class TestLibraryIntegration:
    def test_sync_with_real_library_returns_200(
        self, real_client: TestClient
    ) -> None:
        resp = real_client.post("/library/sync", headers=AUTH_HEADERS)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "inserted" in body
        assert body["inserted"] >= 0

    def test_sync_appends_audit_entry(self, real_client: TestClient, real_engine: Any) -> None:
        real_client.post("/library/sync", headers=AUTH_HEADERS)

        import psycopg as _psycopg

        with _psycopg.connect(real_engine._database_url, autocommit=True) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM nuqe_engine.audit_log "
                "WHERE event_type = 'library_synced'"
            )
            row = cur.fetchone()
        assert row is not None
        assert row[0] >= 1

    def test_status_after_sync_returns_approved_count(
        self, real_client: TestClient
    ) -> None:
        real_client.post("/library/sync", headers=AUTH_HEADERS)
        resp = real_client.get("/library/status", headers=AUTH_HEADERS)
        assert resp.status_code == 200
        body = resp.json()
        assert body["approved_count"] > 0
        assert body["synced_at"] is not None

    def test_status_before_sync_returns_404_or_200(
        self, real_client: TestClient, real_engine: Any
    ) -> None:
        """
        On a fresh DB (no obligations) status returns 404.
        We truncate obligations then check.
        """
        import psycopg as _psycopg

        with _psycopg.connect(real_engine._database_url, autocommit=True) as conn, conn.cursor() as cur:
            cur.execute("TRUNCATE nuqe_engine.obligations CASCADE")

        resp = real_client.get("/library/status", headers=AUTH_HEADERS)
        assert resp.status_code == 404
        assert resp.json()["error_code"] == "NO_LIBRARY"
