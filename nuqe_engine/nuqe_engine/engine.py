"""
Engine: Public API surface for the Nuqe obligation engine (F1).

Composes all eight modules (M1-M8) into a single coherent interface. This is
the only class that external callers should import; individual modules are
implementation details.

Usage:
    engine = Engine.from_env()
    engine.refresh_library()

    result = engine.process_event(Event(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        case_id=case_id,
        occurred_at=datetime.now(UTC),
        context={"case": {"type": "complaint", "status": "received"}, ...},
    ))

Design notes:
- Each public method opens its own DB connection and closes it before returning.
  This keeps the Engine stateless and safe to share across threads.
- process_event writes fired_obligations and deadlines to Postgres and appends
  audit entries. It is idempotent via the UNIQUE (case_id, obligation_id, version)
  constraint: re-processing the same event is a no-op (INSERT ON CONFLICT DO NOTHING).
- F1 does not implement requirement satisfaction or evidence checks against real
  Postgres tables (those arrive in F2). evidence_for uses the injected backend,
  which defaults to InMemoryEvidenceBackend (always returns not-found).
"""

from __future__ import annotations

import logging
import os
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import UUID

import psycopg
from pydantic import BaseModel

from nuqe_engine.audit import (
    AuditEntry,
    AuditEventType,
    append_audit_entry,
    get_audit_trail,
)
from nuqe_engine.deadline import DeadlineCalculation, calculate_deadline, deadline_status
from nuqe_engine.evidence import (
    EvidenceBackend,
    EvidenceResult,
    InMemoryEvidenceBackend,
    check_evidence,
)
from nuqe_engine.loader import load_library
from nuqe_engine.requirement import RequirementRegistration, register_requirement
from nuqe_engine.schema import ObligationRow, TriggerEvent
from nuqe_engine.sync import SyncResult, sync_to_database
from nuqe_engine.trigger import Event, FiredObligation, find_fired_obligations
from nuqe_engine.validator import validate

logger = logging.getLogger(__name__)


# ── Public result models ──────────────────────────────────────────────────


class ProcessEventResult(BaseModel):
    """Everything the engine produced in response to a single event."""

    fired_obligations: list[FiredObligation]
    deadlines: list[DeadlineCalculation]
    requirements: list[RequirementRegistration]
    audit_entries: list[AuditEntry]


class ObligationStatus(BaseModel):
    """Current status of one fired obligation for a case."""

    obligation: ObligationRow
    fired_obligation_id: UUID
    fired_at: datetime
    due_at: datetime | None
    deadline_status: Literal["pending", "met", "breached", "irrelevant"]
    requirement_status: Literal["pending", "satisfied"]
    evidence_status: Literal["found", "missing", "not_checked"]


# ── Internal DB helpers ───────────────────────────────────────────────────

_OBLIGATION_COLUMNS = [
    "obligation_id", "version", "jurisdiction", "regulator", "framework",
    "source_provision_type", "obligation_name", "source_document", "source_url",
    "product_types", "customer_segments", "trigger_condition", "requirement",
    "deadline_value", "deadline_unit", "deadline_anchor", "evidence_required",
    "breach_consequence", "exceptions", "overlay_of", "supersedes",
    "effective_from", "effective_to", "review_status",
]


def _load_obligations_from_db(conn: psycopg.Connection) -> list[ObligationRow]:
    """Load all approved ObligationRows from the database."""
    cols = ", ".join(_OBLIGATION_COLUMNS)
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT {cols} FROM nuqe_engine.obligations WHERE review_status = 'approved'"
        )
        rows = cur.fetchall()

    obligations: list[ObligationRow] = []
    for row in rows:
        row_dict = dict(zip(_OBLIGATION_COLUMNS, row, strict=True))
        try:
            obligations.append(ObligationRow.model_validate(row_dict))
        except Exception as exc:
            logger.warning(
                "Could not reconstruct ObligationRow %s from DB: %s",
                row_dict.get("obligation_id"),
                exc,
            )
    return obligations


def _insert_fired_obligation(
    conn: psycopg.Connection,
    case_id: UUID,
    obl: ObligationRow,
    trigger_event: TriggerEvent,
) -> tuple[UUID, datetime] | None:
    """
    INSERT a fired_obligation row. Returns (id, fired_at) on success, None on conflict.

    The UNIQUE constraint on (case_id, obligation_id, obligation_version) means that
    re-processing the same event is a no-op.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO nuqe_engine.fired_obligations
                (case_id, obligation_id, obligation_version, trigger_event, status)
            VALUES (%s, %s, %s, %s, 'open')
            ON CONFLICT (case_id, obligation_id, obligation_version) DO NOTHING
            RETURNING id, fired_at
            """,
            (str(case_id), obl.obligation_id, obl.version, str(trigger_event.value)),
        )
        row = cur.fetchone()
    if row is None:
        return None  # already existed — idempotent skip
    return UUID(str(row[0])), row[1]


