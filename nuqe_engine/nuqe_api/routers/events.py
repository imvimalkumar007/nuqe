"""
nuqe_api.routers.events — POST /events

Accepts a TriggerEvent payload, calls engine.process_event(), and returns
a ProcessEventResult. Authentication required.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from nuqe_api.deps import get_engine, verify_bearer_token
from nuqe_engine.engine import ProcessEventResult
from nuqe_engine.trigger import Event

router = APIRouter(tags=["events"], dependencies=[Depends(verify_bearer_token)])


@router.post("/events", response_model=ProcessEventResult)
def post_event(body: Event, request: Request) -> JSONResponse:
    """
    Process a compliance event.

    Calls engine.process_event(event) and returns the full result including
    fired obligations, deadlines, requirements, and audit entries.

    Errors:
        422  Pydantic validation failure on the request body.
        500  Engine raised an unexpected exception.
    """
    engine = get_engine(request)
    request_id: str = getattr(request.state, "request_id", "unknown")

    try:
        result = engine.process_event(body)
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

    return JSONResponse(
        content=result.model_dump(mode="json"),
        headers={"X-Request-ID": request_id},
    )
