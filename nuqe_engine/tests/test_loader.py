"""Tests for nuqe_engine.loader (M1)."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest

from nuqe_engine.loader import LoaderError, load_all_statuses, load_library, load_library_from_bytes
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


# ── load_library_from_bytes (file-like / BytesIO branch) ──────────────────


def test_load_library_from_bytes_returns_approved(library_path: Path) -> None:
    """load_library_from_bytes produces the same approved rows as load_library."""
    xlsx_bytes = library_path.read_bytes()
    rows = load_library_from_bytes(xlsx_bytes, approved_only=True)
    assert len(rows) > 0
    for r in rows:
        assert r.review_status == ReviewStatus.APPROVED.value


def test_load_library_from_bytes_matches_file_load(library_path: Path) -> None:
    """Bytes and file-path paths return identical obligation_ids."""
    xlsx_bytes = library_path.read_bytes()
    from_bytes = load_library_from_bytes(xlsx_bytes, approved_only=True)
    from_file = load_library(library_path, approved_only=True)
    assert [r.obligation_id for r in from_bytes] == [r.obligation_id for r in from_file]


def test_load_library_from_bytes_approved_only_false(library_path: Path) -> None:
    """approved_only=False returns more rows than approved_only=True."""
    xlsx_bytes = library_path.read_bytes()
    all_rows = load_library_from_bytes(xlsx_bytes, approved_only=False)
    approved = load_library_from_bytes(xlsx_bytes, approved_only=True)
    assert len(all_rows) >= len(approved)


def test_load_library_from_bytes_bad_bytes_raises() -> None:
    """Non-xlsx bytes raise LoaderError."""
    with pytest.raises(LoaderError, match="stream"):
        load_library_from_bytes(b"not an xlsx file at all")


def test_load_library_via_bytesio_bad_sheet_raises(library_path: Path) -> None:
    """Bad sheet name with BytesIO raises LoaderError mentioning <bytes stream>."""
    xlsx_bytes = library_path.read_bytes()
    with pytest.raises(LoaderError, match="no_such_sheet"):
        load_library(BytesIO(xlsx_bytes), sheet_name="no_such_sheet")
