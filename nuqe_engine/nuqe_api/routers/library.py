"""
nuqe_api.routers.library — Library management endpoints.

POST /library/sync   — load, validate, and sync the obligation library to DB.
GET  /library/status — current library statistics from the DB.

Authentication required on all endpoints.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from nuqe_api.deps import get_engine, verify_bearer_token
from nuqe_engine.audit import AuditEventType, append_audit_entry
from nuqe_engine.loader import load_library
from nuqe_engine.validator import validate

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/library",
    tags=["library"],
    dependencies=[Depends(verify_bearer_token)],
)


@router.post("/sync")
def sync_library(request: Request) -> JSONResponse:
    """
    Load, validate, and sync the obligation library to Postgres.

    If the library path is not configured → 422 NO_LIBRARY_PATH.
    If validation finds error-severity defects → 422 with defect list (no sync).
    On success → 200 with insert/unchanged counts.
    """
    engine = get_engine(request)
    request_id: str = getattr(request.state, "request_id", "unknown")

    if engine._library_path is None:
        return JSONResponse(
            status_code=422,
            content={
                "error_code": "NO_LIBRARY_PATH",
                "message": "No library path configured on the engine",
                "request_id": request_id,
            },
        )

    # Validate first; only sync when no errors
    raw = load_library(engine._library_path, approved_only=True)
    result = validate(raw)

    error_defects = [d for d in result.defects if d.severity == "error"]
    if error_defects:
        return JSONResponse(
            status_code=422,
            content={
                "error_code": "LIBRARY_VALIDATION_ERRORS",
                "defects": [d.model_dump() for d in error_defects],
                "request_id": request_id,
            },
        )

    sync_result = engine.refresh_library()

    # Append audit entry
    signing_key = engine.signing_key
    if isinstance(signing_key, str):
        signing_key = signing_key.encode()

    try:
        with engine.connect() as conn:
            conn.autocommit = True
            append_audit_entry(
                conn,
                entity_type="library",
                entity_id=_zero_uuid(),
                event_type=AuditEventType.LIBRARY_SYNCED,
                actor="api",
                payload={
                    "inserted": sync_result.inserted,
                    "unchanged": sync_result.unchanged,
                    "library_path": str(engine._library_path),
                },
                signing_key=signing_key,
            )
    except Exception as exc:
        logger.warning("Could not append LIBRARY_SYNCED audit entry: %s", exc)

    return JSONResponse(
        status_code=200,
        content={
            "inserted": sync_result.inserted,
            "updated": sync_result.updated,
            "unchanged": sync_result.unchanged,
            "skipped_versions": sync_result.skipped_versions,
        },
        headers={"X-Request-ID": request_id},
    )


@router.get("/status")
def library_status(request: Request) -> JSONResponse:
    """
    Return current library statistics from the DB.

    Returns:
        200 {"version": str, "row_count": int, "approved_count": int, "synced_at": str}
        404 NO_LIBRARY if no approved obligations exist.
    """
    engine = get_engine(request)
    request_id: str = getattr(request.state, "request_id", "unknown")

    try:
        with engine.connect() as conn:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT COUNT(*), MAX(synced_at)
                    FROM nuqe_engine.obligations
                    WHERE review_status = 'approved'
                    """
                )
                row = cur.fetchone()
    except Exception as exc:
        logger.exception("library_status DB query failed: %s", exc)
        raise

    approved_count = int(row[0]) if row and row[0] is not None else 0
    synced_at = row[1] if row else None

    if approved_count == 0:
        return JSONResponse(
            status_code=404,
            content={
                "error_code": "NO_LIBRARY",
                "message": "No approved obligations found in the database",
                "request_id": request_id,
            },
        )

    version = synced_at.strftime("%Y-%m-%d") if synced_at else "unknown"

    return JSONResponse(
        status_code=200,
        content={
            "version": version,
            "row_count": approved_count,
            "approved_count": approved_count,
            "synced_at": synced_at.isoformat() if synced_at else None,
        },
        headers={"X-Request-ID": request_id},
    )


def _zero_uuid() -> UUID:
    """Return a stable sentinel UUID for library-scoped audit entries."""
    return UUID("00000000-0000-0000-0000-000000000000")
