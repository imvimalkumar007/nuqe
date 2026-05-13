"""
M2: Obligation validator.

Takes a list of RawObligationRow (from M1) and produces a list of
ObligationRow (fully parsed and validated) plus a list of ValidationDefect
(one per problem found). Never raises on a bad row: all errors are collected
and associated with the source spreadsheet row number.

Cross-field validation rules (Method Section 9):
  - deadline_value is null iff deadline_unit == 'none'.
  - deadline_value > 0 if deadline_unit is calendar_days, business_days, or hours.
  - overlay_of, if set, must reference an obligation_id in the same library.
  - supersedes, if set, must reference an obligation_id in the same library.
  - effective_to >= effective_from if both are set.
  - The framework segment in the obligation_id must match the framework column value.
  - product_types and customer_segments must contain at least one valid element.
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from pydantic import BaseModel, ValidationError

from nuqe_engine import jsparser
from nuqe_engine.schema import (
    DeadlineUnit,
    Evidence,
    Exception_,
    ObligationRow,
    RawObligationRow,
    Requirement,
    TriggerCondition,
)

logger = logging.getLogger(__name__)


# ── Public output types ──────────────────────────────────────────────────


class ValidationDefect(BaseModel):
    """A single validation problem found in a library row."""

    row_number: int
    obligation_id: str | None
    column: str
    severity: Literal["error", "warning"]
    message: str


class ValidationResult(BaseModel):
    """Output of validate(). Valid rows are fully parsed ObligationRows."""

    valid: list[ObligationRow]
    defects: list[ValidationDefect]


# ── Helpers ──────────────────────────────────────────────────────────────


def _row_number(raw: RawObligationRow) -> int:
    """Return the source spreadsheet row number stored as a private attribute."""
    return getattr(raw, "_source_row_number", 0)


def _defect(
    raw: RawObligationRow,
    column: str,
    message: str,
    severity: Literal["error", "warning"] = "error",
) -> ValidationDefect:
    return ValidationDefect(
        row_number=_row_number(raw),
        obligation_id=raw.obligation_id or None,
        column=column,
        severity=severity,
        message=message,
    )


# Abbreviated framework prefixes used in obligation_ids that differ from the
# Framework enum value. The library is canonical; these mappings expand the
# abbreviation so the framework column can be compared correctly.
_FRAMEWORK_ABBREVIATIONS: dict[str, str] = {
    "CD": "CONSUMER_DUTY",
}


def _extract_framework_from_id(obligation_id: str) -> str | None:
    """
    Pull the framework segment from an obligation_id, expanding known abbreviations.

    Format is JURIS-FRAMEWORK-NNN, e.g.:
      'UK-DISP-001' -> 'DISP'
      'UK-CD-001'   -> 'CONSUMER_DUTY'  (abbreviation expanded)

    Returns None if the id does not match the expected structure.
    """
    parts = obligation_id.split("-")
    if len(parts) < 3:
        return None
    prefix = parts[1]
    return _FRAMEWORK_ABBREVIATIONS.get(prefix, prefix)


# ── Sub-field parsers ────────────────────────────────────────────────────


def _parse_trigger_condition(
    raw_str: str,
    raw: RawObligationRow,
    row_defects: list[ValidationDefect],
) -> TriggerCondition | None:
    try:
        data = jsparser.parse_object(raw_str)
    except jsparser.ParseError as exc:
        row_defects.append(
            _defect(raw, "trigger_condition", f"Parse error: {exc}")
        )
        return None
    try:
        return TriggerCondition(**data)
    except Exception as exc:
        row_defects.append(
            _defect(raw, "trigger_condition", f"Schema error: {exc}")
        )
        return None


def _parse_requirement(
    raw_str: str,
    raw: RawObligationRow,
    row_defects: list[ValidationDefect],
) -> Requirement | None:
    try:
        data = jsparser.parse_object(raw_str)
    except jsparser.ParseError as exc:
        row_defects.append(_defect(raw, "requirement", f"Parse error: {exc}"))
        return None
    try:
        return Requirement(**data)
    except Exception as exc:
        row_defects.append(_defect(raw, "requirement", f"Schema error: {exc}"))
        return None


def _parse_evidence_required(
    raw_str: str,
    raw: RawObligationRow,
    row_defects: list[ValidationDefect],
) -> list[Evidence] | None:
    try:
        items = jsparser.parse_array(raw_str)
    except jsparser.ParseError as exc:
        row_defects.append(
            _defect(raw, "evidence_required", f"Parse error: {exc}")
        )
        return None
    result: list[Evidence] = []
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            row_defects.append(
                _defect(
                    raw,
                    f"evidence_required[{i}]",
                    f"Expected object, got {type(item).__name__}",
                )
            )
            return None
        try:
            result.append(Evidence(**item))
        except Exception as exc:
            row_defects.append(
                _defect(raw, f"evidence_required[{i}]", f"Schema error: {exc}")
            )
            return None
    return result


def _parse_exceptions(
    raw_str: str,
    raw: RawObligationRow,
    row_defects: list[ValidationDefect],
) -> list[Exception_] | None:
    try:
        items = jsparser.parse_array(raw_str)
    except jsparser.ParseError as exc:
        row_defects.append(_defect(raw, "exceptions", f"Parse error: {exc}"))
        return None
    result: list[Exception_] = []
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            row_defects.append(
                _defect(
                    raw,
                    f"exceptions[{i}]",
                    f"Expected object, got {type(item).__name__}",
                )
            )
            return None
        try:
            result.append(Exception_(**item))
        except Exception as exc:
            row_defects.append(
                _defect(raw, f"exceptions[{i}]", f"Schema error: {exc}")
            )
            return None
    return result


def _parse_list_column(
    raw_str: str,
    column: str,
    raw: RawObligationRow,
    row_defects: list[ValidationDefect],
) -> list[Any] | None:
    """Parse a JS-array string (product_types, customer_segments)."""
    try:
        result = jsparser.parse_array(raw_str)
    except jsparser.ParseError as exc:
        row_defects.append(_defect(raw, column, f"Parse error: {exc}"))
        return None
    return result


# ── Main entry point ─────────────────────────────────────────────────────


def validate(raw_rows: list[RawObligationRow]) -> ValidationResult:
    """
    Parse and validate a list of RawObligationRow.

    Args:
        raw_rows: Output of loader.load_library(). One raw row per obligation.
            The rows may span any review_status; filtering is the caller's concern.

    Returns:
        ValidationResult. Any row with at least one error-severity defect is
        excluded from the valid list. Warning-severity defects are recorded but
        do not exclude the row.
    """
    # Collect all obligation_ids up front for cross-reference checks.
    all_ids: set[str] = {r.obligation_id for r in raw_rows if r.obligation_id}

    valid: list[ObligationRow] = []
    defects: list[ValidationDefect] = []

    for raw in raw_rows:
        row_defects: list[ValidationDefect] = []

        # ── Parse structured sub-fields ──────────────────────────────────
        trigger_condition = _parse_trigger_condition(
            raw.trigger_condition, raw, row_defects
        )
        requirement = _parse_requirement(raw.requirement, raw, row_defects)
        evidence_required = _parse_evidence_required(
            raw.evidence_required, raw, row_defects
        )
        exceptions_list = _parse_exceptions(raw.exceptions, raw, row_defects)
        product_types = _parse_list_column(
            raw.product_types, "product_types", raw, row_defects
        )
        customer_segments = _parse_list_column(
            raw.customer_segments, "customer_segments", raw, row_defects
        )

        # ── Cross-field validation (Method Section 9) ────────────────────

        # deadline_value / deadline_unit consistency
        deadline_unit_str = raw.deadline_unit
        if deadline_unit_str == DeadlineUnit.NONE.value:
            if raw.deadline_value is not None:
                row_defects.append(
                    _defect(
                        raw,
                        "deadline_value",
                        f"deadline_value must be null when deadline_unit is 'none', "
                        f"got {raw.deadline_value!r}",
                    )
                )
        else:
            # Temporal unit: value must be present and positive
            if raw.deadline_value is None:
                row_defects.append(
                    _defect(
                        raw,
                        "deadline_value",
                        f"deadline_value is required when deadline_unit is "
                        f"'{deadline_unit_str}' (got null)",
                    )
                )
            elif raw.deadline_value <= 0:
                row_defects.append(
                    _defect(
                        raw,
                        "deadline_value",
                        f"deadline_value must be > 0 when deadline_unit is "
                        f"'{deadline_unit_str}' (got {raw.deadline_value!r})",
                    )
                )

        # overlay_of cross-reference
        if raw.overlay_of is not None and raw.overlay_of not in all_ids:
            row_defects.append(
                _defect(
                    raw,
                    "overlay_of",
                    f"overlay_of references '{raw.overlay_of}', "
                    f"which is not present in this library",
                )
            )

        # supersedes cross-reference
        if raw.supersedes is not None and raw.supersedes not in all_ids:
            row_defects.append(
                _defect(
                    raw,
                    "supersedes",
                    f"supersedes references '{raw.supersedes}', "
                    f"which is not present in this library",
                )
            )

        # effective_to >= effective_from
        if (
            raw.effective_from is not None
            and raw.effective_to is not None
            and raw.effective_to < raw.effective_from
        ):
            row_defects.append(
                _defect(
                    raw,
                    "effective_to",
                    f"effective_to ({raw.effective_to}) must be on or after "
                    f"effective_from ({raw.effective_from})",
                )
            )

        # Framework prefix in obligation_id must match the framework column
        framework_from_id = _extract_framework_from_id(raw.obligation_id)
        if framework_from_id is not None and raw.framework and framework_from_id != raw.framework:
            row_defects.append(
                _defect(
                    raw,
                    "framework",
                    f"Framework segment in obligation_id ('{framework_from_id}') "
                    f"does not match framework column ('{raw.framework}')",
                )
            )

        # ── Skip Pydantic construction if any error-level defects ────────
        if any(d.severity == "error" for d in row_defects):
            defects.extend(row_defects)
            continue

        # ── Construct ObligationRow ──────────────────────────────────────
        # Use model_validate (dict input) so Pydantic coerces strings to enums;
        # this also satisfies mypy without a proliferation of type: ignore comments.
        row_data: dict[str, object] = {
            "obligation_id": raw.obligation_id,
            "obligation_name": raw.obligation_name,
            "jurisdiction": raw.jurisdiction,
            "regulator": raw.regulator,
            "framework": raw.framework,
            "source_document": raw.source_document,
            "source_url": raw.source_url,
            "source_provision_type": raw.source_provision_type,
            "product_types": product_types,
            "customer_segments": customer_segments,
            "trigger_condition": trigger_condition,
            "requirement": requirement,
            "deadline_value": raw.deadline_value,
            "deadline_unit": raw.deadline_unit,
            "deadline_anchor": raw.deadline_anchor,
            "evidence_required": evidence_required,
            "breach_consequence": raw.breach_consequence,
            "exceptions": exceptions_list if exceptions_list is not None else [],
            "overlay_of": raw.overlay_of,
            "supersedes": raw.supersedes,
            "effective_from": raw.effective_from,
            "effective_to": raw.effective_to,
            "version": raw.version,
            "review_status": raw.review_status,
        }
        try:
            obligation = ObligationRow.model_validate(row_data)
        except ValidationError as exc:
            for error in exc.errors():
                col = ".".join(str(loc) for loc in error["loc"])
                row_defects.append(_defect(raw, col, error["msg"]))
            defects.extend(row_defects)
            continue

        defects.extend(row_defects)  # Includes any warnings collected above
        valid.append(obligation)

    logger.info(
        "Validated %d rows: %d valid, %d with defects",
        len(raw_rows),
        len(valid),
        sum(1 for d in defects if d.severity == "error"),
    )
    return ValidationResult(valid=valid, defects=defects)
