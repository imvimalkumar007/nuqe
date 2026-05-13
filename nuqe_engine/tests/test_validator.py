"""Tests for nuqe_engine.validator (M2)."""

from __future__ import annotations

from pathlib import Path

import pytest

from nuqe_engine.loader import load_library
from nuqe_engine.schema import (
    CustomerSegment,
    DeadlineUnit,
    Evidence,
    ObligationRow,
    ProductType,
    RawObligationRow,
    Requirement,
    TriggerCondition,
)
from nuqe_engine.validator import validate

# ── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def approved_raw_rows(library_path: Path) -> list[RawObligationRow]:
    """All 141 approved rows from the real library, as RawObligationRow."""
    return load_library(library_path, approved_only=True)


@pytest.fixture
def first_raw_row(approved_raw_rows: list[RawObligationRow]) -> RawObligationRow:
    """The first approved row for mutation-based tests."""
    return approved_raw_rows[0]


def _mutate(raw: RawObligationRow, **kwargs: object) -> RawObligationRow:
    """
    Return a shallow copy of a RawObligationRow with specific fields replaced.
    Preserves the _source_row_number private attribute.
    """
    data = raw.model_dump()
    data.update(kwargs)
    new_row = RawObligationRow(**data)
    object.__setattr__(new_row, "_source_row_number", raw._source_row_number)  # type: ignore[attr-defined]
    return new_row


# ── Full-library smoke test ───────────────────────────────────────────────


def test_full_library_validates_without_defects(
    approved_raw_rows: list[RawObligationRow],
) -> None:
    """All 141 approved rows must parse and validate with zero defects."""
    result = validate(approved_raw_rows)

    errors = [d for d in result.defects if d.severity == "error"]
    if errors:
        messages = "\n".join(
            f"  Row {d.row_number} ({d.obligation_id}) [{d.column}]: {d.message}"
            for d in errors[:10]
        )
        pytest.fail(
            f"Expected zero validation errors across 141 approved rows. "
            f"Got {len(errors)}:\n{messages}"
        )

    assert len(result.valid) == 141, (
        f"Expected 141 valid rows, got {len(result.valid)}. "
        f"Defects: {[d.message for d in result.defects]}"
    )


# ── Sub-field typing ──────────────────────────────────────────────────────


def test_valid_row_has_typed_sub_fields(
    approved_raw_rows: list[RawObligationRow],
) -> None:
    """ObligationRow sub-fields must be properly typed (not raw strings)."""
    result = validate(approved_raw_rows)
    assert len(result.valid) > 0

    for row in result.valid:
        assert isinstance(row.trigger_condition, TriggerCondition), (
            f"{row.obligation_id}: trigger_condition is {type(row.trigger_condition)}"
        )
        assert isinstance(row.requirement, Requirement), (
            f"{row.obligation_id}: requirement is {type(row.requirement)}"
        )
        assert isinstance(row.evidence_required, list), (
            f"{row.obligation_id}: evidence_required is {type(row.evidence_required)}"
        )
        assert all(isinstance(e, Evidence) for e in row.evidence_required), (
            f"{row.obligation_id}: evidence_required contains non-Evidence items"
        )
        assert isinstance(row.product_types, list), (
            f"{row.obligation_id}: product_types is {type(row.product_types)}"
        )
        assert all(isinstance(pt, ProductType) for pt in row.product_types), (
            f"{row.obligation_id}: product_types contains non-enum values"
        )
        assert isinstance(row.customer_segments, list), (
            f"{row.obligation_id}: customer_segments is {type(row.customer_segments)}"
        )
        assert all(isinstance(cs, CustomerSegment) for cs in row.customer_segments), (
            f"{row.obligation_id}: customer_segments contains non-enum values"
        )


# ── Defect provenance ─────────────────────────────────────────────────────


