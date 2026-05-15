"""
nuqe_api.routers.events — POST /events

Accepts a TriggerEvent payload, calls engine.process_event(), and returns
a ProcessEventResult. Authentication required.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from nuqe_api.auth.auth0 import AuthenticatedPrincipal
from nuqe_api.deps import current_principal, get_engine
from nuqe_api.metrics import events_processed, obligations_fired
from nuqe_engine.engine import ProcessEventResult
from nuqe_engine.trigger import Event

router = APIRouter(tags=["events"])


@router.post("/events", response_model=ProcessEventResult)
def post_event(
    body: Event,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(current_principal),
) -> JSONResponse:
    """
    Process a compliance event.

    Calls engine.process_event(org_id, event, actor) and returns the full result
    including fired obligations, deadlines, requirements, and audit entries.

    Errors:
        401  Missing or invalid auth token.
        403  Token missing org_id claim or unknown org (AUTH_MODE=auth0).
        422  Pydantic validation failure on the request body.
        500  Engine raised an unexpected exception.
    """
    engine = get_engine(request)
    request_id: str = getattr(request.state, "request_id", "unknown")

    try:
        result = engine.process_event(principal.org_id, body, principal.sub)
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
