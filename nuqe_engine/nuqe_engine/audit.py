"""
M8: Append-only audit log.

Appends signed entries to the nuqe_engine.audit_log table and provides a
query API for retrieving and verifying them. Every entry is HMAC-SHA256 signed
over a canonical JSON payload so that database-level tampering is detectable.

Signature algorithm:
    canonical = json.dumps({
        "id": str(entry.id),
        "entity_type": entry.entity_type,
        "entity_id": str(entry.entity_id),
        "event_type": entry.event_type,
        "actor": entry.actor,
        "payload": entry.payload,   # the JSONB payload dict
        "created_at": entry.created_at.isoformat(),
    }, sort_keys=True, separators=(",", ":"))
    hmac_signature = hmac.new(key, canonical.encode(), hashlib.sha256).hexdigest()

The signing key is read from the AUDIT_SIGNING_KEY environment variable when
using AuditEventType or from the bytes parameter when calling the functions
directly. A missing key is never silently ignored — callers must supply it.
"""

from __future__ import annotations

import hashlib
import hmac as hmac_module
import json
import logging
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

import psycopg
from pydantic import BaseModel

logger = logging.getLogger(__name__)


# ── Event type vocabulary ─────────────────────────────────────────────────


class AuditEventType(StrEnum):
    """Standard event_type values for audit log entries."""

    OBLIGATION_FIRED = "obligation_fired"
    DEADLINE_SET = "deadline_set"
    DEADLINE_MET = "deadline_met"
    DEADLINE_BREACHED = "deadline_breached"
    EVIDENCE_FOUND = "evidence_found"
    EVIDENCE_MISSING = "evidence_missing"
    REQUIREMENT_REGISTERED = "requirement_registered"
    REQUIREMENT_SATISFIED = "requirement_satisfied"
    LIBRARY_SYNCED = "library_synced"
    CASE_OPENED = "case_opened"
    CASE_CLOSED = "case_closed"


# ── Public model ──────────────────────────────────────────────────────────


class AuditEntry(BaseModel):
    """A single audit log entry, as stored in and retrieved from the database."""

    id: UUID
    entity_type: str
    entity_id: UUID
    event_type: str
    actor: str
    payload: dict[str, Any]
    created_at: datetime
    hmac_signature: str
    signature_valid: bool | None = None  # Populated by verify_signature, not by append


# ── HMAC helpers ──────────────────────────────────────────────────────────


def _canonical_message(
    *,
    entry_id: UUID,
    entity_type: str,
    entity_id: UUID,
    event_type: str,
    actor: str,
    payload: dict[str, Any],
    created_at: datetime,
) -> bytes:
    """Return the canonical UTF-8 bytes over which the HMAC is computed."""
    doc = {
        "id": str(entry_id),
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "event_type": event_type,
        "actor": actor,
        "payload": payload,
        "created_at": created_at.isoformat(),
    }
    return json.dumps(doc, sort_keys=True, separators=(",", ":")).encode()


def _sign(message: bytes, key: bytes) -> str:
    """Return the HMAC-SHA256 hex digest of message under key."""
    return hmac_module.new(key, message, hashlib.sha256).hexdigest()


# ── Public functions ──────────────────────────────────────────────────────


def verify_signature(entry: AuditEntry, key: bytes) -> bool:
    """
    Verify the HMAC signature of an AuditEntry.

    Args:
        entry: An AuditEntry retrieved from the database.
        key: The signing key (same bytes used at append time).

    Returns:
        True if the entry is untampered, False if it has been modified.
    """
    msg = _canonical_message(
        entry_id=entry.id,
        entity_type=entry.entity_type,
        entity_id=entry.entity_id,
        event_type=entry.event_type,
        actor=entry.actor,
        payload=entry.payload,
        created_at=entry.created_at,
    )
    expected = _sign(msg, key)
    return hmac_module.compare_digest(expected, entry.hmac_signature)


