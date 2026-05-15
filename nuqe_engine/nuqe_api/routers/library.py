"""
nuqe_api.routers.library — Library management endpoints.

POST /library/sync             — legacy: load from file path, validate, sync to DB.
GET  /library/status           — current library statistics from the DB.
POST /library/upload           — upload a new xlsx, validate, store in DB (inactive).
POST /library/{id}/activate    — activate a stored library version for this org.

Authentication required on all endpoints.
Org context required via X-Org-Id header on all endpoints (F3.2).
"""

from __future__ import annotations

import hashlib
import logging
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse

from nuqe_api.deps import current_org_id, get_engine, verify_bearer_token
from nuqe_engine.audit import AuditEventType, append_audit_entry
from nuqe_engine.loader import load_library, load_library_from_bytes
from nuqe_engine.validator import validate

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/library",
    tags=["library"],
    dependencies=[Depends(verify_bearer_token)],
)


@router.post("/sync")
def sync_library(
    request: Request,
    org_id: Annotated[UUID, Depends(current_org_id)],
) -> JSONResponse:
    """
    Load, validate, and sync the obligation library to Postgres.

    Legacy endpoint: reads from the file path configured on the engine.
    If the library path is not configured → 422 NO_LIBRARY_PATH.
    If validation finds error-severity defects → 422 with defect list (no sync).
    On success → 200 with insert/unchanged counts.

    Requires X-Org-Id header (UUID). TODO(F3.3): replace with JWT claim.
    """
    engine = get_engine(request)
    request_id: str = getattr(request.state, "request_id", "unknown")

    if engine._library_path is None:
        return JSONResponse(
            status_code=422,
            content={
                "error_code": "NO_LIBRARY_PATH",
                "message": "No library path configured on the engine",
                "request_id": request_id,
            },
        )

    # Validate first; only sync when no errors
    raw = load_library(engine._library_path, approved_only=True)
    result = validate(raw)

    error_defects = [d for d in result.defects if d.severity == "error"]
    if error_defects:
        return JSONResponse(
            status_code=422,
            content={
                "error_code": "LIBRARY_VALIDATION_ERRORS",
                "defects": [d.model_dump() for d in error_defects],
                "request_id": request_id,
            },
        )

    sync_result = engine.refresh_library(org_id, path=engine._library_path)

    # Append audit entry
    signing_key = engine.signing_key
    if isinstance(signing_key, str):
        signing_key = signing_key.encode()

    try:
        with engine.connect(org_id) as conn:
            append_audit_entry(
                conn,
                entity_type="library",
                entity_id=_zero_uuid(),
                event_type=AuditEventType.LIBRARY_SYNCED,
                actor="api",
                payload={
                    "inserted": sync_result.inserted,
                    "unchanged": sync_result.unchanged,
                    "library_path": str(engine._library_path),
                },
                signing_key=signing_key,
            )
    except Exception as exc:
        logger.warning("Could not append LIBRARY_SYNCED audit entry: %s", exc)

    return JSONResponse(
        status_code=200,
        content={
            "inserted": sync_result.inserted,
            "updated": sync_result.updated,
            "unchanged": sync_result.unchanged,
            "skipped_versions": sync_result.skipped_versions,
        },
        headers={"X-Request-ID": request_id},
    )


@router.get("/status")
def library_status(
    request: Request,
    org_id: Annotated[UUID, Depends(current_org_id)],
) -> JSONResponse:
    """
    Return current library statistics for this org from the DB.

    Reads from organisation_libraries (active row) to report version and
    sync status.

    Returns:
        200 {"version": str, "row_count": int, "approved_count": int, "synced_at": str}
        404 NO_LIBRARY if no active library exists for this org.

    Requires X-Org-Id header (UUID). TODO(F3.3): replace with JWT claim.
    """
    engine = get_engine(request)
    request_id: str = getattr(request.state, "request_id", "unknown")

    try:
        with engine.connect(org_id) as conn, conn.cursor() as cur:
            cur.execute(
                """
                    SELECT version, row_count, approved_count, synced_at
                    FROM nuqe_engine.organisation_libraries
                    WHERE org_id = %s AND is_active = TRUE
                    """,
                (str(org_id),),
            )
            row = cur.fetchone()
    except Exception as exc:
        logger.exception("library_status DB query failed: %s", exc)
        raise

    if row is None:
        return JSONResponse(
            status_code=404,
            content={
                "error_code": "NO_LIBRARY",
                "message": "No active library found for this organisation",
                "request_id": request_id,
            },
        )

    lib_version, row_count, approved_count, synced_at = row

    return JSONResponse(
        status_code=200,
        content={
            "version": lib_version,
            "row_count": row_count,
            "approved_count": approved_count,
            "synced_at": synced_at.isoformat() if synced_at else None,
        },
        headers={"X-Request-ID": request_id},
    )


