"""
Unit tests for the X-Request-ID middleware.

Covers:
- Client-supplied X-Request-ID is echoed back.
- No client header → UUID4 is generated and returned.
- request_id is available on request.state throughout the request lifecycle.
"""

from __future__ import annotations

from uuid import UUID

from fastapi.testclient import TestClient


class TestRequestIDMiddleware:
    def test_echoes_client_request_id(self, client: TestClient) -> None:
        sent = "client-supplied-id-001"
        resp = client.get("/health", headers={"X-Request-ID": sent})
        assert resp.headers.get("X-Request-ID") == sent

    def test_generates_uuid_when_no_header(self, client: TestClient) -> None:
        resp = client.get("/health")
        rid = resp.headers.get("X-Request-ID")
        assert rid is not None
        UUID(rid)  # raises ValueError if not valid UUID4

    def test_different_requests_get_different_ids(self, client: TestClient) -> None:
        r1 = client.get("/health").headers["X-Request-ID"]
        r2 = client.get("/health").headers["X-Request-ID"]
        assert r1 != r2

    def test_request_id_present_on_health_response(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert "X-Request-ID" in resp.headers

    def test_request_id_present_on_error_response(self, client: TestClient) -> None:
        """Even 403 responses must carry the request ID header."""
        resp = client.post("/events", json={})
        assert "X-Request-ID" in resp.headers

    def test_request_id_in_500_error_body(
        self, client: TestClient, stub_engine  # type: ignore[no-untyped-def]
    ) -> None:
        """When engine raises, the 500 body's request_id matches the header."""
        stub_engine.process_event.side_effect = RuntimeError("boom")
        sent = "trace-id-boom"
        resp = client.post(
            "/events",
            json={
                "event": "complaint_received",
                "case_id": "00000000-0000-0000-0000-000000000001",
                "occurred_at": "2026-01-07T09:00:00+00:00",
                "context": {},
            },
            headers={"Authorization": "Bearer test-secret-token-abc123", "X-Request-ID": sent},
        )
        body = resp.json()
        assert body.get("request_id") == sent
        assert resp.headers["X-Request-ID"] == sent