def append_audit_entry(
    conn: psycopg.Connection,
    *,
    entity_type: str,
    entity_id: UUID,
    event_type: str,
    actor: str,
    payload: dict[str, Any],
    signing_key: bytes,
) -> AuditEntry:
    """
    Append a signed entry to the audit_log table and return it.

    The database assigns created_at via DEFAULT NOW(); we read it back so the
    returned AuditEntry has the authoritative timestamp for signature purposes.

    Args:
        conn: An open psycopg connection.
        entity_type: Logical type of the entity being audited (e.g. 'case').
        entity_id: UUID of the entity.
        event_type: What happened (use AuditEventType values).
        actor: Who caused the event ('engine', 'agent', 'user:<id>').
        payload: Arbitrary JSON-serialisable dict of event details.
        signing_key: HMAC-SHA256 key bytes.

    Returns:
        AuditEntry with all fields populated, including the server-assigned
        created_at and the computed hmac_signature.
    """
    entry_id = uuid4()

    # We need the DB-assigned created_at before we can sign, so we INSERT with
    # a placeholder signature, read back created_at, compute the real signature,
    # and UPDATE. The UPDATE is to our own just-inserted row, which is not a
    # violation of append-only semantics — the append-only trigger only fires on
    # rows that already existed before this transaction.
    #
    # Alternative: pass created_at from Python. Simpler and avoids the two-step.
    # We use Python time here for determinism in tests.
    from datetime import UTC

    created_at = datetime.now(tz=UTC)

    msg = _canonical_message(
        entry_id=entry_id,
        entity_type=entity_type,
        entity_id=entity_id,
        event_type=event_type,
        actor=actor,
        payload=payload,
        created_at=created_at,
    )
    signature = _sign(msg, signing_key)

    payload_json = json.dumps(payload, sort_keys=True)

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO nuqe_engine.audit_log (
                id, entity_type, entity_id, event_type, actor,
                payload, hmac_signature, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s)
            """,
            (
                str(entry_id),
                entity_type,
                str(entity_id),
                event_type,
                actor,
                payload_json,
                signature,
                created_at,
            ),
        )

    return AuditEntry(
        id=entry_id,
        entity_type=entity_type,
        entity_id=entity_id,
        event_type=event_type,
        actor=actor,
        payload=payload,
        created_at=created_at,
        hmac_signature=signature,
        signature_valid=None,
    )


_SELECT_ENTRIES = """
SELECT
    id, entity_type, entity_id, event_type, actor,
    payload, hmac_signature, created_at
FROM nuqe_engine.audit_log
WHERE 1=1
"""


def get_audit_trail(
    conn: psycopg.Connection,
    *,
    entity_id: UUID | None = None,
    entity_type: str | None = None,
    event_type: str | None = None,
    since: datetime | None = None,
    verify_signatures: bool = True,
    signing_key: bytes | None = None,
) -> list[AuditEntry]:
    """
    Retrieve audit log entries, optionally filtered and signature-verified.

    Args:
        conn: An open psycopg connection.
        entity_id: Filter to entries for this entity UUID.
        entity_type: Filter to entries of this entity type.
        event_type: Filter to entries of this event type.
        since: Filter to entries created after this datetime.
        verify_signatures: If True, populate signature_valid on each entry.
        signing_key: Required when verify_signatures=True.

    Returns:
        List of AuditEntry in chronological order (created_at ASC).

    Raises:
        ValueError: If verify_signatures=True but signing_key is not provided.
    """
    if verify_signatures and signing_key is None:
        raise ValueError("signing_key is required when verify_signatures=True")

    clauses: list[str] = []
    params: list[Any] = []

    if entity_id is not None:
        clauses.append("entity_id = %s")
        params.append(str(entity_id))
    if entity_type is not None:
        clauses.append("entity_type = %s")
        params.append(entity_type)
    if event_type is not None:
        clauses.append("event_type = %s")
        params.append(event_type)
    if since is not None:
        clauses.append("created_at > %s")
        params.append(since)

    where = " AND ".join(clauses)
    sql = _SELECT_ENTRIES
    if where:
        sql += f" AND {where}"
    sql += " ORDER BY created_at ASC"

    with conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    entries: list[AuditEntry] = []
    for row in rows:
        (
            db_id, db_entity_type, db_entity_id, db_event_type, db_actor,
            db_payload, db_hmac, db_created_at,
        ) = row

        entry = AuditEntry(
            id=UUID(str(db_id)),
            entity_type=db_entity_type,
            entity_id=UUID(str(db_entity_id)),
            event_type=db_event_type,
            actor=db_actor,
            payload=db_payload if isinstance(db_payload, dict) else json.loads(db_payload),
            created_at=db_created_at,
            hmac_signature=db_hmac,
            signature_valid=None,
        )

        if verify_signatures and signing_key is not None:
            entry.signature_valid = verify_signature(entry, signing_key)

        entries.append(entry)

    return entries
