"""
nuqe_api.settings — Application configuration via pydantic-settings.

All settings are read from environment variables (or .env file). The app
refuses to start if any required variable is missing.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Runtime configuration for the Nuqe API service.

    Required:
        NUQE_API_TOKEN      Static Bearer token for API auth.
        DATABASE_URL        Postgres connection string.
        LIBRARY_PATH        Absolute path to obligation library xlsx.
        AUDIT_SIGNING_KEY   HMAC signing key for audit log entries.

    Optional:
        LOG_LEVEL           Logging verbosity (default INFO).
        SCHEDULER_ENABLED   Set false in tests (default true).
        SENTRY_DSN          Enables Sentry when set.
    """

    nuqe_api_token: SecretStr
    database_url: str
    migration_database_url: str | None = None  # Falls back to database_url if unset
    library_path: Path
    audit_signing_key: SecretStr
    log_level: str = "INFO"
    scheduler_enabled: bool = True
    sentry_dsn: str | None = None

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
