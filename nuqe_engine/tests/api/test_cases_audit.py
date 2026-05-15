"""
Unit tests for GET /cases/{case_id}/audit.

Covers:
- Unknown case → 404 CASE_NOT_FOUND
- Known case → 200, {entries, has_more} shape
- limit and event_type params validated
- invalid event_type → 422
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

_PILOT_ORG_ID = "a9f318f7-d5be-4235-974e-b3864cc487c1"
AUTH_HEADERS = {
    "Authorization": "Bearer test-secret-token-abc123",
    "X-Org-Id": _PILOT_ORG_ID,
}

_KNOWN_CASE_ID = uuid4()
_UNKNOWN_CASE_ID = uuid4()


class TestGetAuditUnknownCase:
    def test_unknown_case_returns_404(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        with patch("nuqe_api.routers.cases._case_exists", return_value=False):
            resp = client.get(
                f"/cases/{_UNKNOWN_CASE_ID}/audit",
                headers=AUTH_HEADERS,
            )
        assert resp.status_code == 404

    def test_unknown_case_error_code(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        with patch("nuqe_api.routers.cases._case_exists", return_value=False):
            body = client.get(
                f"/cases/{_UNKNOWN_CASE_ID}/audit",
                headers=AUTH_HEADERS,
            ).json()
        assert body["error_code"] == "CASE_NOT_FOUND"


class TestGetAuditKnownCase:
    def test_known_case_returns_200(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        with (
            patch("nuqe_api.routers.cases._case_exists", return_value=True),
            patch(
                "nuqe_api.routers.cases.get_audit_trail",
                return_value=[],
            ),
        ):
            resp = client.get(
                f"/cases/{_KNOWN_CASE_ID}/audit",
                headers=AUTH_HEADERS,
            )
        assert resp.status_code == 200

    def test_known_case_body_shape(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        with (
            patch("nuqe_api.routers.cases._case_exists", return_value=True),
            patch(
                "nuqe_api.routers.cases.get_audit_trail",
                return_value=[],
            ),
        ):
            body = client.get(
                f"/cases/{_KNOWN_CASE_ID}/audit",
                headers=AUTH_HEADERS,
            ).json()
        assert "entries" in body
        assert "has_more" in body
        assert isinstance(body["entries"], list)
        assert isinstance(body["has_more"], bool)

    def test_limit_param_accepted(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        with (
            patch("nuqe_api.routers.cases._case_exists", return_value=True),
            patch("nuqe_api.routers.cases.get_audit_trail", return_value=[]),
        ):
            resp = client.get(
                f"/cases/{_KNOWN_CASE_ID}/audit",
                params={"limit": 10},
                headers=AUTH_HEADERS,
            )
        assert resp.status_code == 200


class TestGetAuditEventTypeValidation:
    def test_invalid_event_type_returns_422(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        with patch("nuqe_api.routers.cases._case_exists", return_value=True):
            resp = client.get(
                f"/cases/{_KNOWN_CASE_ID}/audit",
                params={"event_type": "not_a_real_event_type"},
                headers=AUTH_HEADERS,
            )
        assert resp.status_code == 422

    def test_invalid_event_type_error_code(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        with patch("nuqe_api.routers.cases._case_exists", return_value=True):
            body = client.get(
                f"/cases/{_KNOWN_CASE_ID}/audit",
                params={"event_type": "not_a_real_event"},
                headers=AUTH_HEADERS,
            ).json()
        assert body["error_code"] == "INVALID_EVENT_TYPE"

    def test_valid_event_type_accepted(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        with (
            patch("nuqe_api.routers.cases._case_exists", return_value=True),
            patch("nuqe_api.routers.cases.get_audit_trail", return_value=[]),
        ):
            resp = client.get(
                f"/cases/{_KNOWN_CASE_ID}/audit",
                params={"event_type": "obligation_fired"},
                headers=AUTH_HEADERS,
            )
        assert resp.status_code == 200

    def test_limit_below_1_returns_422(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        with patch("nuqe_api.routers.cases._case_exists", return_value=True):
            resp = client.get(
                f"/cases/{_KNOWN_CASE_ID}/audit",
                params={"limit": 0},
                headers=AUTH_HEADERS,
            )
        assert resp.status_code == 422

    def test_limit_above_500_returns_422(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        with patch("nuqe_api.routers.cases._case_exists", return_value=True):
            resp = client.get(
                f"/cases/{_KNOWN_CASE_ID}/audit",
                params={"limit": 501},
                headers=AUTH_HEADERS,
            )
        assert resp.status_code == 422
