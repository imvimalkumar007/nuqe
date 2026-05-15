"""
Tests for the Prometheus metrics endpoint and counter increments.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from prometheus_client import REGISTRY

from nuqe_engine.engine import ProcessEventResult
from nuqe_engine.schema import TriggerEvent

AUTH_HEADERS = {"Authorization": "Bearer test-secret-token-abc123"}

_CASE_ID = uuid4()
_VALID_EVENT_BODY = {
    "event": "complaint_received",
    "case_id": str(_CASE_ID),
    "occurred_at": "2026-01-07T09:00:00+00:00",
    "context": {"jurisdiction": "UK"},
}


def _get_counter_value(name: str, labels: dict[str, str]) -> float:
    """Read a Prometheus counter value from the global registry."""
    metric = REGISTRY._names_to_collectors.get(name)  # type: ignore[attr-defined]
    if metric is None:
        return 0.0
    label_values = tuple(labels[k] for k in sorted(labels))
    for sample in metric.collect()[0].samples:
        if sample.name == name + "_total":
            match = all(
                sample.labels.get(k) == v for k, v in labels.items()
            )
            if match:
                return sample.value
    return 0.0


class TestMetricsEndpoint:
    def test_metrics_endpoint_returns_200(self, client: TestClient) -> None:
        resp = client.get("/metrics")
        assert resp.status_code == 200

    def test_metrics_content_type_is_prometheus(self, client: TestClient) -> None:
        resp = client.get("/metrics")
        assert "text/plain" in resp.headers["content-type"]

    def test_metrics_contains_at_least_one_nuqe_metric(
        self, client: TestClient
    ) -> None:
        resp = client.get("/metrics")
        # At least one of our registered metrics should appear
        assert (
            b"nuqe_events_processed_total" in resp.content
            or b"nuqe_engine_health" in resp.content
            or b"nuqe_request_duration" in resp.content
        )


class TestEventsProcessedCounter:
    def test_events_processed_increments_after_post(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        from nuqe_api.metrics import events_processed

        before = events_processed.labels(event_type="complaint_received")._value.get()  # type: ignore[attr-defined]
        client.post("/events", json=_VALID_EVENT_BODY, headers=AUTH_HEADERS)
        after = events_processed.labels(event_type="complaint_received")._value.get()  # type: ignore[attr-defined]
        assert after > before

    def test_metrics_response_includes_events_processed(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        client.post("/events", json=_VALID_EVENT_BODY, headers=AUTH_HEADERS)
        resp = client.get("/metrics")
        assert b"nuqe_events_processed_total" in resp.content
