"""
nuqe_api.settings — Application configuration via pydantic-settings.

All settings are read from environment variables (or .env file). The app
refuses to start if any required variable is missing.
"""

from __future__ import annotations

from enum import StrEnum
from pathlib import Path

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthMode(StrEnum):
    static = "static"
    auth0 = "auth0"


class Settings(BaseSettings):
    """
    Runtime configuration for the Nuqe API service.

    Required:
        NUQE_API_TOKEN      Static Bearer token for API auth (AUTH_MODE=static).
        DATABASE_URL        Postgres connection string.
        AUDIT_SIGNING_KEY   HMAC signing key for audit log entries.

    Optional:
        AUTH_MODE           Auth mode: "static" (default) or "auth0".
        AUTH0_DOMAIN        Auth0 tenant domain (required when AUTH_MODE=auth0).
        AUTH0_AUDIENCE      Auth0 API audience (required when AUTH_MODE=auth0).
        AUTH0_ALGORITHMS    JWT algorithms accepted (default: ["RS256"]).
        AUTH0_JWKS_CACHE_TTL_SECONDS  JWKS cache TTL in seconds (default: 3600).
        LIBRARY_PATH        Legacy path to obligation library xlsx. Only used by
                            POST /library/sync (deprecated). Libraries are now
                            uploaded via POST /library/upload and activated via
                            POST /library/{id}/activate. Will be removed in F3.3.
        LOG_LEVEL           Logging verbosity (default INFO).
        SCHEDULER_ENABLED   Set false in tests (default true).
        SENTRY_DSN          Enables Sentry when set.
    """

    nuqe_api_token: SecretStr
    database_url: str
    migration_database_url: str | None = None  # Falls back to database_url if unset
    library_path: Path | None = None  # F3.2: now optional — libraries stored in DB
    audit_signing_key: SecretStr
    log_level: str = "INFO"
    scheduler_enabled: bool = True
    sentry_dsn: str | None = None

    # F3.3: Auth0 JWT verification
    auth_mode: AuthMode = AuthMode.static
    auth0_domain: str | None = None
    auth0_audience: str | None = None
    auth0_algorithms: list[str] = ["RS256"]
    auth0_jwks_cache_ttl_seconds: int = 3600

    @model_validator(mode="after")
    def _check_auth0_config(self) -> "Settings":
        if self.auth_mode == AuthMode.auth0:
            missing = []
            if self.auth0_domain is None:
                missing.append("AUTH0_DOMAIN")
            if self.auth0_audience is None:
                missing.append("AUTH0_AUDIENCE")
            if missing:
                raise ValueError(
                    f"{', '.join(missing)} are required when AUTH_MODE=auth0"
                )
        return self

    def get_migration_database_url(self) -> str:
        """Return MIGRATION_DATABASE_URL if set, else fall back to DATABASE_URL."""
        return self.migration_database_url or self.database_url

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        case_sensitive=False,
    )


def get_settings() -> Settings:
    """Return a Settings instance (constructed fresh each call for testability)."""
    return Settings()  # type: ignore[call-arg]
