"""
nuqe_api.app — FastAPI application factory.

The Engine is instantiated once at startup and stored on app.state so it can
be accessed by all route handlers via the get_engine() dependency.

Startup sequence:
  1. Read Settings from env.
  2. Instantiate Engine.from_env().
  3. Call engine.health_check() — log a warning if unhealthy but allow startup
     so that /health can report the failure.
  4. Start the deadline scanner (if SCHEDULER_ENABLED).

Shutdown:
  - Stop the scheduler.
  - (Engine opens/closes its own connections per method call; nothing to close.)
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from nuqe_api.middleware.request_id import RequestIDMiddleware
from nuqe_api.routers.cases import router as cases_router
from nuqe_api.routers.errors import register_exception_handlers
from nuqe_api.routers.events import router as events_router
from nuqe_api.routers.health import router as health_router
from nuqe_api.settings import Settings
from nuqe_engine.engine import Engine

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup / shutdown logic for the FastAPI app."""
    settings: Settings = app.state.settings

    # Store the raw token string for constant-time comparison in deps.py
    app.state.api_token = settings.nuqe_api_token.get_secret_value()

    # Instantiate the Engine
    engine = Engine(
        database_url=settings.database_url,
        library_path=Path(settings.library_path),
        audit_signing_key=settings.audit_signing_key.get_secret_value().encode(),
    )
    app.state.engine = engine

    # Lightweight health check — log warning if DB unreachable but continue
    health = engine.health_check()
    if not health.get("db_reachable"):
        logger.warning(
            "Engine health check failed at startup — DB may be unreachable. "
            "GET /health will return 503 until the DB is reachable."
        )
    else:
        logger.info(
            "Engine ready: %d approved obligations, synced_at=%s",
            health.get("approved_count", 0),
            health.get("library_synced_at"),
        )

    yield  # Application is now running

    logger.info("nuqe_api shutting down")


def create_app(settings: Settings | None = None) -> FastAPI:
    """
    Construct and configure the FastAPI application.

    Args:
        settings: Pre-built Settings instance. If None, constructed from env.
                  Accepting it explicitly makes the app testable without env vars.
    """
    if settings is None:
        settings = Settings()  # type: ignore[call-arg]

    app = FastAPI(
        title="Nuqe Obligation Engine API",
        version="0.2.0",
        description=(
            "REST API for the Nuqe deterministic compliance obligation engine. "
            "Processes case events against the regulatory obligation library and "
            "produces fired obligations, deadlines, and an append-only audit trail."
        ),
        lifespan=lifespan,
    )

    # Store settings on app.state so lifespan can read them
    app.state.settings = settings

    # Middleware (applied outermost-first in Starlette)
    app.add_middleware(RequestIDMiddleware)

    # Exception handlers
    register_exception_handlers(app)

    # Routers
    app.include_router(health_router)
    app.include_router(events_router)
    app.include_router(cases_router)

    return app
