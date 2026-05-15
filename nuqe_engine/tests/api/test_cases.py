"""
Unit tests for GET /cases/{case_id}/obligations and GET /cases/{case_id}/audit.

The stub engine returns empty lists by default; tests override per-method return
values as needed. The _case_exists() helper is patched to return True/False
without touching a real DB.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

AUTH_HEADERS = {"Authorization": "Bearer test-secret-token-abc123"}
_CASE_ID = uuid4()


def _patch_case_exists(exists: bool):  # type: ignore[return]
    """Context manager that patches _case_exists to return a fixed value."""
    return patch("nuqe_api.routers.cases._case_exists", return_value=exists)


class TestGetObligations:
    def test_unknown_case_returns_404(self, client: TestClient) -> None:
        with _patch_case_exists(False):
            resp = client.get(f"/cases/{_CASE_ID}/obligations", headers=AUTH_HEADERS)
        assert resp.status_code == 404

    def test_404_body_has_error_code(self, client: TestClient) -> None:
        with _patch_case_exists(False):
            body = client.get(
                f"/cases/{_CASE_ID}/obligations", headers=AUTH_HEADERS
            ).json()
        assert body["error_code"] == "CASE_NOT_FOUND"

    def test_known_case_returns_200(self, client: TestClient) -> None:
        with _patch_case_exists(True):
            resp = client.get(f"/cases/{_CASE_ID}/obligations", headers=AUTH_HEADERS)
        assert resp.status_code == 200

    def test_empty_obligations_returns_empty_list(self, client: TestClient) -> None:
        with _patch_case_exists(True):
            body = client.get(
                f"/cases/{_CASE_ID}/obligations", headers=AUTH_HEADERS
            ).json()
        assert body == []

    def test_calls_due_obligations_with_case_id(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        with _patch_case_exists(True):
            client.get(f"/cases/{_CASE_ID}/obligations", headers=AUTH_HEADERS)
        stub_engine.due_obligations.assert_called_once()
        call_kwargs = stub_engine.due_obligations.call_args
        assert call_kwargs[0][0] == _CASE_ID

    def test_as_of_param_forwarded(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        with _patch_case_exists(True):
            client.get(
                f"/cases/{_CASE_ID}/obligations?as_of=2026-03-01T00:00:00Z",
                headers=AUTH_HEADERS,
            )
        call_kwargs = stub_engine.due_obligations.call_args
        as_of = call_kwargs[1]["as_of"]
        assert as_of is not None
        assert as_of.year == 2026
        assert as_of.month == 3

    def test_no_auth_returns_403(self, client: TestClient) -> None:
        with _patch_case_exists(True):
            resp = client.get(f"/cases/{_CASE_ID}/obligations")
        assert resp.status_code == 403


class TestGetAudit:
    def test_unknown_case_returns_404(self, client: TestClient) -> None:
        with _patch_case_exists(False):
            resp = client.get(f"/cases/{_CASE_ID}/audit", headers=AUTH_HEADERS)
        assert resp.status_code == 404

    def test_known_case_returns_200(self, client: TestClient) -> None:
        with _patch_case_exists(True), patch(
            "nuqe_api.routers.cases.get_audit_trail", return_value=[]
        ):
            resp = client.get(f"/cases/{_CASE_ID}/audit", headers=AUTH_HEADERS)
        assert resp.status_code == 200

    def test_response_has_entries_and_has_more(self, client: TestClient) -> None:
        with _patch_case_exists(True), patch(
            "nuqe_api.routers.cases.get_audit_trail", return_value=[]
        ):
            body = client.get(f"/cases/{_CASE_ID}/audit", headers=AUTH_HEADERS).json()
        assert "entries" in body
        assert "has_more" in body
        assert body["has_more"] is False

    def test_invalid_event_type_returns_422(self, client: TestClient) -> None:
        with _patch_case_exists(True):
            resp = client.get(
                f"/cases/{_CASE_ID}/audit?event_type=not_a_real_event",
                headers=AUTH_HEADERS,
            )
        assert resp.status_code == 422

    def test_valid_event_type_accepted(self, client: TestClient) -> None:
        with _patch_case_exists(True), patch(
            "nuqe_api.routers.cases.get_audit_trail", return_value=[]
        ):
            resp = client.get(
                f"/cases/{_CASE_ID}/audit?event_type=obligation_fired",
                headers=AUTH_HEADERS,
            )
        assert resp.status_code == 200

    def test_no_auth_returns_403(self, client: TestClient) -> None:
        with _patch_case_exists(True):
            resp = client.get(f"/cases/{_CASE_ID}/audit")
        assert resp.status_code == 403
