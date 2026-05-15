"""Tests for nuqe_engine.deadline (M7)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from nuqe_engine.deadline import (
    add_business_days,
    calculate_deadline,
    deadline_status,
)
from nuqe_engine.loader import load_library
from nuqe_engine.schema import DeadlineUnit
from nuqe_engine.validator import validate

UTC = UTC


# ── Helpers ───────────────────────────────────────────────────────────────


def dt(date_str: str) -> datetime:
    """Parse an ISO date string to a UTC-aware datetime at midnight."""
    return datetime.fromisoformat(date_str).replace(tzinfo=UTC)


def dth(date_str: str, hour: int, minute: int = 0) -> datetime:
    """Parse a date string and set a specific time, UTC-aware."""
    return datetime.fromisoformat(date_str).replace(
        hour=hour, minute=minute, tzinfo=UTC
    )


# ── add_business_days ─────────────────────────────────────────────────────


def test_calendar_days_three_from_wednesday() -> None:
    """3 calendar_days from Wednesday 2026-01-07 = Saturday 2026-01-10."""
    # This is not add_business_days — just a reference for the parallel test
    start = dt("2026-01-07")
    result = start + timedelta(days=3)
    assert result.date().isoformat() == "2026-01-10"


def test_business_days_three_from_wednesday() -> None:
    """3 business_days from Wednesday 2026-01-07 = Monday 2026-01-12."""
    # Wed → Thu (1) → Fri (2) → skip Sat, skip Sun → Mon (3)
    start = dt("2026-01-07")
    result = add_business_days(start, 3)
    assert result.date().isoformat() == "2026-01-12"


def test_business_days_56_from_jan02_accounts_for_no_holidays_before_april() -> None:
    """
    56 business_days from 2026-01-02 (Friday).

    England & Wales bank holidays between Jan 2 and the result date: none
    (Good Friday is Apr 3, outside this window). So 56 business days lands on
    a plain weekday count: 11 weeks + 1 day after the first Monday (Jan 5).
    Expected: Monday 2026-03-23.
    """
    start = dt("2026-01-02")
    result = add_business_days(start, 56)
    assert result.date().isoformat() == "2026-03-23"


def test_hours_eight_from_morning() -> None:
    """8 hours from 2026-01-07 10:00 UTC = 2026-01-07 18:00 UTC."""
    start = dth("2026-01-07", 10)
    result = start + timedelta(hours=8)
    assert result.isoformat() == "2026-01-07T18:00:00+00:00"


def test_add_business_days_zero_returns_start() -> None:
    """add_business_days with 0 days returns the same datetime."""
    start = dt("2026-01-07")
    assert add_business_days(start, 0) == start


def test_add_business_days_requires_timezone_aware() -> None:
    """Naive datetimes must raise ValueError."""
    naive = datetime(2026, 1, 7, 12, 0, 0)
    with pytest.raises(ValueError, match="timezone-aware"):
        add_business_days(naive, 3)


def test_add_business_days_negative_raises() -> None:
    """Negative days must raise ValueError."""
    with pytest.raises(ValueError, match=">= 0"):
        add_business_days(dt("2026-01-07"), -1)


def test_good_friday_2026_skipped() -> None:
    """
    3 business_days from 2026-04-02 (Thursday) = 2026-04-09 (Thursday).

    Skips Good Friday (Apr 3), weekend (Apr 4-5), Easter Monday (Apr 6).
    Day 1 = Tue Apr 7, Day 2 = Wed Apr 8, Day 3 = Thu Apr 9.
    """
    start = dt("2026-04-02")
    result = add_business_days(start, 3)
    assert result.date().isoformat() == "2026-04-09", (
        f"Expected 2026-04-09, got {result.date().isoformat()}"
    )


def test_good_friday_is_recognised_as_holiday() -> None:
    """2026-04-03 (Good Friday) is a bank holiday in England & Wales."""
    import holidays as hols
    eng = hols.country_holidays("GB", subdiv="ENG", years=2026)
    assert datetime(2026, 4, 3).date() in eng


# ── calculate_deadline ────────────────────────────────────────────────────


@pytest.fixture
def validated_obligations(library_path: Path) -> list:
    """All validated ObligationRows from the real library."""
    raw = load_library(library_path, approved_only=True)
    result = validate(raw)
    return result.valid


def _find_obligation(obligations: list, obligation_id: str):  # type: ignore[return]
    for o in obligations:
        if o.obligation_id == obligation_id:
            return o
    pytest.skip(f"{obligation_id} not found in validated library")


def test_deadline_unit_none_returns_no_due_at(
    validated_obligations: list,
) -> None:
    """An obligation with deadline_unit='none' returns due_at=None."""
    none_obls = [o for o in validated_obligations if o.deadline_unit == DeadlineUnit.NONE]
    if not none_obls:
        pytest.skip("No 'none' deadline obligations in library")
    obl = none_obls[0]
    anchor = dt("2026-01-07")
    result = calculate_deadline(obl, anchor)
    assert result.due_at is None
    assert result.deadline_unit == DeadlineUnit.NONE


def test_real_business_days_obligation_computes_correctly(
    validated_obligations: list,
) -> None:
    """
    A real business_days obligation from the library produces a sane result.

    Finds the first obligation with deadline_unit=BUSINESS_DAYS, calculates
    its deadline from a known Wednesday anchor, and verifies the result lands
    on a weekday at least N calendar days later (i.e. business-day arithmetic
    was applied, not simple day addition).
    """
    biz_obls = [
        o for o in validated_obligations
        if o.deadline_unit == DeadlineUnit.BUSINESS_DAYS
    ]
    if not biz_obls:
        pytest.skip("No BUSINESS_DAYS obligations in library")

    obl = biz_obls[0]
    assert obl.deadline_value is not None
    anchor = dt("2026-01-07")  # Wednesday — a good baseline with no nearby holidays
    result = calculate_deadline(obl, anchor)

    assert result.due_at is not None
    # due_at must be strictly after anchor
    assert result.due_at > anchor
    # due_at must land on a weekday (0=Mon … 4=Fri)
    assert result.due_at.weekday() < 5, (
        f"Business day result landed on a weekend: {result.due_at}"
    )
    # due_at must be at least deadline_value calendar days after anchor
    # (business days always >= calendar days for positive N)
    assert result.due_at >= anchor + timedelta(days=obl.deadline_value)


def test_calculate_deadline_calendar_days(validated_obligations: list) -> None:
    """calendar_days obligation: due_at = anchor + N days, time preserved."""
    cal_obls = [
        o for o in validated_obligations
        if o.deadline_unit == DeadlineUnit.CALENDAR_DAYS
    ]
    if not cal_obls:
        pytest.skip("No calendar_days obligations in library")
    obl = cal_obls[0]
    anchor = dth("2026-02-01", 9, 30)
    result = calculate_deadline(obl, anchor)
    assert result.due_at is not None
    expected = anchor + timedelta(days=obl.deadline_value)  # type: ignore[arg-type]
    assert result.due_at == expected


def test_calculate_deadline_requires_timezone_aware(
    validated_obligations: list,
) -> None:
    """Naive anchor_event_at raises ValueError."""
    obl = validated_obligations[0]
    naive = datetime(2026, 1, 7, 12, 0, 0)
    with pytest.raises(ValueError, match="timezone-aware"):
        calculate_deadline(obl, naive)


def test_calculate_deadline_result_is_timezone_aware(
    validated_obligations: list,
) -> None:
    """Output due_at is timezone-aware when input is."""
    non_none = [o for o in validated_obligations if o.deadline_unit != DeadlineUnit.NONE]
    obl = non_none[0]
    anchor = dt("2026-01-07")
    result = calculate_deadline(obl, anchor)
    if result.due_at is not None:
        assert result.due_at.tzinfo is not None


# ── deadline_status ───────────────────────────────────────────────────────


def test_status_irrelevant_when_due_at_is_none() -> None:
    """No deadline → irrelevant regardless of as_of."""
    assert deadline_status(None, dt("2026-06-01"), None) == "irrelevant"
    assert deadline_status(None, dt("2026-06-01"), dt("2026-05-01")) == "irrelevant"


def test_status_met_when_satisfied_before_due() -> None:
    """satisfied_at <= due_at → met."""
    due = dt("2026-01-14")
    satisfied = dt("2026-01-13")
    assert deadline_status(due, dt("2026-01-20"), satisfied) == "met"


def test_status_met_when_satisfied_exactly_on_due() -> None:
    """satisfied_at == due_at → met (boundary: exactly on time is acceptable)."""
    due = dt("2026-01-14")
    assert deadline_status(due, dt("2026-01-20"), due) == "met"


def test_status_breached_when_satisfied_one_second_after_due() -> None:
    """satisfied_at one second after due_at → breached."""
    due = dt("2026-01-14")
    one_second_late = due + timedelta(seconds=1)
    assert deadline_status(due, dt("2026-01-20"), one_second_late) == "breached"


def test_status_pending_when_as_of_equals_due_and_not_satisfied() -> None:
    """as_of == due_at exactly and not satisfied → pending (firm still has that instant)."""
    due = dt("2026-01-14")
    assert deadline_status(due, due, None) == "pending"


def test_status_breached_when_as_of_one_second_after_due_not_satisfied() -> None:
    """as_of one second after due_at, not satisfied → breached."""
    due = dt("2026-01-14")
    one_second_late = due + timedelta(seconds=1)
    assert deadline_status(due, one_second_late, None) == "breached"


def test_status_pending_when_due_in_future() -> None:
    """due_at in the future, not satisfied → pending."""
    due = dt("2026-12-31")
    assert deadline_status(due, dt("2026-01-01"), None) == "pending"


def test_status_breached_when_overdue_and_not_satisfied() -> None:
    """due_at in the past, not satisfied → breached."""
    due = dt("2026-01-01")
    assert deadline_status(due, dt("2026-06-01"), None) == "breached"
