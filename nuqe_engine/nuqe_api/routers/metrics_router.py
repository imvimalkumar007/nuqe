"""
nuqe_api.routers.metrics_router — Prometheus metrics exposition endpoint.

GET /metrics returns Prometheus text format.

No authentication is applied here. In production, bind this endpoint to an
internal port or protect it at the network/load-balancer level, as it may
expose operational details. Including it unauthenticated is standard practice
for Prometheus scraping (the scraper runs on the internal network).
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

router = APIRouter(tags=["observability"])


@router.get("/metrics", include_in_schema=False)
def prometheus_metrics() -> Response:
    """
    Prometheus exposition format.

    Unauthenticated. Bind to an internal port or protect at the load balancer
    level in production — do not expose to the public internet.
    """
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
