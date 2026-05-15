"""
Unit tests for GET /cases/{case_id}/obligations.

Covers:
- Unknown case → 404 CASE_NOT_FOUND
- Known case → 200, list shape
- as_of param forwarded to engine.due_obligations
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

_PILOT_ORG_ID = "a9f318f7-d5be-4235-974e-b3864cc487c1"
AUTH_HEADERS = {
    "Authorization": "Bearer test-secret-token-abc123",
    "X-Org-Id": _PILOT_ORG_ID,
}

_KNOWN_CASE_ID = uuid4()
_UNKNOWN_CASE_ID = uuid4()


def _mock_case_exists(case_id: UUID, exists: bool) -> patch:  # type: ignore[type-arg]
    """Patch _case_exists in cases router."""
    # F3.2: _case_exists now takes (engine, org_id, case_id)
    return patch(
        "nuqe_api.routers.cases._case_exists",
        side_effect=lambda engine, org_id, cid: cid == _KNOWN_CASE_ID if exists else False,
    )


class TestGetObligationsUnknownCase:
    def test_unknown_case_returns_404(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        with patch("nuqe_api.routers.cases._case_exists", return_value=False):
            resp = client.get(
                f"/cases/{_UNKNOWN_CASE_ID}/obligations",
                headers=AUTH_HEADERS,
            )
        assert resp.status_code == 404

    def test_unknown_case_error_code(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        with patch("nuqe_api.routers.cases._case_exists", return_value=False):
            body = client.get(
                f"/cases/{_UNKNOWN_CASE_ID}/obligations",
                headers=AUTH_HEADERS,
            ).json()
        assert body["error_code"] == "CASE_NOT_FOUND"


class TestGetObligationsKnownCase:
    def test_known_case_returns_200(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine.due_obligations.return_value = []
        with patch("nuqe_api.routers.cases._case_exists", return_value=True):
            resp = client.get(
                f"/cases/{_KNOWN_CASE_ID}/obligations",
                headers=AUTH_HEADERS,
            )
        assert resp.status_code == 200

    def test_known_case_returns_list(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine.due_obligations.return_value = []
        with patch("nuqe_api.routers.cases._case_exists", return_value=True):
            body = client.get(
                f"/cases/{_KNOWN_CASE_ID}/obligations",
                headers=AUTH_HEADERS,
            ).json()
        assert isinstance(body, list)

    def test_as_of_param_forwarded(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine.due_obligations.return_value = []
        as_of_str = "2026-01-01T00:00:00+00:00"
        with patch("nuqe_api.routers.cases._case_exists", return_value=True):
            client.get(
                f"/cases/{_KNOWN_CASE_ID}/obligations",
                params={"as_of": as_of_str},
                headers=AUTH_HEADERS,
            )
        stub_engine.due_obligations.assert_called_once()
        _, kwargs = stub_engine.due_obligations.call_args
        assert kwargs.get("as_of") is not None

    def test_as_of_default_is_none_when_not_provided(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine.due_obligations.return_value = []
        with patch("nuqe_api.routers.cases._case_exists", return_value=True):
            client.get(
                f"/cases/{_KNOWN_CASE_ID}/obligations",
                headers=AUTH_HEADERS,
            )
        stub_engine.due_obligations.assert_called_once()
        _, kwargs = stub_engine.due_obligations.call_args
        assert kwargs.get("as_of") is None
