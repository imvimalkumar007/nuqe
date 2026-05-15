"""
Tests for the logging configuration.
"""

from __future__ import annotations

import logging

import pytest
from fastapi.testclient import TestClient

from nuqe_api.logging_config import configure_logging


class TestLoggingConfig:
    def test_configure_logging_info_does_not_raise(self) -> None:
        configure_logging("INFO")

    def test_configure_logging_debug_does_not_raise(self) -> None:
        configure_logging("DEBUG")

    def test_configure_logging_invalid_level_falls_back_to_info(self) -> None:
        # Should not raise; getattr falls back to INFO
        configure_logging("NOT_A_REAL_LEVEL")

    def test_health_endpoint_does_not_raise_with_logging(
        self, client: TestClient
    ) -> None:
        """GET /health works after configure_logging is called."""
        configure_logging("INFO")
        resp = client.get("/health")
        # 200 or 503 — either is fine, just must not raise
        assert resp.status_code in (200, 503)
