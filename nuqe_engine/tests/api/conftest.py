"""
Shared fixtures for nuqe_api tests.

Unit test strategy:
  - Provide a `client` fixture backed by a stub Engine whose methods are
    pre-configured MagicMocks. No DB connection is opened.
  - All tests in this directory that are NOT marked @pytest.mark.integration
    use this fixture.

Integration test strategy:
  - Provide a `real_client` fixture backed by a real Engine pointing at the
    test Postgres database. Marked @pytest.mark.integration.
"""

from __future__ import annotations

from collections.abc import Generator
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from nuqe_api.app import create_app
from nuqe_api.settings import Settings
from nuqe_engine.engine import Engine, ProcessEventResult

# ── Token used in all unit tests ─────────────────────────────────────────

TEST_TOKEN = "test-secret-token-abc123"
AUTH_HEADERS = {"Authorization": f"Bearer {TEST_TOKEN}"}


# ── Stub Engine ───────────────────────────────────────────────────────────


def _stub_engine() -> MagicMock:
    """Return a MagicMock Engine with sensible defaults for unit tests."""
    engine = MagicMock(spec=Engine)
    engine.health_check.return_value = {
        "db_reachable": True,
        "approved_count": 141,
        "library_synced_at": datetime(2026, 5, 14, 10, 0, 0, tzinfo=UTC),
    }
    engine.process_event.return_value = ProcessEventResult(
        fired_obligations=[],
        deadlines=[],
        requirements=[],
        audit_entries=[],
    )
    engine.due_obligations.return_value = []
    engine.audit_trail.return_value = []
    # Instance attrs accessed directly in cases.py (not part of Engine's class-level spec)
    engine._database_url = "postgresql://test:test@localhost:5432/test"
    engine._signing_key = "test-signing-key"
    return engine


def _stub_settings() -> Settings:
    """Settings object that does not read from the filesystem."""
    return Settings(  # type: ignore[call-arg]
        nuqe_api_token=TEST_TOKEN,
        database_url="postgresql://test:test@localhost:5432/test",
        library_path=Path("/tmp/library.xlsx"),
        audit_signing_key="test-signing-key",
    )


# ── Fixtures ──────────────────────────────────────────────────────────────


@pytest.fixture
def stub_engine() -> MagicMock:
    return _stub_engine()


@pytest.fixture
def client(stub_engine: MagicMock) -> Generator[TestClient, None, None]:
    """
    TestClient backed by a stub Engine.

    The stub engine is patched onto app.state AFTER the lifespan runs so that
    the real engine created by the lifespan is replaced by our mock. This lets
    us test auth, routing, serialisation, and error handling without a DB.
    """
    settings = _stub_settings()
    app = create_app(settings=settings)

    with TestClient(app, raise_server_exceptions=False) as c:
        # Replace the lifespan-created engine with our stub
        app.state.engine = stub_engine
        yield c
