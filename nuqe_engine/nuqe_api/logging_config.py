"""
nuqe_api.logging_config — Structured logging configuration via structlog.

Call configure_logging() once at application startup (in the lifespan).
"""

from __future__ import annotations

import logging

import structlog


def configure_logging(log_level: str = "INFO") -> None:
    """
    Configure structlog for structured JSON output (or pretty console at DEBUG).

    Args:
        log_level: Python logging level name (e.g. "INFO", "DEBUG").
    """
    level = getattr(logging, log_level.upper(), logging.INFO)
    logging.basicConfig(level=level, format="%(message)s")

    processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
    ]

    if log_level.upper() == "DEBUG":
        processors.append(structlog.dev.ConsoleRenderer())
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
    )
