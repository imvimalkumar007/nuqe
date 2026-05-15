"""Auth0 JWT verification for nuqe_api.

Two token types:
  - User JWTs: sub is "auth0|..." or "google-oauth2|..."; org_id claim required.
  - M2M JWTs: sub is "<client_id>@clients"; org_id claim required.

Algorithm: RS256 only. JWKS fetched from Auth0 JWKS endpoint, cached with TTL.
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Literal
from uuid import UUID

import jwt  # pyjwt
from jwt import PyJWKClient
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ── Models ─────────────────────────────────────────────────────────────


class AuthenticatedPrincipal(BaseModel):
    sub: str                        # raw JWT sub claim
    org_id_external: str            # Auth0 org id (e.g. "org_abc123") or str(UUID) in static mode
    org_id: UUID                    # nuqe_engine.organisations.id
    token_type: Literal["user", "m2m"]
    scopes: list[str]               # from "scope" claim, space-split


# ── JWKS caching ───────────────────────────────────────────────────────

_jwks_client_lock = threading.Lock()
_jwks_client: PyJWKClient | None = None
_jwks_client_domain: str | None = None


def _get_jwks_client(domain: str, cache_ttl: int = 3600) -> PyJWKClient:
    """Return a cached PyJWKClient for the given domain."""
    global _jwks_client, _jwks_client_domain
    with _jwks_client_lock:
        if _jwks_client is None or _jwks_client_domain != domain:
            jwks_uri = f"https://{domain}/.well-known/jwks.json"
            _jwks_client = PyJWKClient(jwks_uri, cache_keys=True, lifespan=cache_ttl)
            _jwks_client_domain = domain
        return _jwks_client


# ── Verification ────────────────────────────────────────────────────────


def verify_jwt(
    token: str,
    *,
    domain: str,
    audience: str,
    algorithms: list[str],
    cache_ttl: int = 3600,
) -> dict[str, Any]:
    """Verify an Auth0 JWT and return the decoded claims.

    Raises:
        jwt.InvalidTokenError: for any verification failure (expired, bad sig,
            wrong aud/iss, wrong alg). Callers must NOT leak which check failed.
        PyJWKClientError: if JWKS endpoint is unavailable.
    """
    client = _get_jwks_client(domain, cache_ttl)
    signing_key = client.get_signing_key_from_jwt(token)
    claims = jwt.decode(
        token,
        signing_key.key,
        algorithms=algorithms,
        audience=audience,
        issuer=f"https://{domain}/",
        options={"require": ["exp", "iat", "sub", "aud", "iss"]},
    )
    return claims


def classify_token_type(sub: str) -> Literal["user", "m2m"]:
    """Classify a JWT sub as user or M2M."""
    return "m2m" if sub.endswith("@clients") else "user"


def resolve_org(auth0_org_id: str, conn: Any) -> UUID:
    """Look up the nuqe_engine.organisations row for an Auth0 org id.

    Raises:
        KeyError: if no matching row (caller converts to 403).
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM nuqe_engine.organisations WHERE auth0_org_id = %s",
            (auth0_org_id,),
        )
        row = cur.fetchone()
    if row is None:
        raise KeyError(f"Unknown Auth0 org: {auth0_org_id}")
    return UUID(str(row[0]))
