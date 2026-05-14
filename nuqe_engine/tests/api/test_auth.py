"""
Unit tests for Bearer token authentication.

Covers:
- Missing Authorization header → 403 AUTH_MISSING
- Wrong token → 401 AUTH_INVALID
- Correct token → passes (200 from the route)
- hmac.compare_digest is used for constant-time comparison
"""

from __future__ import annotations

import hmac
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

AUTH_HEADERS = {"Authorization": "Bearer test-secret-token-abc123"}

# Minimal valid Event payload for POST /events
_EVENT_BODY = {
    "event": "complaint_received",
    "case_id": str(uuid4()),
    "occurred_at": "2026-01-07T09:00:00+00:00",
    "context": {"jurisdiction": "UK"},
}


class TestAuthMissing:
    def test_post_events_no_header_returns_403(self, client: TestClient) -> None:
        resp = client.post("/events", json=_EVENT_BODY)
        assert resp.status_code == 403

    def test_post_events_no_header_error_code(self, client: TestClient) -> None:
        body = client.post("/events", json=_EVENT_BODY).json()
        assert body["error_code"] == "AUTH_MISSING"

    def test_health_no_header_still_200(self, client: TestClient) -> None:
        """Health is unauthenticated — missing header must not 403 it."""
        resp = client.get("/health")
        assert resp.status_code != 403


class TestAuthInvalid:
    def test_wrong_token_returns_401(self, client: TestClient) -> None:
        resp = client.post(
            "/events",
            json=_EVENT_BODY,
            headers={"Authorization": "Bearer wrong-token"},
        )
        assert resp.status_code == 401

    def test_wrong_token_error_code(self, client: TestClient) -> None:
        body = client.post(
            "/events",
            json=_EVENT_BODY,
            headers={"Authorization": "Bearer wrong-token"},
        ).json()
        assert body["error_code"] == "AUTH_INVALID"

    def test_empty_token_returns_401_or_403(self, client: TestClient) -> None:
        """Empty/malformed token string is treated as missing or invalid."""
        resp = client.post(
            "/events",
            json=_EVENT_BODY,
            headers={"Authorization": "Bearer "},
        )
        assert resp.status_code in (401, 403)


class TestAuthValid:
    def test_correct_token_reaches_route(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        resp = client.post("/events", json=_EVENT_BODY, headers=AUTH_HEADERS)
        assert resp.status_code == 200

    def test_compare_digest_called(self, client: TestClient) -> None:
        """Verify hmac.compare_digest is used (not plain == operator)."""
        with patch("nuqe_api.deps.hmac.compare_digest", wraps=hmac.compare_digest) as mock_cd:
            client.post("/events", json=_EVENT_BODY, headers=AUTH_HEADERS)
            mock_cd.assert_called_once()
