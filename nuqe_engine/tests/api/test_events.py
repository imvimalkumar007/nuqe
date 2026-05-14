"""
Unit tests for POST /events.

Covers:
- Valid payload calls engine.process_event with the parsed Event
- Malformed payload returns 422
- Engine raises → 500 with error_code and request_id
- X-Request-ID header echoed in response
"""

from __future__ import annotations

from unittest.mock import MagicMock
from uuid import uuid4

from fastapi.testclient import TestClient

from nuqe_engine.schema import TriggerEvent
from nuqe_engine.trigger import Event

AUTH_HEADERS = {"Authorization": "Bearer test-secret-token-abc123"}

_CASE_ID = uuid4()
_VALID_BODY = {
    "event": "complaint_received",
    "case_id": str(_CASE_ID),
    "occurred_at": "2026-01-07T09:00:00+00:00",
    "context": {"jurisdiction": "UK"},
}


class TestPostEventsValid:
    def test_returns_200(self, client: TestClient) -> None:
        resp = client.post("/events", json=_VALID_BODY, headers=AUTH_HEADERS)
        assert resp.status_code == 200

    def test_calls_engine_process_event(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        client.post("/events", json=_VALID_BODY, headers=AUTH_HEADERS)
        stub_engine.process_event.assert_called_once()
        call_arg: Event = stub_engine.process_event.call_args[0][0]
        assert call_arg.event == TriggerEvent.COMPLAINT_RECEIVED
        assert call_arg.case_id == _CASE_ID

    def test_response_shape(self, client: TestClient) -> None:
        body = client.post("/events", json=_VALID_BODY, headers=AUTH_HEADERS).json()
        assert "fired_obligations" in body
        assert "deadlines" in body
        assert "requirements" in body
        assert "audit_entries" in body

    def test_x_request_id_present_in_response(self, client: TestClient) -> None:
        resp = client.post("/events", json=_VALID_BODY, headers=AUTH_HEADERS)
        assert "X-Request-ID" in resp.headers

    def test_x_request_id_echoed_if_sent(self, client: TestClient) -> None:
        sent_id = "my-custom-request-id-xyz"
        resp = client.post(
            "/events",
            json=_VALID_BODY,
            headers={**AUTH_HEADERS, "X-Request-ID": sent_id},
        )
        assert resp.headers["X-Request-ID"] == sent_id

    def test_generated_request_id_is_uuid(self, client: TestClient) -> None:
        resp = client.post("/events", json=_VALID_BODY, headers=AUTH_HEADERS)
        rid = resp.headers["X-Request-ID"]
        from uuid import UUID
        UUID(rid)  # raises if not a valid UUID


class TestPostEventsMalformed:
    def test_missing_event_field_returns_422(self, client: TestClient) -> None:
        body = {k: v for k, v in _VALID_BODY.items() if k != "event"}
        resp = client.post("/events", json=body, headers=AUTH_HEADERS)
        assert resp.status_code == 422

    def test_invalid_event_type_returns_422(self, client: TestClient) -> None:
        body = {**_VALID_BODY, "event": "not_a_real_event"}
        resp = client.post("/events", json=body, headers=AUTH_HEADERS)
        assert resp.status_code == 422

    def test_missing_case_id_returns_422(self, client: TestClient) -> None:
        body = {k: v for k, v in _VALID_BODY.items() if k != "case_id"}
        resp = client.post("/events", json=body, headers=AUTH_HEADERS)
        assert resp.status_code == 422


class TestPostEventsEngineError:
    def test_engine_raises_returns_500(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine.process_event.side_effect = RuntimeError("DB connection lost")
        resp = client.post("/events", json=_VALID_BODY, headers=AUTH_HEADERS)
        assert resp.status_code == 500

    def test_engine_error_body_has_error_code(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine.process_event.side_effect = RuntimeError("exploded")
        body = client.post("/events", json=_VALID_BODY, headers=AUTH_HEADERS).json()
        assert "error_code" in body
        assert body["error_code"] == "ENGINE_ERROR"

    def test_engine_error_body_has_request_id(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine.process_event.side_effect = RuntimeError("boom")
        sent_id = "req-err-test"
        resp = client.post(
            "/events",
            json=_VALID_BODY,
            headers={**AUTH_HEADERS, "X-Request-ID": sent_id},
        )
        body = resp.json()
        assert body.get("request_id") == sent_id
