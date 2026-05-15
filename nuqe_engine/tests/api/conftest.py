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

F3.2: org_id is now required on all engine methods and connect(). Unit tests
use PILOT_ORG_ID as the X-Org-Id header. The `auth_and_org_headers` fixture
provides both auth + org headers.
"""

from __future__ import annotations

import contextlib
import os
from collections.abc import Generator
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import MagicMock, PropertyMock
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from nuqe_api.app import create_app
from nuqe_api.settings import Settings
from nuqe_engine.engine import Engine, ProcessEventResult

# ── Token and org context used in all unit tests ─────────────────────────

TEST_TOKEN = "test-secret-token-abc123"
AUTH_HEADERS = {"Authorization": f"Bearer {TEST_TOKEN}"}

# Pilot org UUID — matches the development database
PILOT_ORG_ID = UUID(
    os.environ.get("PILOT_ORG_ID", "a9f318f7-d5be-4235-974e-b3864cc487c1")
)
ORG_HEADERS = {"X-Org-Id": str(PILOT_ORG_ID)}
AUTH_AND_ORG_HEADERS = {**AUTH_HEADERS, **ORG_HEADERS}


# ── Stub Engine ───────────────────────────────────────────────────────────


def _stub_engine() -> MagicMock:
    """Return a MagicMock Engine with sensible defaults for unit tests.

    Routers reach the database via `engine.connect(org_id)` and read the
    signing key via `engine.signing_key`. The stub mocks both as
    public surface — no reaching into private attributes.

    F3.2: engine methods now accept org_id as first positional arg.
    MagicMock accepts any args by default, so no special configuration needed
    for the method signatures — but we set return values to match.
    """
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
    # connect(org_id) is a context manager. Tests that need DB interaction
    # patch this with a context manager yielding a configured mock conn.
    engine.connect.return_value.__enter__.return_value = MagicMock()
    engine.connect.return_value.__exit__.return_value = False
    # signing_key is a property on the real Engine; on a MagicMock with
    # spec=Engine, set it as a PropertyMock so attribute access works.
    type(engine).signing_key = PropertyMock(return_value=b"stub-signing-key")
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


@pytest.fixture
def auth_and_org_headers() -> dict[str, str]:
    """
    Return both Authorization and X-Org-Id headers for unit tests.

    F3.2: All authenticated endpoints now also require X-Org-Id.
    Use this fixture instead of AUTH_HEADERS when the endpoint calls
    an engine method that takes org_id.
    """
    return AUTH_AND_ORG_HEADERS


# ── Integration fixtures ──────────────────────────────────────────────────


@pytest.fixture(scope="session")
def real_engine() -> Engine:  # type: ignore[return]
    """Real Engine pointing at the integration test database. Skip if unavailable."""
    import psycopg

    from scripts.migrate import run_migrations

    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine",
    )
    signing_key_str = os.environ.get("AUDIT_SIGNING_KEY", "integration-test-signing-key")
    library_path_str = os.environ.get("LIBRARY_PATH", "")
    library_path = Path(library_path_str) if library_path_str else None

    # Check DB is reachable
    try:
        with psycopg.connect(db_url, autocommit=True, connect_timeout=3) as conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
    except Exception as exc:
        pytest.skip(f"Integration DB not available: {exc}")

    try:
        run_migrations(db_url)
    except Exception as exc:
        pytest.skip(f"Migrations failed: {exc}")

    eng = Engine(
        database_url=db_url,
        library_path=library_path,
        audit_signing_key=signing_key_str.encode(),
    )

    # Sync library if available
    if library_path and library_path.exists():
        with contextlib.suppress(Exception):
            eng.refresh_library(PILOT_ORG_ID, path=library_path)  # Non-fatal

    return eng


@pytest.fixture(scope="session")
def integration_settings(real_engine: Engine) -> Settings:
    """Settings object pointing at the real integration DB."""
    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine",
    )
    signing_key_str = os.environ.get("AUDIT_SIGNING_KEY", "integration-test-signing-key")
    library_path_str = os.environ.get("LIBRARY_PATH", "/tmp/library.xlsx")
    api_token = os.environ.get("NUQE_API_TOKEN", TEST_TOKEN)

    return Settings(  # type: ignore[call-arg]
        nuqe_api_token=api_token,
        database_url=db_url,
        library_path=Path(library_path_str),
        audit_signing_key=signing_key_str,
        scheduler_enabled=False,
    )


@pytest.fixture
def real_client(real_engine: Engine, integration_settings: Settings) -> Generator[TestClient, None, None]:
    """TestClient backed by a real Engine and real DB."""
    app = create_app(settings=integration_settings)
    with TestClient(app, raise_server_exceptions=False) as c:
        app.state.engine = real_engine
        yield c