def _insert_deadline(
    conn: psycopg.Connection,
    fired_obligation_id: UUID,
    calc: DeadlineCalculation,
) -> None:
    """INSERT a deadline row. Skipped when due_at is None (deadline_unit='none')."""
    if calc.due_at is None:
        return
    assert calc.deadline_value is not None
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO nuqe_engine.deadlines
                (fired_obligation_id, due_at, anchor_event_at,
                 deadline_value, deadline_unit, deadline_anchor, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'pending')
            """,
            (
                str(fired_obligation_id),
                calc.due_at,
                calc.anchor_event_at,
                calc.deadline_value,
                str(calc.deadline_unit.value),
                str(calc.deadline_anchor.value),
            ),
        )


# ── Engine class ──────────────────────────────────────────────────────────


class Engine:
    """
    Public API for the Nuqe obligation engine.

    All database operations open and close their own connection; the Engine
    itself holds no open connection and is safe to share across threads.
    """

    def __init__(
        self,
        *,
        database_url: str,
        library_path: Path | None = None,
        audit_signing_key: bytes,
        evidence_backend: EvidenceBackend | None = None,
    ) -> None:
        self._database_url = database_url
        self._library_path = library_path
        self._signing_key = audit_signing_key
        self._evidence_backend: EvidenceBackend = (
            evidence_backend if evidence_backend is not None
            else InMemoryEvidenceBackend()
        )

    @contextmanager
    def connect(self) -> Iterator[psycopg.Connection]:
        """Yield a psycopg connection against the engine's database.

        The caller controls the transaction. The connection is closed on
        exit regardless of whether the caller committed or rolled back.

        Routers MUST use this instead of constructing their own
        `psycopg.connect(...)` — otherwise they couple to Engine's
        private `_database_url` attribute and become hard to stub.
        """
        conn = psycopg.connect(self._database_url)
        try:
            yield conn
        finally:
            conn.close()

    @property
    def signing_key(self) -> bytes:
        """HMAC signing key used by the audit log.

        Read-only public accessor. Routers that need to verify audit
        signatures call this; they MUST NOT reach into `_signing_key`
        directly.
        """
        return self._signing_key

    @classmethod
    def from_env(cls) -> Engine:
        """
        Construct an Engine from environment variables.

        Required:
            DATABASE_URL        — Postgres connection string
            AUDIT_SIGNING_KEY   — HMAC signing key (UTF-8 string, converted to bytes)

        Optional:
            LIBRARY_PATH        — Path to the obligation library Excel file
        """
        database_url = os.environ.get(
            "DATABASE_URL",
            "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine",
        )
        key_str = os.environ.get("AUDIT_SIGNING_KEY", "")
        if not key_str:
            raise ValueError("AUDIT_SIGNING_KEY environment variable is not set")
        signing_key = key_str.encode()
        library_path_str = os.environ.get("LIBRARY_PATH")
        library_path = Path(library_path_str) if library_path_str else None
        return cls(
            database_url=database_url,
            library_path=library_path,
            audit_signing_key=signing_key,
        )

    def health_check(self) -> dict[str, object]:
        """
        Lightweight liveness check.

        Runs `SELECT 1` to verify DB reachability and reads the obligations
        table metadata (total approved count and max updated_at as a proxy for
        library version).

        Returns:
            {
                "db_reachable": bool,
                "approved_count": int | None,
                "library_synced_at": datetime | None,
            }

        Never raises — always returns a dict so callers can decide how to handle
        an unhealthy state.
        """
        try:
            with (
                psycopg.connect(self._database_url, autocommit=True) as conn,
                conn.cursor() as cur,
            ):
                cur.execute("SELECT 1")
                cur.execute(
                    """
                    SELECT COUNT(*), MAX(synced_at)
                    FROM nuqe_engine.obligations
                    WHERE review_status = 'approved'
                    """
                )
                row = cur.fetchone()
            approved_count = int(row[0]) if row and row[0] is not None else 0
            library_synced_at = row[1] if row else None
            return {
                "db_reachable": True,
                "approved_count": approved_count,
                "library_synced_at": library_synced_at,
            }
        except Exception as exc:
            logger.warning("health_check failed: %s", exc)
            return {
                "db_reachable": False,
                "approved_count": None,
                "library_synced_at": None,
            }

    def refresh_library(self, path: Path | None = None) -> SyncResult:
        """
        Load, validate, and sync the obligation library to Postgres.

        Args:
            path: Override the library path. Falls back to the Engine's
                  library_path, then raises ValueError if neither is set.

        Returns:
            SyncResult with inserted/unchanged counts.
        """
        lib_path = path or self._library_path
        if lib_path is None:
            raise ValueError(
                "No library_path provided. Supply it to Engine() or refresh_library(path=...)."
            )

        raw = load_library(lib_path, approved_only=True)
        result = validate(raw)

        if result.defects:
            for defect in result.defects:
                logger.warning(
                    "Library defect [%s] row %d %s: %s",
                    defect.severity,
                    defect.row_number,
                    defect.column,
                    defect.message,
                )

        with psycopg.connect(self._database_url, autocommit=True) as conn:
            sync_result = sync_to_database(result.valid, conn)

        logger.info(
            "refresh_library: %d inserted, %d unchanged",
            sync_result.inserted,
            sync_result.unchanged,
        )
        return sync_result

    def _run_process_event(
        self, conn: psycopg.Connection, event: Event
    ) -> ProcessEventResult:
        """
        Core logic for process_event. Operates on a caller-provided connection.

        The caller owns the transaction: this method does NOT commit or rollback.
        When called with autocommit=True, every statement auto-commits individually.
        When called inside a transaction (autocommit=False), all statements are
        part of the caller's transaction and will be rolled back if the caller
        rolls back.
        """
        obligations = _load_obligations_from_db(conn)
        fired_list = find_fired_obligations(event, obligations)

        all_deadlines: list[DeadlineCalculation] = []
        all_requirements: list[RequirementRegistration] = []
        all_audit: list[AuditEntry] = []
        actually_fired: list[FiredObligation] = []

        for fired in fired_list:
            obl = fired.obligation
            insert_result = _insert_fired_obligation(
                conn, event.case_id, obl, event.event
            )
            if insert_result is None:
                logger.debug(
                    "Obligation %s already fired for case %s — skipping",
                    obl.obligation_id,
                    event.case_id,
                )
                continue

            fo_id, _fired_at = insert_result
            actually_fired.append(fired)

            # M7: deadline
            calc = calculate_deadline(obl, event.occurred_at)
            _insert_deadline(conn, fo_id, calc)
            all_deadlines.append(calc)

            # M5: requirement
            req_reg = register_requirement(fired, fired_obligation_id=fo_id)
            all_requirements.append(req_reg)

            # M8: audit — OBLIGATION_FIRED
            audit_fired = append_audit_entry(
                conn,
                entity_type="fired_obligation",
                entity_id=event.case_id,
                event_type=AuditEventType.OBLIGATION_FIRED,
                actor="engine",
                payload={
                    "fired_obligation_id": str(fo_id),
                    "obligation_id": obl.obligation_id,
                    "obligation_version": obl.version,
                    "trigger_event": str(event.event.value),
                    "case_id": str(event.case_id),
                },
                signing_key=self._signing_key,
            )
            all_audit.append(audit_fired)

            # M8: audit — DEADLINE_SET (only when there is a deadline)
            if calc.due_at is not None:
                audit_deadline = append_audit_entry(
                    conn,
                    entity_type="deadline",
                    entity_id=event.case_id,
                    event_type=AuditEventType.DEADLINE_SET,
                    actor="engine",
                    payload={
                        "fired_obligation_id": str(fo_id),
                        "obligation_id": obl.obligation_id,
                        "due_at": calc.due_at.isoformat(),
                        "deadline_value": calc.deadline_value,
                        "deadline_unit": str(calc.deadline_unit.value),
                    },
                    signing_key=self._signing_key,
                )
                all_audit.append(audit_deadline)

        return ProcessEventResult(
            fired_obligations=actually_fired,
            deadlines=all_deadlines,
            requirements=all_requirements,
            audit_entries=all_audit,
        )

    def process_event(
        self, event: Event, *, conn: psycopg.Connection | None = None
    ) -> ProcessEventResult:
        """
        Process an event: fire obligations, calculate deadlines, register
        requirements, and write everything to Postgres with audit entries.

        Steps:
          1. Load approved obligations from Postgres.
          2. Find fired obligations (M4 trigger evaluator).
          3. For each fired obligation:
             a. INSERT into fired_obligations (idempotent via UNIQUE conflict).
             b. Calculate deadline (M7).
             c. INSERT into deadlines.
             d. Register requirement (M5).
             e. Append audit entries for OBLIGATION_FIRED and DEADLINE_SET.

        Args:
            event: The event to process.
            conn:  Optional caller-provided psycopg connection. When supplied,
                   this method does NOT open a new connection and does NOT commit
                   — the caller owns the transaction. When None (default), a new
                   autocommit connection is opened and closed automatically.

        Returns:
            ProcessEventResult containing all fired obligations, deadlines,
            requirements, and audit entries created in this call.
        """
        if conn is not None:
            return self._run_process_event(conn, event)

        with psycopg.connect(self._database_url, autocommit=True) as _conn:
            return self._run_process_event(_conn, event)

    def due_obligations(
        self,
        case_id: UUID,
        as_of: datetime | None = None,
    ) -> list[ObligationStatus]:
        """
        Return the current status of all fired obligations for a case.

        Args:
            case_id: The case to query.
            as_of: Reference time for deadline status. Defaults to now (UTC).

        Returns:
            List of ObligationStatus, one per fired obligation.
        """
        if as_of is None:
            as_of = datetime.now(tz=UTC)

        with psycopg.connect(self._database_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        fo.id,
                        fo.obligation_id,
                        fo.obligation_version,
                        fo.fired_at,
                        fo.satisfied_at,
                        d.due_at
                    FROM nuqe_engine.fired_obligations fo
                    LEFT JOIN nuqe_engine.deadlines d
                        ON d.fired_obligation_id = fo.id
                    WHERE fo.case_id = %s
                    ORDER BY fo.fired_at ASC
                    """,
                    (str(case_id),),
                )
                fo_rows = cur.fetchall()

            # Load obligation details from DB for each fired obligation
            obligation_ids = list({r[1] for r in fo_rows})
            obligations_by_key: dict[tuple[str, str], ObligationRow] = {}
            if obligation_ids:
                cols = ", ".join(_OBLIGATION_COLUMNS)
                with conn.cursor() as cur:
                    cur.execute(
                        f"""
                        SELECT {cols}
                        FROM nuqe_engine.obligations
                        WHERE obligation_id = ANY(%s)
                        """,
                        (obligation_ids,),
                    )
                    for row in cur.fetchall():
                        row_dict = dict(zip(_OBLIGATION_COLUMNS, row, strict=True))
                        try:
                            rebuilt = ObligationRow.model_validate(row_dict)
                            obligations_by_key[(rebuilt.obligation_id, rebuilt.version)] = rebuilt
                        except Exception as exc:
                            logger.warning("Could not reconstruct obligation: %s", exc)

        statuses: list[ObligationStatus] = []
        for fo_id, obl_id, obl_ver, fired_at, satisfied_at, due_at in fo_rows:
            obl = obligations_by_key.get((obl_id, obl_ver))
            if obl is None:
                logger.warning("Obligation %s v%s not found in DB", obl_id, obl_ver)
                continue

            dl_status = deadline_status(due_at, as_of, satisfied_at)

            statuses.append(
                ObligationStatus(
                    obligation=obl,
                    fired_obligation_id=UUID(str(fo_id)),
                    fired_at=fired_at,
                    due_at=due_at,
                    deadline_status=dl_status,
                    requirement_status="satisfied" if satisfied_at else "pending",
                    evidence_status="not_checked",
                )
            )

        return statuses

    def evidence_for(
        self,
        obligation_id: str,
        version: str,
        case_id: UUID,
    ) -> list[EvidenceResult]:
        """
        Check evidence for a specific obligation/case combination.

        Args:
            obligation_id: The obligation identifier.
            version: The obligation version string.
            case_id: The case to check evidence for.

        Returns:
            List of EvidenceResult, one per evidence spec in evidence_required.
        """
        with psycopg.connect(self._database_url, autocommit=True) as conn:
            cols = ", ".join(_OBLIGATION_COLUMNS)
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT {cols}
                    FROM nuqe_engine.obligations
                    WHERE obligation_id = %s AND version = %s
                    """,
                    (obligation_id, version),
                )
                row = cur.fetchone()

        if row is None:
            logger.warning("Obligation %s v%s not found", obligation_id, version)
            return []

        row_dict = dict(zip(_OBLIGATION_COLUMNS, row, strict=True))
        obl = ObligationRow.model_validate(row_dict)

        results: list[EvidenceResult] = []
        for ev_spec in obl.evidence_required:
            try:
                result = check_evidence(ev_spec, case_id, self._evidence_backend)
            except Exception as exc:
                logger.warning(
                    "Evidence check failed for %s [%s]: %s",
                    obligation_id,
                    ev_spec.selector,
                    exc,
                )
                continue
            results.append(result)

        return results

    def audit_trail(
        self,
        *,
        entity_id: UUID,
        entity_type: str | None = None,
    ) -> list[AuditEntry]:
        """
        Retrieve the audit trail for an entity.

        Args:
            entity_id: The entity UUID (case_id, fired_obligation_id, etc.).
            entity_type: Optional filter by entity type.

        Returns:
            List of AuditEntry in chronological order, with signatures verified.
        """
        with psycopg.connect(self._database_url, autocommit=True) as conn:
            return get_audit_trail(
                conn,
                entity_id=entity_id,
                entity_type=entity_type,
                verify_signatures=True,
                signing_key=self._signing_key,
            )
