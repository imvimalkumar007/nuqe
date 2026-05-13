"""Tests for nuqe_engine.loader (M1)."""

from __future__ import annotations

from pathlib import Path

import pytest

from nuqe_engine.loader import LoaderError, load_all_statuses, load_library
from nuqe_engine.schema import ReviewStatus


def test_load_library_returns_only_approved_by_default(library_path: Path) -> None:
    rows = load_library(library_path)
    assert len(rows) > 0
    for r in rows:
        assert r.review_status == ReviewStatus.APPROVED.value


def test_load_library_can_return_all_statuses(library_path: Path) -> None:
    all_rows = load_library(library_path, approved_only=False)
    approved_rows = load_library(library_path, approved_only=True)
    assert len(all_rows) >= len(approved_rows)


def test_load_library_loads_expected_count(library_path: Path) -> None:
    """The current library should have 141 approved rows (May 2026 milestone)."""
    rows = load_library(library_path)
    assert len(rows) == 141, (
        f"Expected 141 approved rows per the F1 milestone snapshot. "
        f"Got {len(rows)}. If the library has grown, update this assertion "
        f"intentionally."
    )


def test_load_library_obligation_id_format(library_path: Path) -> None:
    """Every obligation_id must match JURIS-FRAMEWORK-NNN."""
    import re

    pattern = re.compile(r"^[A-Z]{2,3}-[A-Z_]{2,20}-\d{3}$")
    rows = load_library(library_path)
    for r in rows:
        assert pattern.match(r.obligation_id), (
            f"Bad obligation_id format: {r.obligation_id}"
        )


def test_load_library_source_row_provenance(library_path: Path) -> None:
    """Each loaded row carries its source spreadsheet row number."""
    rows = load_library(library_path)
    for r in rows:
        assert r._source_row_number >= 2  # type: ignore[attr-defined]


def test_load_library_missing_file_raises() -> None:
    with pytest.raises(LoaderError, match="not found"):
        load_library("/nonexistent/path/library.xlsx")


def test_load_library_bad_sheet_name_raises(library_path: Path) -> None:
    with pytest.raises(LoaderError, match="not found in"):
        load_library(library_path, sheet_name="no_such_sheet")


def test_load_all_statuses_groups_correctly(library_path: Path) -> None:
    grouped = load_all_statuses(library_path)
    # Every key in the result is a valid review_status
    for status in grouped:
        assert status in {s.value for s in ReviewStatus}
    # The total count across statuses matches the all-status load
    all_rows = load_library(library_path, approved_only=False)
    total = sum(len(v) for v in grouped.values())
    assert total == len(all_rows)


def test_load_library_review_status_breakdown(library_path: Path) -> None:
    """At the F1 milestone, expected breakdown: 141 approved, 12 peer_review, 0 draft."""
    grouped = load_all_statuses(library_path)
    assert len(grouped[ReviewStatus.APPROVED.value]) == 141
    assert len(grouped[ReviewStatus.PEER_REVIEW.value]) == 12
    assert len(grouped[ReviewStatus.DRAFT.value]) == 0
