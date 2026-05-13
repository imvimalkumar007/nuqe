"""
M3: Database sync module.

Takes a validated list of ObligationRow and pushes them to the
nuqe_engine.obligations table in Postgres.

Idempotency rules:
  - A row whose (obligation_id, version) does not yet exist is INSERTed.
  - A row whose (obligation_id, version) already exists and is byte-for-byte
    identical is counted as 'unchanged' (no-op).
  - A row whose (obligation_id, version) already exists but has DIFFERENT
    content raises ValueError: versions are immutable once committed.

Run twice with the same input: second run reports all rows 'unchanged'.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import psycopg
from pydantic import BaseModel

from nuqe_engine.schema import ObligationRow

logger = logging.getLogger(__name__)


# ── Public output type ───────────────────────────────────────────────────


class SyncResult(BaseModel):
    inserted: int
    updated: int      # Always 0; versions are immutable. Kept for API symmetry.
    unchanged: int
    skipped_versions: list[str]  # "(obligation_id, version)" pairs already present


# ── Serialisation helpers ─────────────────────────────────────────────────


def _to_jsonb(value: Any) -> str:
    """Serialise a Pydantic model or list/dict to a JSON string for JSONB columns."""
    if isinstance(value, list):
        return json.dumps(
            [
                v.model_dump(mode="json") if hasattr(v, "model_dump") else v
                for v in value
            ]
        )
    if hasattr(value, "model_dump"):
        return json.dumps(value.model_dump(mode="json"))
    return json.dumps(value)


def _row_to_dict(row: ObligationRow) -> dict[str, Any]:
    """Convert an ObligationRow to a flat dict suitable for INSERT/comparison."""
    return {
        "obligation_id": row.obligation_id,
        "version": row.version,
        "jurisdiction": row.jurisdiction.value if hasattr(row.jurisdiction, "value") else row.jurisdiction,
        "regulator": row.regulator.value if hasattr(row.regulator, "value") else row.regulator,
        "framework": row.framework.value if hasattr(row.framework, "value") else row.framework,
        "source_provision_type": row.source_provision_type.value if hasattr(row.source_provision_type, "value") else row.source_provision_type,
        "obligation_name": row.obligation_name,
        "source_document": row.source_document,
        "source_url": row.source_url,
        "product_types": _to_jsonb([
            pt.value if hasattr(pt, "value") else pt for pt in row.product_types
        ]),
        "customer_segments": _to_jsonb([
            cs.value if hasattr(cs, "value") else cs for cs in row.customer_segments
        ]),
        "trigger_condition": _to_jsonb(row.trigger_condition),
        "requirement": _to_jsonb(row.requirement),
        "deadline_value": row.deadline_value,
        "deadline_unit": row.deadline_unit.value if hasattr(row.deadline_unit, "value") else row.deadline_unit,
        "deadline_anchor": row.deadline_anchor.value if hasattr(row.deadline_anchor, "value") else row.deadline_anchor,
        "evidence_required": _to_jsonb(row.evidence_required),
        "breach_consequence": row.breach_consequence.value if hasattr(row.breach_consequence, "value") else row.breach_consequence,
        "exceptions": _to_jsonb(row.exceptions),
        "overlay_of": row.overlay_of,
        "supersedes": row.supersedes,
        "effective_from": row.effective_from,
        "effective_to": row.effective_to,
        "review_status": row.review_status.value if hasattr(row.review_status, "value") else row.review_status,
    }


# ── Comparison columns (excludes created_at / synced_at which are DB-managed) ─


_CONTENT_COLUMNS = [
    "jurisdiction",
    "regulator",
    "framework",
    "source_provision_type",
    "obligation_name",
    "source_document",
    "source_url",
    "product_types",
    "customer_segments",
    "trigger_condition",
    "requirement",
    "deadline_value",
    "deadline_unit",
    "deadline_anchor",
    "evidence_required",
    "breach_consequence",
    "exceptions",
    "overlay_of",
    "supersedes",
    "effective_from",
    "effective_to",
    "review_status",
]


def _fetch_existing(
    conn: psycopg.Connection,
    obligation_ids: list[str],
) -> dict[tuple[str, str], dict[str, Any]]:
    """
    Fetch existing rows for the given obligation_ids.
    Returns a dict keyed by (obligation_id, version).
    """
    if not obligation_ids:
        return {}

    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT obligation_id, version, {", ".join(_CONTENT_COLUMNS)}
            FROM nuqe_engine.obligations
            WHERE obligation_id = ANY(%s)
            """,
            (obligation_ids,),
        )
        rows = cur.fetchall()

    columns = ["obligation_id", "version", *_CONTENT_COLUMNS]
    result: dict[tuple[str, str], dict[str, Any]] = {}
    for db_row in rows:
        row_dict = dict(zip(columns, db_row, strict=True))
        key = (row_dict["obligation_id"], row_dict["version"])
        result[key] = row_dict
    return result


