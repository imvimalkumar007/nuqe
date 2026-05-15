"""
End-to-end smoke test through the HTTP API.

Requires @pytest.mark.integration — skips gracefully when DB is unavailable.
Exercises the full pipeline: create case → obligations → audit → metrics.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from nuqe_api.app import create_app
from nuqe_engine.engine import Engine


@pytest.mark.integration
def test_full_pipeline(real_engine: Engine, integration_settings: Any) -> None:
    """
    Full HTTP pipeline smoke test:
    1. POST /cases → 201 with case_id
    2. GET /cases/{id}/obligations → 200, UK-DISP-001 present
    3. GET /cases/{id}/audit → 200, case_opened + obligation_fired + valid signatures
    4. GET /metrics → 200, nuqe_events_processed_total present
    """
    app = create_app(settings=integration_settings)
    with TestClient(app, raise_server_exceptions=False) as client:
        app.state.engine = real_engine
        headers = {
            "Authorization": f"Bearer {integration_settings.nuqe_api_token.get_secret_value()}"
        }

        # 1. Create case
        resp = client.post(
            "/cases/",
            json={
                "type": "complaint",
                "opening_event": {
                    "event": "complaint_received",
                    "occurred_at": datetime.now(UTC).isoformat(),
                    "context": {"jurisdiction": "UK"},
                },
            },
            headers=headers,
        )
        assert resp.status_code == 201, f"POST /cases/ failed: {resp.text}"
        case_id = resp.json()["case_id"]

        # 2. Check obligations
        resp = client.get(f"/cases/{case_id}/obligations", headers=headers)
        assert resp.status_code == 200, f"GET obligations failed: {resp.text}"
        obligs = resp.json()
        obl_ids = [o["obligation"]["obligation_id"] for o in obligs]
        assert "UK-DISP-001" in obl_ids, f"UK-DISP-001 not found in: {obl_ids}"

        # 3. Check audit trail
        resp = client.get(f"/cases/{case_id}/audit", headers=headers)
        assert resp.status_code == 200, f"GET audit failed: {resp.text}"
        body = resp.json()
        event_types = {e["event_type"] for e in body["entries"]}
        assert "case_opened" in event_types, f"case_opened missing from: {event_types}"
        assert "obligation_fired" in event_types, f"obligation_fired missing from: {event_types}"
        assert all(
            e["signature_valid"] for e in body["entries"]
        ), "Some audit entries have invalid signatures"

        # 4. Check metrics endpoint
        resp = client.get("/metrics")
        assert resp.status_code == 200, f"GET /metrics failed: {resp.text}"
        assert b"nuqe_engine_health" in resp.content or b"nuqe_events_processed" in resp.content


@pytest.mark.integration
def test_duplicate_external_ref_returns_409(real_engine: Engine, integration_settings: Any) -> None:
    """Duplicate external_ref returns 409 on the second request."""
    from uuid import uuid4

    app = create_app(settings=integration_settings)
    ext_ref = f"SMOKE-{uuid4()}"
    body = {
        "type": "complaint",
        "external_ref": ext_ref,
        "opening_event": {
            "event": "complaint_received",
            "occurred_at": datetime.now(UTC).isoformat(),
            "context": {},
        },
    }

    with TestClient(app, raise_server_exceptions=False) as client:
        app.state.engine = real_engine
        headers = {
            "Authorization": f"Bearer {integration_settings.nuqe_api_token.get_secret_value()}"
        }
        resp1 = client.post("/cases/", json=body, headers=headers)
        assert resp1.status_code == 201
        resp2 = client.post("/cases/", json=body, headers=headers)
        assert resp2.status_code == 409
        assert resp2.json()["error_code"] == "DUPLICATE_EXTERNAL_REF"
