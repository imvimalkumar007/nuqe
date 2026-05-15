"""
nuqe_api.routers.cases — Read endpoints for cases.

GET /cases/{case_id}/obligations  — wraps engine.due_obligations()
GET /cases/{case_id}/audit        — wraps engine.audit_trail()

Authentication required on all endpoints. Case ingestion (POST /cases) is
added in F2.2.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from nuqe_api.deps import get_engine, verify_bearer_token
from nuqe_engine.audit import AuditEventType, get_audit_trail
from nuqe_engine.engine import ObligationStatus

router = APIRouter(
    prefix="/cases",
    tags=["cases"],
    dependencies=[Depends(verify_bearer_token)],
)


def _case_exists(engine: Any, case_id: UUID) -> bool:
    """Check whether a case row exists in the DB."""
    try:
        with engine.connect() as conn:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM nuqe_engine.cases WHERE id = %s",
                    (str(case_id),),
                )
                return cur.fetchone() is not None
    except Exception:
        return False


@router.get("/{case_id}/obligations", response_model=list[ObligationStatus])
def get_obligations(
    case_id: UUID,
    request: Request,
    as_of: datetime | None = Query(default=None, description="Reference time (ISO 8601)"),
) -> JSONResponse:
    """
    Return current obligation statuses for a case.

    Args:
        case_id: The case UUID.
        as_of:   Optional reference timestamp for deadline status evaluation.

    Returns:
        200 list[ObligationStatus]
        404 if case_id is not in the DB.
    """
    engine = get_engine(request)

    if not _case_exists(engine, case_id):
        raise HTTPException(status_code=404, detail={"error_code": "CASE_NOT_FOUND"})

    statuses = engine.due_obligations(case_id, as_of=as_of)
    return JSONResponse(
        content=[s.model_dump(mode="json") for s in statuses],
        headers={"X-Request-ID": getattr(request.state, "request_id", "")},
    )


@router.get("/{case_id}/audit")
def get_audit(
    case_id: UUID,
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    before: datetime | None = Query(default=None),
    event_type: str | None = Query(default=None),
) -> JSONResponse:
    """
    Return the audit trail for a case.

    Args:
        case_id:    The case UUID.
        limit:      Maximum entries to return (default 100, max 500).
        before:     Return entries with created_at < before (for pagination).
        event_type: Filter by audit event type string.

    Returns:
        200 {"entries": [...], "has_more": bool}
        404 if case_id is not in the DB.
    """
    engine = get_engine(request)

    if not _case_exists(engine, case_id):
        raise HTTPException(status_code=404, detail={"error_code": "CASE_NOT_FOUND"})

    # Validate event_type string if provided
    ev_type_enum: AuditEventType | None = None
    if event_type is not None:
        try:
            ev_type_enum = AuditEventType(event_type)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail={
                    "error_code": "INVALID_EVENT_TYPE",
                    "message": f"Unknown event_type: {event_type!r}",
                },
            ) from None

    with engine.connect() as conn:
        conn.autocommit = True
        entries = get_audit_trail(
            conn,
            entity_id=case_id,
            entity_type="fired_obligation",
            event_type=ev_type_enum,
            since=before,
            verify_signatures=True,
            signing_key=engine.signing_key,
        )

    # Apply limit + 1 to detect has_more
    has_more = len(entries) > limit
    page = entries[:limit]

    return JSONResponse(
        content={
            "entries": [e.model_dump(mode="json") for e in page],
            "has_more": has_more,
        },
        headers={"X-Request-ID": getattr(request.state, "request_id", "")},
    )
