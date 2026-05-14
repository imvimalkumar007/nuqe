"""
nuqe_api.deps — FastAPI dependencies shared across routers.

- get_engine: returns the Engine stored on app.state at startup.
- verify_bearer_token: validates the Authorization header in constant time.
"""

from __future__ import annotations

import hmac

from fastapi import HTTPException, Request, Security
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
