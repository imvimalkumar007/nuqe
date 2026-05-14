"""
nuqe_api.routers.health — GET /health liveness probe.

Unauthenticated. Returns 200 when the DB is reachable, 503 otherwise.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    db_reachable: bool
    approved_count: int | None = None
    library_synced_at: datetime | None = None


@router.get("/health", response_model=HealthResponse)
def get_health(request: Request) -> JSONResponse:
    """
    Liveness probe.

    Returns 200 {"status": "ok", "db_reachable": true, ...} when healthy.
    Returns 503 {"status": "degraded", "db_reachable": false} when the DB
    cannot be reached. Never raises — always returns a JSON body.
    """
    engine = request.app.state.engine
    info = engine.health_check()

    db_reachable: bool = bool(info.get("db_reachable", False))
    status = "ok" if db_reachable else "degraded"
    http_status = 200 if db_reachable else 503

    return JSONResponse(
        status_code=http_status,
        content={
            "status": status,
            "db_reachable": db_reachable,
            "approved_count": info.get("approved_count"),
            "library_synced_at": (
                info["library_synced_at"].isoformat()
                if info.get("library_synced_at") is not None
                else None
            ),
        },
    )
