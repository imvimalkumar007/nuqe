"""
nuqe_api.metrics — Prometheus metrics for the Nuqe API.

Import this module once at startup. All metrics are registered in the global
prometheus_client REGISTRY automatically on import.
"""

from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

events_processed = Counter(
    "nuqe_events_processed_total",
    "Events processed",
    ["event_type"],
)

obligations_fired = Counter(
    "nuqe_obligations_fired_total",
    "Obligations fired",
    ["obligation_id", "framework"],
)

deadline_breaches = Counter(
    "nuqe_deadline_breaches_total",
    "Deadline breaches detected",
)

request_duration = Histogram(
    "nuqe_request_duration_seconds",
    "Request duration",
    ["path", "method", "status"],
)

engine_health = Gauge(
    "nuqe_engine_health",
    "Engine health (1=healthy, 0=unhealthy)",
)

scheduler_last_run = Gauge(
    "nuqe_scheduler_last_run_timestamp",
    "Last scheduler run (unix timestamp)",
)
