"""
nuqe_api.routers.events — POST /events

Accepts a TriggerEvent payload, calls engine.process_event(), and returns
a ProcessEventResult. Authentication required.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from nuqe_api.deps import current_org_id, get_engine, verify_bearer_token
from nuqe_api.metrics import events_processed, obligations_fired
from nuqe_engine.engine import ProcessEventResult
from nuqe_engine.trigger import Event

router = APIRouter(tags=["events"], dependencies=[Depends(verify_bearer_token)])


@router.post("/events", response_model=ProcessEventResult)
def post_event(
    body: Event,
    request: Request,
    org_id: Annotated[UUID, Depends(current_org_id)],
) -> JSONResponse:
    """
    Process a compliance event.

    Calls engine.process_event(org_id, event) and returns the full result including
    fired obligations, deadlines, requirements, and audit entries.

    Requires X-Org-Id header (UUID). TODO(F3.3): replace with JWT claim.

    Errors:
        422  Pydantic validation failure on the request body or missing X-Org-Id.
        500  Engine raised an unexpected exception.
    """
    engine = get_engine(request)
    request_id: str = getattr(request.state, "request_id", "unknown")

    try:
        result = engine.process_event(org_id, body)
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={
                "error_code": "ENGINE_ERROR",
                "message": str(exc),
                "request_id": request_id,
            },
            headers={"X-Request-ID": request_id},
        )

    # Increment Prometheus metrics
    events_processed.labels(event_type=str(body.event.value)).inc()
    for fired in result.fired_obligations:
        obl = fired.obligation
        framework = str(obl.framework.value) if obl.framework else "unknown"
        obligations_fired.labels(
            obligation_id=obl.obligation_id,
            framework=framework,
        ).inc()

    return JSONResponse(
        content=result.model_dump(mode="json"),
        headers={"X-Request-ID": request_id},
    )