def test_defect_carries_source_row_number(
    first_raw_row: RawObligationRow,
) -> None:
    """Every defect must include the source spreadsheet row number."""
    bad_row = _mutate(
        first_raw_row,
        trigger_condition="{ broken syntax @@@ }",
    )
    object.__setattr__(bad_row, "_source_row_number", 42)

    result = validate([bad_row])
    assert len(result.defects) > 0
    for defect in result.defects:
        assert defect.row_number == 42, (
            f"Expected row_number=42, got {defect.row_number}"
        )


# ── Bad trigger_condition ─────────────────────────────────────────────────


def test_catches_malformed_trigger_condition(
    first_raw_row: RawObligationRow,
) -> None:
    """A syntactically invalid trigger_condition must produce an error defect."""
    bad_row = _mutate(
        first_raw_row,
        trigger_condition="{ event: 'complaint_received' MISSING_COLON value }",
    )
    result = validate([bad_row])
    errors = [d for d in result.defects if d.severity == "error"]
    assert any(d.column == "trigger_condition" for d in errors), (
        f"Expected trigger_condition defect. Got: {[d.column for d in errors]}"
    )
    assert len(result.valid) == 0, "A row with parse error must not be in valid"


# ── deadline_value / deadline_unit mismatches ─────────────────────────────


def test_catches_deadline_value_present_when_unit_is_none(
    first_raw_row: RawObligationRow,
) -> None:
    """deadline_value must be null when deadline_unit is 'none'."""
    bad_row = _mutate(
        first_raw_row,
        deadline_unit=DeadlineUnit.NONE.value,
        deadline_value=5,
    )
    result = validate([bad_row])
    errors = [d for d in result.defects if d.severity == "error"]
    assert any(d.column == "deadline_value" for d in errors), (
        f"Expected deadline_value defect. Got: {[d.column for d in errors]}"
    )
    assert len(result.valid) == 0


def test_catches_deadline_value_missing_when_unit_is_calendar_days(
    first_raw_row: RawObligationRow,
) -> None:
    """deadline_value must be present when deadline_unit is 'calendar_days'."""
    bad_row = _mutate(
        first_raw_row,
        deadline_unit=DeadlineUnit.CALENDAR_DAYS.value,
        deadline_value=None,
    )
    result = validate([bad_row])
    errors = [d for d in result.defects if d.severity == "error"]
    assert any(d.column == "deadline_value" for d in errors), (
        f"Expected deadline_value defect. Got: {[d.column for d in errors]}"
    )
    assert len(result.valid) == 0


def test_catches_deadline_value_zero_when_unit_is_business_days(
    first_raw_row: RawObligationRow,
) -> None:
    """deadline_value must be > 0 for temporal units."""
    bad_row = _mutate(
        first_raw_row,
        deadline_unit=DeadlineUnit.BUSINESS_DAYS.value,
        deadline_value=0,
    )
    result = validate([bad_row])
    errors = [d for d in result.defects if d.severity == "error"]
    assert any(d.column == "deadline_value" for d in errors), (
        f"Expected deadline_value defect. Got: {[d.column for d in errors]}"
    )


# ── overlay_of cross-reference ────────────────────────────────────────────


def test_catches_overlay_of_pointing_to_nonexistent_obligation(
    first_raw_row: RawObligationRow,
) -> None:
    """overlay_of must reference an obligation_id that exists in the same library."""
    bad_row = _mutate(
        first_raw_row,
        overlay_of="UK-DISP-999",  # Does not exist in a single-row library
    )
    result = validate([bad_row])
    errors = [d for d in result.defects if d.severity == "error"]
    assert any(d.column == "overlay_of" for d in errors), (
        f"Expected overlay_of defect. Got: {[d.column for d in errors]}"
    )
    assert len(result.valid) == 0


