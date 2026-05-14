"""
Unit tests for GET /health.

No auth required. Tests DB-healthy and DB-unreachable paths.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock

from fastapi.testclient import TestClient


class TestHealth:
    def test_returns_200_when_healthy(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_shape_when_healthy(self, client: TestClient, stub_engine: MagicMock) -> None:
        stub_engine.health_check.return_value = {
            "db_reachable": True,
            "approved_count": 141,
            "library_synced_at": datetime(2026, 5, 14, 10, 0, 0, tzinfo=UTC),
        }
        resp = client.get("/health")
        body = resp.json()
        assert body["status"] == "ok"
        assert body["db_reachable"] is True
        assert body["approved_count"] == 141
        assert "2026" in body["library_synced_at"]

    def test_no_auth_header_required(self, client: TestClient) -> None:
        """Health endpoint must not require Authorization header."""
        resp = client.get("/health")
        assert resp.status_code != 403

    def test_returns_503_when_db_unreachable(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine.health_check.return_value = {
            "db_reachable": False,
            "approved_count": None,
            "library_synced_at": None,
        }
        resp = client.get("/health")
        assert resp.status_code == 503

    def test_db_unreachable_body(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine.health_check.return_value = {
            "db_reachable": False,
            "approved_count": None,
            "library_synced_at": None,
        }
        body = client.get("/health").json()
        assert body["status"] == "degraded"
        assert body["db_reachable"] is False

    def test_library_synced_at_none_serialises(
        self, client: TestClient, stub_engine: MagicMock
    ) -> None:
        stub_engine.health_check.return_value = {
            "db_reachable": True,
            "approved_count": 0,
            "library_synced_at": None,
        }
        body = client.get("/health").json()
        assert body["library_synced_at"] is None
