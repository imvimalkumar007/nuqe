"""
nuqe_api.middleware.request_id — Request ID middleware.

Reads X-Request-ID from the incoming request. If absent, generates a UUID4.
Echoes the value back in the response X-Request-ID header and stores it on
request.state.request_id so it can be referenced in route handlers and logs.
"""

from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Add X-Request-ID to every request/response."""

    async def dispatch(self, request: Request, call_next: object) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        response: Response = await call_next(request)  # type: ignore[operator]
        response.headers["X-Request-ID"] = request_id
        return response
