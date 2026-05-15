"""
nuqe_api.deps — FastAPI shared dependencies.

Auth modes:
  AUTH_MODE=static (default):
      verify_bearer_token validates NUQE_API_TOKEN (unchanged from F2).
      current_org_id reads org_id from the X-Org-Id request header (unchanged from F3.2).
      current_principal wraps both into an AuthenticatedPrincipal.
  AUTH_MODE=auth0:
      current_principal validates the JWT via Auth0 RS256 verification,
      extracts sub and org_id claim, resolves org_id to a DB UUID.
      verify_bearer_token and current_org_id are no longer used by routers.
"""

from __future__ import annotations

import hmac
import logging
from typing import Annotated
from uuid import UUID

import psycopg
from fastapi import Depends, Header, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from nuqe_api.auth.auth0 import (
    AuthenticatedPrincipal,
    PyJWKClientError,
    classify_token_type,
    jwt,
    resolve_org,
    verify_jwt,
)
from nuqe_api.settings import AuthMode, Settings
from nuqe_engine.engine import Engine

logger = logging.getLogger(__name__)

# HTTPBearer auto-parses Authorization: Bearer <token>.
# auto_error=False lets us return a custom 401 instead of FastAPI's default 403.
_bearer_scheme = HTTPBearer(auto_error=False)


def get_engine(request: Request) -> Engine:
    """Retrieve the Engine instance from app.state (set during lifespan startup)."""
    return request.app.state.engine  # type: ignore[no-any-return]


# Used by _static_principal (AUTH_MODE=static). Remove in F3.5.
def verify_bearer_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer_scheme),
) -> None:
    """
    Validate the Authorization: Bearer <token> header.

    - Missing header  → 401 AUTH_MISSING
    - Wrong token     → 401 AUTH_INVALID
    - Correct token   → passes silently

    Uses hmac.compare_digest for constant-time comparison to prevent
    timing-oracle attacks.
    """
    expected_token: str = request.app.state.api_token

    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail={"error_code": "AUTH_MISSING", "message": "Authorization header required"},
        )

    provided = credentials.credentials
    if not hmac.compare_digest(provided, expected_token):
        raise HTTPException(
            status_code=401,
            detail={"error_code": "AUTH_INVALID", "message": "Invalid Bearer token"},
        )


# Used by _static_principal (AUTH_MODE=static). Remove in F3.5.
def current_org_id(
    x_org_id: Annotated[UUID, Header(alias="X-Org-Id")],
) -> UUID:
    """
    Read the organisation UUID from the X-Org-Id request header.

    This is a temporary dependency for AUTH_MODE=static while static-Bearer auth
    is in place. The header value is trusted as-is within the static auth path.

    Remove in F3.5 (after Auth0 is the only auth mode).

    Raises:
        422: FastAPI raises automatically if the header is missing or not a
             valid UUID.
    """
    return x_org_id


def _static_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None,
    settings: Settings,
) -> AuthenticatedPrincipal:
    """Build a principal from static Bearer token + X-Org-Id header."""
    # Validate Bearer token
    expected_token: str = request.app.state.api_token

    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail={"error_code": "AUTH_MISSING", "message": "Authorization header required"},
        )

    if not hmac.compare_digest(credentials.credentials, expected_token):
        raise HTTPException(
            status_code=401,
            detail={"error_code": "AUTH_INVALID", "message": "Invalid Bearer token"},
        )

    # Read X-Org-Id header — FastAPI raises 422 automatically if missing/invalid
    x_org_id_str = request.headers.get("X-Org-Id")
    if x_org_id_str is None:
        raise HTTPException(
            status_code=422,
            detail={"error_code": "ORG_MISSING", "message": "X-Org-Id header required"},
        )
    try:
        org_uuid = UUID(x_org_id_str)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail={"error_code": "ORG_INVALID", "message": "X-Org-Id must be a valid UUID"},
        ) from None

    return AuthenticatedPrincipal(
        sub="static-token",
        org_id_external=str(org_uuid),
        org_id=org_uuid,
        token_type="user",
        scopes=[],
    )


def _auth0_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None,
    settings: Settings,
    engine: Engine,
) -> AuthenticatedPrincipal:
    """Build a principal by verifying an Auth0 RS256 JWT."""
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail={"error_code": "AUTH_MISSING", "message": "Authorization header required"},
        )

    token = credentials.credentials

    # Verify JWT — do not leak which specific check failed
    try:
        claims = verify_jwt(
            token,
            domain=settings.auth0_domain,  # type: ignore[arg-type]
            audience=settings.auth0_audience,  # type: ignore[arg-type]
            algorithms=settings.auth0_algorithms,
            cache_ttl=settings.auth0_jwks_cache_ttl_seconds,
        )
    except PyJWKClientError as exc:
        logger.warning("JWKS endpoint unavailable: %s", exc)
        raise HTTPException(
            status_code=503,
            detail={
                "error_code": "AUTH_JWKS_UNAVAILABLE",
                "message": "Token verification service temporarily unavailable",
            },
        ) from exc
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail={"error_code": "AUTH_INVALID", "message": "Token verification failed"},
        ) from None

    sub: str = claims["sub"]
    auth0_org_id: str | None = claims.get("org_id")

    if not auth0_org_id:
        raise HTTPException(
            status_code=403,
            detail={"error_code": "AUTH_NO_ORG", "message": "Token missing org_id claim"},
        )

    # Resolve Auth0 org_id to internal UUID via migration DB URL (bypasses RLS)
    migration_db_url = settings.get_migration_database_url()
    try:
        with psycopg.connect(migration_db_url) as conn:
            org_uuid = resolve_org(auth0_org_id, conn)
    except KeyError:
        raise HTTPException(
            status_code=403,
            detail={
                "error_code": "AUTH_UNKNOWN_ORG",
                "message": "Organisation not recognised",
            },
        ) from None

    scope_str: str = claims.get("scope", "")
    scopes = scope_str.split() if scope_str else []

    logger.info("Authenticated principal: sub=%s org_id_external=%s", sub, auth0_org_id)

    return AuthenticatedPrincipal(
        sub=sub,
        org_id_external=auth0_org_id,
        org_id=org_uuid,
        token_type=classify_token_type(sub),
        scopes=scopes,
    )


def current_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer_scheme),
    engine: Engine = Depends(get_engine),
) -> AuthenticatedPrincipal:
    """
    Resolve the authenticated principal for the current request.

    AUTH_MODE=static: validates NUQE_API_TOKEN + X-Org-Id header.
    AUTH_MODE=auth0:  validates Auth0 RS256 JWT, resolves org from claims.
    """
    settings: Settings = request.app.state.settings

    if settings.auth_mode == AuthMode.static:
        return _static_principal(request, credentials, settings)
    else:
        return _auth0_principal(request, credentials, settings, engine)