def test_overlay_of_is_valid_when_referenced_id_exists(
    approved_raw_rows: list[RawObligationRow],
) -> None:
    """overlay_of is valid when it references an obligation_id in the same list."""
    # Find any row that already has overlay_of set in the real library,
    # or construct a two-row list where one references the other.
    first = approved_raw_rows[0]
    second = approved_raw_rows[1] if len(approved_raw_rows) > 1 else first

    # Make first row reference the second via overlay_of
    modified = _mutate(first, overlay_of=second.obligation_id)
    result = validate([modified, second])

    overlay_errors = [
        d for d in result.defects
        if d.severity == "error" and d.column == "overlay_of"
        and d.obligation_id == modified.obligation_id
    ]
    assert len(overlay_errors) == 0, (
        f"Expected no overlay_of errors when target exists. Got: {overlay_errors}"
    )


# ── Framework prefix mismatch ─────────────────────────────────────────────


def test_catches_framework_not_matching_obligation_id_prefix(
    first_raw_row: RawObligationRow,
) -> None:
    """framework column must match the FRAMEWORK segment in the obligation_id."""
    # obligation_id like 'UK-DISP-001' implies framework='DISP'
    # Force a mismatch:
    bad_row = _mutate(first_raw_row, framework="CONC")
    # Ensure obligation_id has DISP prefix (use as-is, it should already be DISP)
    if not first_raw_row.obligation_id.startswith("UK-DISP"):
        pytest.skip("First row is not a DISP obligation; test is not applicable")

    result = validate([bad_row])
    errors = [d for d in result.defects if d.severity == "error"]
    assert any(d.column == "framework" for d in errors), (
        f"Expected framework defect. Got: {[d.column for d in errors]}"
    )
    assert len(result.valid) == 0


# ── Valid single-row construction ─────────────────────────────────────────


def test_single_valid_row_produces_obligation_row(
    first_raw_row: RawObligationRow,
) -> None:
    """A single valid raw row produces exactly one ObligationRow, no defects."""
    result = validate([first_raw_row])
    errors = [d for d in result.defects if d.severity == "error"]
    assert len(errors) == 0, (
        f"Expected zero errors. Got: {[d.message for d in errors]}"
    )
    assert len(result.valid) == 1
    assert isinstance(result.valid[0], ObligationRow)
    assert result.valid[0].obligation_id == first_raw_row.obligation_id


# ── Empty input ───────────────────────────────────────────────────────────


def test_validate_empty_input() -> None:
    """validate([]) returns empty valid and empty defects."""
    result = validate([])
    assert result.valid == []
    assert result.defects == []


# ── Row excluded on error, included on warning ────────────────────────────


def test_row_with_error_defect_excluded_from_valid(
    first_raw_row: RawObligationRow,
) -> None:
    """A row with any error-level defect must not appear in valid."""
    bad = _mutate(first_raw_row, trigger_condition="!!invalid!!")
    result = validate([bad])
    assert len(result.valid) == 0
    assert len(result.defects) > 0


# ── Library-wide regression guard ─────────────────────────────────────────

LIBRARY_FIXTURE = Path(__file__).parent / "fixtures" / "Nuqe_Obligation_Library.xlsx"


@pytest.mark.skipif(
    not LIBRARY_FIXTURE.exists(),
    reason="Obligation library fixture not present",
)
def test_every_approved_row_parses_in_full() -> None:
    """
    Every approved row in the obligation library must parse without any
    error-level defect.

    This is the library-wide regression guard: if any obligation's
    trigger_condition, deadline expression, or structured field causes a
    parse failure, this test catches it before the engine ever sees the row.
    """
    raw_rows = load_library(LIBRARY_FIXTURE, approved_only=True)
    result = validate(raw_rows)

    errors = [d for d in result.defects if d.severity == "error"]
    if errors:
        lines = "\n".join(
            f"  Row {d.row_number} [{d.obligation_id}] {d.column}: {d.message}"
            for d in errors
        )
        pytest.fail(
            f"{len(errors)} obligation(s) have parse/validation errors:\n{lines}"
        )
