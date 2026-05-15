"""
Unit tests for scheduler lifespan integration in the FastAPI app.

Verifies that when scheduler_enabled=False, no scheduler is started.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from nuqe_api.app import create_app
from nuqe_api.settings import Settings
from nuqe_engine.engine import Engine, ProcessEventResult
from pathlib import Path
from datetime import UTC, datetime


def _make_settings(scheduler_enabled: bool) -> Settings:
    return Settings(  # type: ignore[call-arg]
        nuqe_api_token="test-secret-token-abc123",
        database_url="postgresql://test:test@localhost:5432/test",
        library_path=Path("/tmp/library.xlsx"),
        audit_signing_key="test-signing-key",
        scheduler_enabled=scheduler_enabled,
    )


def _make_stub_engine() -> MagicMock:
    engine = MagicMock(spec=Engine)
    engine.health_check.return_value = {
        "db_reachable": True,
        "approved_count": 141,
        "library_synced_at": datetime(2026, 5, 14, tzinfo=UTC),
    }
    engine.process_event.return_value = ProcessEventResult(
        fired_obligations=[], deadlines=[], requirements=[], audit_entries=[]
    )
    engine.due_obligations.return_value = []
    engine.audit_trail.return_value = []
    engine._database_url = "postgresql://test:test@localhost:5432/test"
    engine._signing_key = b"test-signing-key"
    engine._library_path = Path("/tmp/library.xlsx")
    return engine


class TestSchedulerLifespan:
    def test_scheduler_disabled_sets_none_on_state(self) -> None:
        settings = _make_settings(scheduler_enabled=False)
        app = create_app(settings=settings)
        stub = _make_stub_engine()

        with TestClient(app, raise_server_exceptions=False) as client:
            app.state.engine = stub
            assert app.state.scheduler is None

    def test_scheduler_enabled_sets_scheduler_on_state(self) -> None:
        settings = _make_settings(scheduler_enabled=True)
        app = create_app(settings=settings)
        stub = _make_stub_engine()

        with patch("nuqe_api.app.create_scheduler") as mock_create:
            mock_scheduler = MagicMock()
            mock_create.return_value = mock_scheduler
            with TestClient(app, raise_server_exceptions=False) as client:
                app.state.engine = stub
                mock_scheduler.start.assert_called_once()
            # After context exit, shutdown is called
            mock_scheduler.shutdown.assert_called_once_with(wait=False)

    def test_scheduler_disabled_create_scheduler_not_called(self) -> None:
        settings = _make_settings(scheduler_enabled=False)
        app = create_app(settings=settings)
        stub = _make_stub_engine()

        with patch("nuqe_api.app.create_scheduler") as mock_create:
            with TestClient(app, raise_server_exceptions=False) as client:
                app.state.engine = stub
            mock_create.assert_not_called()
