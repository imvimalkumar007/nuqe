"""
M6: Evidence checker.

Determines whether the evidence required by a fired obligation exists in the
data store. For F1 the engine does not query real customer data; instead M6
defines the API surface and provides an InMemoryEvidenceBackend for testing.

Design notes:
- The selector is a DSL expression (same grammar as M4 trigger conditions).
- Selector syntax is validated at check_evidence call time; a malformed
  selector raises ExpressionError before any backend query is attempted.
- InMemoryEvidenceBackend evaluates selectors by running evaluate_expression
  against each stored record dict (with case_id injected as a string key).
- The EvidenceBackend Protocol defines the interface for F2+ implementations
  that will query real Postgres tables.
"""

from __future__ import annotations

import logging
from typing import Any, Protocol
from uuid import UUID

from pydantic import BaseModel

from nuqe_engine.schema import Evidence, EvidenceLocation
from nuqe_engine.trigger import ExpressionError, evaluate_expression, parse_expression

logger = logging.getLogger(__name__)


# ── Public models ─────────────────────────────────────────────────────────


class EvidenceResult(BaseModel):
    """Result of checking whether evidence exists for a fired obligation."""

    found: bool
    location: EvidenceLocation
    selector: str
    matched_records: int  # 0 when not found
    notes: str | None = None


# ── Backend protocol and in-memory implementation ─────────────────────────


class EvidenceBackend(Protocol):
    """
    Interface for evidence data sources.

    Implementations query the appropriate data store (communications_table,
    case_notes_table, document_store, external_system) and return the count
    of records that match the selector expression for the given case.
    """

    def find(
        self,
        location: EvidenceLocation,
        selector: str,
        case_id: UUID,
    ) -> int:
        """
        Return the count of records matching selector at location for case_id.

        Args:
            location: Which data source to query.
            selector: A DSL expression string (already validated by check_evidence).
            case_id: The case whose records should be searched.

        Returns:
            Number of matching records (0 means not found).
        """
        ...


class InMemoryEvidenceBackend:
    """
    In-memory evidence backend for testing and local development.

    Stores records as plain dicts keyed by EvidenceLocation. The find() method
    evaluates the selector expression against each stored record, injecting
    case_id as a top-level string field so expressions like
    ``case_id == 'some-uuid'`` work correctly.
    """

    def __init__(self) -> None:
        self._records: dict[EvidenceLocation, list[dict[str, Any]]] = {}

    def add(self, location: EvidenceLocation, record: dict[str, Any]) -> None:
        """
        Store a record at the given location.

        Args:
            location: The data source this record belongs to.
            record: Arbitrary dict representing the record.
        """
        self._records.setdefault(location, []).append(record)

    def find(
        self,
        location: EvidenceLocation,
        selector: str,
        case_id: UUID,
    ) -> int:
        """
        Count records at location whose dict satisfies the selector expression.

        Each record is evaluated with case_id injected as a top-level string
        field so the selector can reference it as ``case_id``.
        ExpressionError during per-record evaluation is logged and skipped
        (the selector was already validated before find() is called).
        """
        records = self._records.get(location, [])
        count = 0
        case_id_str = str(case_id)
        for record in records:
            ctx: dict[str, Any] = {**record, "case_id": case_id_str}
            try:
                if evaluate_expression(selector, ctx):
                    count += 1
            except ExpressionError as exc:
                logger.warning(
                    "ExpressionError evaluating selector %r against record %r: %s",
                    selector,
                    record,
                    exc,
                )
        return count


# ── Public function ───────────────────────────────────────────────────────


def check_evidence(
    evidence: Evidence,
    case_id: UUID,
    backend: EvidenceBackend,
) -> EvidenceResult:
    """
    Determine whether the required evidence exists for the given case.

    Validates the selector syntax before querying. If the selector is not
    valid DSL, raises ExpressionError immediately (not after a backend query).

    Args:
        evidence: An Evidence specification from an ObligationRow.
        case_id: The case to check evidence for.
        backend: Data source implementation to query.

    Returns:
        EvidenceResult with found, location, selector, and matched_records.

    Raises:
        ExpressionError: If the selector expression has a syntax error.
    """
    # Validate selector syntax upfront — raises ExpressionError if malformed
    parse_expression(evidence.selector)

    count = backend.find(evidence.location, evidence.selector, case_id)

    return EvidenceResult(
        found=count > 0,
        location=evidence.location,
        selector=evidence.selector,
        matched_records=count,
        notes=None,
    )
