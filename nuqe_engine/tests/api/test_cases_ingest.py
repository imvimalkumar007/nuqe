"""
Unit + integration tests for POST /cases.

Unit tests mock psycopg.connect and engine.process_event so no real DB is used.
Integration tests require @pytest.mark.integration and a live Postgres instance.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, call, patch
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from nuqe_engine.engine import ProcessEventResult

AUTH_HEADERS = {"Authorization": "Bearer test-secret-token-abc123"}

_VALID_BODY: dict[str, Any] = {
    "type": "complaint",
    "opening_event": {
        "event": "complaint_received",
        "occurred_at": "2026-01-07T09:00:00+00:00",
        "context": {"jurisdiction": "UK"},
    },
}


# ── Helpers ────────────────────────────────────────────────────────────────


def _make_mock_conn(case_id: UUID) -> MagicMock:
    """Return a MagicMock psycopg connection whose cursor returns case_id."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
    mock_cursor.__exit__ = MagicMock(return_value=False)
    mock_cursor.fetchone.return_value = (case_id,)

    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value = mock_cursor
    return mock_conn


def _configure_engine_connect(stub_engine: MagicMock, mock_conn: MagicMock) -> None:
    """Configure stub_engine.connect() to yield mock_conn as a context manager."""
    stub_engine.connect.return_value.__enter__.return_value = mock_conn
    stub_engine.connect.return_value.__exit__.return_value = False


# ── Unit tests (no DB) ─────────────────────────────────────────────────────


