"""
nuqe_api.routers.cases_ingest — POST /cases

Case ingestion endpoint. Creates a case row in Postgres, then calls
engine.process_event() within the same transaction so that either both
the case and the fired obligations are committed, or neither is.

Authentication required.
"""

from __future__ import annotations

import logging

import psycopg.errors
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from nuqe_api.deps import get_engine, verify_bearer_token
from nuqe_api.models import CaseCreate
from nuqe_engine.audit import AuditEventType, append_audit_entry
from nuqe_engine.trigger import Event

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/cases",
    tags=["cases"],
    dependencies=[Depends(verify_bearer_token)],
)


@router.post("/", status_code=201)
def create_case(body: CaseCreate, request: Request) -> JSONResponse:
    """
    Create a new case and process its opening event atomically.

    Steps (single transaction, no autocommit):
      1. INSERT INTO nuqe_engine.cases RETURNING id.
      2. Construct the opening Event using the server-assigned case_id.
      3. Call engine.process_event(event, conn=conn) — caller owns the tx.
      4. Append CASE_OPENED audit entry.
      5. Commit.

    Errors:
        409  Duplicate external_ref (UniqueViolation).
        422  Pydantic validation failure.
        500  Any other engine or DB error.
    """
    engine = get_engine(request)
    request_id: str = getattr(request.state, "request_id", "unknown")

    try:
        with engine.connect() as conn:  # autocommit=False (default)  # noqa: SIM117
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO nuqe_engine.cases
                            (external_ref, type, status, customer_id)
                        VALUES (%s, %s, %s, %s)
                        RETURNING id
                        """,
                        (
                            body.external_ref,
                            body.type,
                            body.status,
                            body.customer_id,
                        ),
                    )
                    row = cur.fetchone()

                case_id = row[0]  # type: ignore[index]

                opening = body.opening_event
                event = Event(
                    event=opening.event,
                    case_id=case_id,
                    occurred_at=opening.occurred_at,
                    context=opening.context,
                )

                result = engine.process_event(event, conn=conn)

                signing_key = engine.signing_key
                if isinstance(signing_key, str):
                    signing_key = signing_key.encode()

                append_audit_entry(
                    conn,
                    entity_type="case",
                    entity_id=case_id,
                    event_type=AuditEventType.CASE_OPENED,
                    actor="api",
                    payload={
                        "case_id": str(case_id),
                        "type": body.type,
                        "external_ref": body.external_ref,
                        "customer_id": body.customer_id,
                    },
                    signing_key=signing_key,
                )
                # conn.__exit__ commits on clean exit

    except psycopg.errors.UniqueViolation:
        logger.info("Duplicate external_ref for case creation: %s", body.external_ref)
        return JSONResponse(
            status_code=409,
            content={
                "error_code": "DUPLICATE_EXTERNAL_REF",
                "request_id": request_id,
            },
        )
    except Exception as exc:
        logger.exception("Case creation failed: %s", exc)
        raise

    return JSONResponse(
        status_code=201,
        content={
            "case_id": str(case_id),
            "fired_obligations": result.model_dump(mode="json")["fired_obligations"],
            "deadlines": result.model_dump(mode="json")["deadlines"],
            "requirements": result.model_dump(mode="json")["requirements"],
            "audit_entries": result.model_dump(mode="json")["audit_entries"],
        },
        headers={"X-Request-ID": request_id},
    )