@router.post("/upload")
async def upload_library(
    request: Request,
    org_id: Annotated[UUID, Depends(current_org_id)],
    file: UploadFile = File(...),
    version: str | None = Query(default=None, description="Library version label"),
) -> JSONResponse:
    """
    Upload a new obligation library xlsx for this org.

    Steps:
      1. Read bytes from the uploaded file.
      2. Compute SHA-256 content hash.
      3. Parse and validate in memory — no DB write if validation errors.
      4. If error-severity defects: return 422 with defect list.
      5. INSERT into organisation_libraries with is_active=FALSE.
      6. Return {library_id, version, content_hash, row_count, approved_count, is_active=False}.

    The `version` query param is optional. If omitted, the first 12 chars of
    the SHA-256 hex are used as the version label.

    Requires X-Org-Id header. TODO(F3.3): add org_admin permission check.
    TODO(F3.3): replace X-Org-Id with JWT claim.
    """
    engine = get_engine(request)
    request_id: str = getattr(request.state, "request_id", "unknown")

    xlsx_bytes = await file.read()
    content_hash = hashlib.sha256(xlsx_bytes).hexdigest()
    effective_version = version or content_hash[:12]

    # Parse + validate in memory
    try:
        raw_all = load_library_from_bytes(xlsx_bytes, approved_only=False)
    except Exception as exc:
        return JSONResponse(
            status_code=422,
            content={
                "error_code": "LIBRARY_PARSE_ERROR",
                "message": str(exc),
                "request_id": request_id,
            },
        )

    # Re-parse approved-only for validation
    try:
        raw_approved_rows = load_library_from_bytes(xlsx_bytes, approved_only=True)
    except Exception as exc:
        return JSONResponse(
            status_code=422,
            content={
                "error_code": "LIBRARY_PARSE_ERROR",
                "message": str(exc),
                "request_id": request_id,
            },
        )

    result = validate(raw_approved_rows)
    error_defects = [d for d in result.defects if d.severity == "error"]
    if error_defects:
        return JSONResponse(
            status_code=422,
            content={
                "error_code": "LIBRARY_VALIDATION_ERRORS",
                "defects": [d.model_dump() for d in error_defects],
                "request_id": request_id,
            },
        )

    row_count = len(raw_all)
    approved_count = len(raw_approved_rows)

    # Insert into DB (inactive)
    library_id: UUID | None = None
    try:
        with engine.connect(org_id) as conn, conn.cursor() as cur:
            cur.execute(
                """
                    INSERT INTO nuqe_engine.organisation_libraries
                        (org_id, version, xlsx_bytes, content_hash, row_count,
                         approved_count, uploaded_by, is_active)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE)
                    RETURNING id
                    """,
                (
                    str(org_id),
                    effective_version,
                    xlsx_bytes,
                    content_hash,
                    row_count,
                    approved_count,
                    "api_upload",
                ),
            )
            row_result = cur.fetchone()
            library_id = UUID(str(row_result[0]))
    except Exception as exc:
        logger.exception("library upload DB insert failed: %s", exc)
        return JSONResponse(
            status_code=422,
            content={
                "error_code": "LIBRARY_VERSION_CONFLICT",
                "message": str(exc),
                "request_id": request_id,
            },
        )

    return JSONResponse(
        status_code=200,
        content={
            "library_id": str(library_id),
            "version": effective_version,
            "content_hash": content_hash,
            "row_count": row_count,
            "approved_count": approved_count,
            "is_active": False,
        },
        headers={"X-Request-ID": request_id},
    )


@router.post("/{library_id}/activate")
def activate_library(
    library_id: UUID,
    request: Request,
    org_id: Annotated[UUID, Depends(current_org_id)],
) -> JSONResponse:
    """
    Activate a stored library version for this org.

    Steps in a single transaction:
      1. Set all other active libraries to inactive for this org.
      2. Set this library to active.
      3. If step 2 matches 0 rows: 404 (library not found in this org).
      4. Append LIBRARY_ACTIVATED audit entry.
      5. Return {library_id, activated_at}.

    Requires X-Org-Id header. TODO(F3.3): add org_admin permission check.
    TODO(F3.3): replace X-Org-Id with JWT claim.
    """
    engine = get_engine(request)
    request_id: str = getattr(request.state, "request_id", "unknown")

    signing_key = engine.signing_key
    if isinstance(signing_key, str):
        signing_key = signing_key.encode()

    activated_at = datetime.now(tz=UTC)

    try:
        with engine.connect(org_id) as conn:
            with conn.cursor() as cur:
                # Deactivate all other active rows for this org
                cur.execute(
                    """
                    UPDATE nuqe_engine.organisation_libraries
                    SET is_active = FALSE
                    WHERE org_id = %s AND is_active = TRUE AND id != %s
                    """,
                    (str(org_id), str(library_id)),
                )

                # Activate the target row
                cur.execute(
                    """
                    UPDATE nuqe_engine.organisation_libraries
                    SET is_active = TRUE
                    WHERE id = %s AND org_id = %s
                    """,
                    (str(library_id), str(org_id)),
                )
                rowcount = cur.rowcount

            if rowcount == 0:
                raise HTTPException(
                    status_code=404,
                    detail={
                        "error_code": "LIBRARY_NOT_FOUND",
                        "message": "Library not found for this organisation",
                    },
                )

            # Audit entry within the same transaction
            append_audit_entry(
                conn,
                entity_type="library",
                entity_id=org_id,
                event_type=AuditEventType.LIBRARY_SYNCED,  # reuse closest existing type
                actor="api",
                payload={
                    "library_id": str(library_id),
                    "activated_at": activated_at.isoformat(),
                    "action": "activate",
                },
                signing_key=signing_key,
            )

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("library activate failed: %s", exc)
        raise

    return JSONResponse(
        status_code=200,
        content={
            "library_id": str(library_id),
            "activated_at": activated_at.isoformat(),
        },
        headers={"X-Request-ID": request_id},
    )


def _zero_uuid() -> UUID:
    """Return a stable sentinel UUID for library-scoped audit entries."""
    return UUID("00000000-0000-0000-0000-000000000000")