class TestCreateCaseValid:
    def test_returns_201(self, client: TestClient, stub_engine: MagicMock) -> None:
        case_id = uuid4()
        mock_conn = _make_mock_conn(case_id)
        _configure_engine_connect(stub_engine, mock_conn)
        with patch("nuqe_api.routers.cases_ingest.append_audit_entry"):
            resp = client.post("/cases/", json=_VALID_BODY, headers=AUTH_HEADERS)
        assert resp.status_code == 201

    def test_response_has_case_id_uuid(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        case_id = uuid4()
        mock_conn = _make_mock_conn(case_id)
        _configure_engine_connect(stub_engine, mock_conn)
        with patch("nuqe_api.routers.cases_ingest.append_audit_entry"):
            resp = client.post("/cases/", json=_VALID_BODY, headers=AUTH_HEADERS)
        body = resp.json()
        assert "case_id" in body
        UUID(body["case_id"])  # raises ValueError if not valid UUID
        assert body["case_id"] == str(case_id)

    def test_response_shape(self, client: TestClient, stub_engine: MagicMock) -> None:
        case_id = uuid4()
        mock_conn = _make_mock_conn(case_id)
        _configure_engine_connect(stub_engine, mock_conn)
        with patch("nuqe_api.routers.cases_ingest.append_audit_entry"):
            resp = client.post("/cases/", json=_VALID_BODY, headers=AUTH_HEADERS)
        body = resp.json()
        for key in ("case_id", "fired_obligations", "deadlines", "requirements", "audit_entries"):
            assert key in body, f"Missing key: {key}"

    def test_engine_process_event_called(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        case_id = uuid4()
        mock_conn = _make_mock_conn(case_id)
        _configure_engine_connect(stub_engine, mock_conn)
        with patch("nuqe_api.routers.cases_ingest.append_audit_entry"):
            client.post("/cases/", json=_VALID_BODY, headers=AUTH_HEADERS)
        stub_engine.process_event.assert_called_once()
        # Called with conn= keyword argument
        _, kwargs = stub_engine.process_event.call_args
        assert "conn" in kwargs
        assert kwargs["conn"] is mock_conn


class TestCreateCaseForbidCaseId:
    def test_opening_event_with_case_id_returns_422(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        body = {
            **_VALID_BODY,
            "opening_event": {
                **_VALID_BODY["opening_event"],
                "case_id": str(uuid4()),
            },
        }
        resp = client.post("/cases/", json=body, headers=AUTH_HEADERS)
        assert resp.status_code == 422

    def test_opening_event_null_case_id_is_allowed(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        """case_id=None is the same as absent — allowed."""
        body = {
            **_VALID_BODY,
            "opening_event": {
                **_VALID_BODY["opening_event"],
                "case_id": None,
            },
        }
        case_id = uuid4()
        mock_conn = _make_mock_conn(case_id)
        _configure_engine_connect(stub_engine, mock_conn)
        with patch("nuqe_api.routers.cases_ingest.append_audit_entry"):
            resp = client.post("/cases/", json=body, headers=AUTH_HEADERS)
        assert resp.status_code == 201


class TestCreateCaseDuplicateRef:
    def test_unique_violation_returns_409(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        import psycopg.errors

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_cursor.execute.side_effect = psycopg.errors.UniqueViolation(
            "duplicate key"
        )
        mock_conn.cursor.return_value = mock_cursor
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        _configure_engine_connect(stub_engine, mock_conn)
        resp = client.post(
            "/cases/",
            json={**_VALID_BODY, "external_ref": "REF-001"},
            headers=AUTH_HEADERS,
        )
        assert resp.status_code == 409

    def test_unique_violation_body_has_error_code(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        import psycopg.errors

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_cursor.execute.side_effect = psycopg.errors.UniqueViolation(
            "duplicate key"
        )
        mock_conn.cursor.return_value = mock_cursor
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        _configure_engine_connect(stub_engine, mock_conn)
        resp = client.post(
            "/cases/",
            json={**_VALID_BODY, "external_ref": "REF-001"},
            headers=AUTH_HEADERS,
        )
        body = resp.json()
        assert body["error_code"] == "DUPLICATE_EXTERNAL_REF"


class TestCreateCaseEngineError:
    def test_engine_error_returns_500(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        case_id = uuid4()
        mock_conn = _make_mock_conn(case_id)
        stub_engine.process_event.side_effect = RuntimeError("engine exploded")
        _configure_engine_connect(stub_engine, mock_conn)
        resp = client.post("/cases/", json=_VALID_BODY, headers=AUTH_HEADERS)
        assert resp.status_code == 500


# ── Integration tests ──────────────────────────────────────────────────────


@pytest.mark.integration
class TestCreateCaseIntegration:
    def test_complaint_received_fires_uk_disp_001(
        self, real_client: TestClient
    ) -> None:
        resp = real_client.post(
            "/cases/",
            json=_VALID_BODY,
            headers=AUTH_HEADERS,
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        obl_ids = [fo["obligation"]["obligation_id"] for fo in body["fired_obligations"]]
        assert "UK-DISP-001" in obl_ids

    def test_duplicate_external_ref_returns_409(
        self, real_client: TestClient
    ) -> None:
        body = {**_VALID_BODY, "external_ref": f"DEDUP-{uuid4()}"}
        resp1 = real_client.post("/cases/", json=body, headers=AUTH_HEADERS)
        assert resp1.status_code == 201
        resp2 = real_client.post("/cases/", json=body, headers=AUTH_HEADERS)
        assert resp2.status_code == 409
        assert resp2.json()["error_code"] == "DUPLICATE_EXTERNAL_REF"

    def test_engine_error_rolls_back_case_row(
        self, real_client: TestClient, real_engine: Any
    ) -> None:
        import psycopg as _psycopg

        ext_ref = f"ROLLBACK-{uuid4()}"
        original_process_event = real_engine.process_event

        def failing_process_event(event: Any, *, conn: Any = None) -> Any:
            raise RuntimeError("simulated engine failure")

        real_engine.process_event = failing_process_event
        try:
            resp = real_client.post(
                "/cases/",
                json={**_VALID_BODY, "external_ref": ext_ref},
                headers=AUTH_HEADERS,
            )
        finally:
            real_engine.process_event = original_process_event

        assert resp.status_code == 500

        # Verify no case row in DB
        with _psycopg.connect(real_engine._database_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM nuqe_engine.cases WHERE external_ref = %s",
                    (ext_ref,),
                )
                row = cur.fetchone()
        assert row is not None
        assert row[0] == 0, "Case row should have been rolled back"

    def test_audit_log_contains_case_opened(
        self, real_client: TestClient
    ) -> None:
        resp = real_client.post("/cases/", json=_VALID_BODY, headers=AUTH_HEADERS)
        assert resp.status_code == 201
        case_id = resp.json()["case_id"]

        audit_resp = real_client.get(
            f"/cases/{case_id}/audit", headers=AUTH_HEADERS
        )
        assert audit_resp.status_code == 200
        event_types = {e["event_type"] for e in audit_resp.json()["entries"]}
        assert "case_opened" in event_types
