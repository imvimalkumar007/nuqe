"""
nuqe_api.sentry — Sentry error tracking initialization.

Call init_sentry(dsn) at application startup. When dsn is None or empty,
this is a no-op so tests and local development work without a Sentry account.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def init_sentry(dsn: str | None) -> None:
    """
    Initialize Sentry SDK if a DSN is provided.

    Filters Authorization headers from outgoing events for security.

    Args:
        dsn: The Sentry DSN string. If None or empty, Sentry is not initialized.
    """
    if not dsn:
        return

    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration

    def before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any]:
        """Strip sensitive headers before sending to Sentry."""
        request = event.get("request", {})
        headers = request.get("headers", {})
        for key in list(headers.keys()):
            if key.lower() in ("authorization",):
                headers[key] = "[FILTERED]"
        return event

    sentry_sdk.init(
        dsn=dsn,
        integrations=[FastApiIntegration()],
        send_default_pii=False,
        before_send=before_send,  # type: ignore[arg-type]  # sentry Event type is unresolvable without full stubs
    )
    logger.info("Sentry initialized")
