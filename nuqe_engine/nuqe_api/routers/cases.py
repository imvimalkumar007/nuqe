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

from nuqe_api.auth.auth0 import AuthenticatedPrincipal
from nuqe_api.deps import current_principal, get_engine
from nuqe_engine.audit import AuditEventType, get_audit_trail
from nuqe_engine.engine import ObligationStatus

router = APIRouter(
    prefix="/cases",
    tags=["cases"],
)


def _case_exists(engine: Any, org_id: UUID, case_id: UUID) -> bool:
    """Check whether a case row exists in the DB under the given org context."""
    try:
        with engine.connect(org_id) as conn, conn.cursor() as cur:
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
    principal: AuthenticatedPrincipal = Depends(current_principal),
    as_of: datetime | None = Query(default=None, description="Reference time (ISO 8601)"),
) -> JSONResponse:
    """
    Return current obligation statuses for a case.

    Args:
        case_id:   The case UUID.
        principal: Authenticated principal (org_id extracted from JWT or static header).
        as_of:     Optional reference timestamp for deadline status evaluation.

    Returns:
        200 list[ObligationStatus]
        404 if case_id is not in the DB.
    """
    engine = get_engine(request)
    org_id = principal.org_id

    if not _case_exists(engine, org_id, case_id):
        raise HTTPException(status_code=404, detail={"error_code": "CASE_NOT_FOUND"})

    statuses = engine.due_obligations(org_id, case_id, as_of=as_of)
    return JSONResponse(
        content=[s.model_dump(mode="json") for s in statuses],
        headers={"X-Request-ID": getattr(request.state, "request_id", "")},
    )


@router.get("/{case_id}/audit")
def get_audit(
    case_id: UUID,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(current_principal),
    limit: int = Query(default=100, ge=1, le=500),
    before: datetime | None = Query(default=None),
    event_type: str | None = Query(default=None),
) -> JSONResponse:
    """
    Return the audit trail for a case.

    Args:
        case_id:    The case UUID.
        principal:  Authenticated principal (org_id extracted from JWT or static header).
        limit:      Maximum entries to return (default 100, max 500).
        before:     Return entries with created_at < before (for pagination).
        event_type: Filter by audit event type string.

    Returns:
        200 {"entries": [...], "has_more": bool}
        404 if case_id is not in the DB.
    """
    engine = get_engine(request)
    org_id = principal.org_id

    if not _case_exists(engine, org_id, case_id):
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

    with engine.connect(org_id) as conn:
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
