"""
nuqe_api.deps — FastAPI dependencies shared across routers.

- get_engine: returns the Engine stored on app.state at startup.
- verify_bearer_token: validates the Authorization header in constant time.
- current_org_id: reads org_id from the X-Org-Id request header (F3.2).
"""

from __future__ import annotations

import hmac
from typing import Annotated
from uuid import UUID

from fastapi import Header, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from nuqe_engine.engine import Engine

# HTTPBearer auto-parses Authorization: Bearer <token>.
# auto_error=False lets us return a custom 403 instead of FastAPI's default 403.
_bearer_scheme = HTTPBearer(auto_error=False)


def get_engine(request: Request) -> Engine:
    """Retrieve the Engine instance from app.state (set during lifespan startup)."""
    return request.app.state.engine  # type: ignore[no-any-return]


def verify_bearer_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer_scheme),
) -> None:
    """
    Validate the Authorization: Bearer <token> header.

    - Missing header  → 403 AUTH_MISSING
    - Wrong token     → 401 AUTH_INVALID
    - Correct token   → passes silently

    Uses hmac.compare_digest for constant-time comparison to prevent
    timing-oracle attacks.
    """
    expected_token: str = request.app.state.api_token

    if credentials is None:
        raise HTTPException(
            status_code=403,
            detail={"error_code": "AUTH_MISSING", "message": "Authorization header required"},
        )

    provided = credentials.credentials
    if not hmac.compare_digest(provided, expected_token):
        raise HTTPException(
            status_code=401,
            detail={"error_code": "AUTH_INVALID", "message": "Invalid Bearer token"},
        )


def current_org_id(
    x_org_id: Annotated[UUID, Header(alias="X-Org-Id")],
) -> UUID:
    """
    Read the organisation UUID from the X-Org-Id request header.

    This is a temporary dependency for F3.2 while static-Bearer auth is in
    place. The header value is trusted as-is.

    TODO(F3.3): replace with Auth0 JWT org_id extraction — this header-based
    approach MUST be removed once Auth0 is wired. The header can be spoofed
    by any caller who knows the bearer token.

    Raises:
        422: FastAPI raises automatically if the header is missing or not a
             valid UUID.
    """
    return x_org_id