def _content_matches(new: dict[str, Any], existing: dict[str, Any]) -> bool:
    """
    Compare the content columns of an incoming row against what's in the database.

    JSONB columns are stored as parsed objects by psycopg3, so we compare
    their JSON representations for determinism.
    """
    for col in _CONTENT_COLUMNS:
        new_val = new.get(col)
        db_val = existing.get(col)

        # JSONB columns: psycopg3 returns parsed Python objects.
        # The incoming dict has these as JSON strings, so normalise both sides.
        if col in ("product_types", "customer_segments", "trigger_condition",
                   "requirement", "evidence_required", "exceptions"):
            if isinstance(new_val, str):
                new_val = json.loads(new_val)
            if isinstance(db_val, str):
                db_val = json.loads(db_val)

        if new_val != db_val:
            return False
    return True


# ── Main entry point ─────────────────────────────────────────────────────


def sync_to_database(
    rows: list[ObligationRow],
    conn: psycopg.Connection,
) -> SyncResult:
    """
    Sync a list of validated ObligationRow to the nuqe_engine.obligations table.

    Args:
        rows: Validated obligations from validate().
        conn: An open psycopg connection. The caller controls transaction scope.

    Returns:
        SyncResult summarising what happened.

    Raises:
        ValueError: If an existing (obligation_id, version) row has different
            content from the incoming row. Versions are immutable.
    """
    if not rows:
        return SyncResult(inserted=0, updated=0, unchanged=0, skipped_versions=[])

    row_dicts = [_row_to_dict(r) for r in rows]
    all_ids = list({d["obligation_id"] for d in row_dicts})
    existing = _fetch_existing(conn, all_ids)

    to_insert: list[dict[str, Any]] = []
    unchanged_count = 0
    skipped: list[str] = []

    for row_dict in row_dicts:
        key = (row_dict["obligation_id"], row_dict["version"])
        if key in existing:
            if not _content_matches(row_dict, existing[key]):
                raise ValueError(
                    f"Version conflict: ({key[0]}, {key[1]}) already exists in the "
                    f"database with different content. Versions are immutable. "
                    f"Increment the version to record a change."
                )
            unchanged_count += 1
            skipped.append(f"({key[0]}, {key[1]})")
        else:
            to_insert.append(row_dict)

    if to_insert:
        _bulk_insert(conn, to_insert)

    logger.info(
        "Sync complete: %d inserted, %d unchanged",
        len(to_insert),
        unchanged_count,
    )
    return SyncResult(
        inserted=len(to_insert),
        updated=0,
        unchanged=unchanged_count,
        skipped_versions=skipped,
    )


_INSERT_SQL = """
INSERT INTO nuqe_engine.obligations (
    obligation_id, version, jurisdiction, regulator, framework,
    source_provision_type, obligation_name, source_document, source_url,
    product_types, customer_segments, trigger_condition, requirement,
    deadline_value, deadline_unit, deadline_anchor, evidence_required,
    breach_consequence, exceptions, overlay_of, supersedes,
    effective_from, effective_to, review_status
) VALUES (
    %(obligation_id)s, %(version)s, %(jurisdiction)s, %(regulator)s,
    %(framework)s, %(source_provision_type)s, %(obligation_name)s,
    %(source_document)s, %(source_url)s,
    %(product_types)s::jsonb, %(customer_segments)s::jsonb,
    %(trigger_condition)s::jsonb, %(requirement)s::jsonb,
    %(deadline_value)s, %(deadline_unit)s, %(deadline_anchor)s,
    %(evidence_required)s::jsonb, %(breach_consequence)s,
    %(exceptions)s::jsonb, %(overlay_of)s, %(supersedes)s,
    %(effective_from)s, %(effective_to)s, %(review_status)s
)
"""


def _bulk_insert(
    conn: psycopg.Connection,
    rows: list[dict[str, Any]],
) -> None:
    with conn.cursor() as cur:
        cur.executemany(_INSERT_SQL, rows)
