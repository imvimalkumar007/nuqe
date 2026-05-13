"""
M7: Deadline scheduler.

Given an ObligationRow and an anchor event timestamp, computes when the
deadline falls due. Handles three temporal units and the 'none' case.

Timezone behaviour:
    All inputs must be timezone-aware datetimes. Outputs are timezone-aware,
    preserving the timezone of the anchor_event_at input. Callers that supply
    naive datetimes will receive a ValueError. The default country uses
    England & Wales bank holidays (GB-ENG).

Business-day counting:
    A business day is any weekday that is not a public holiday in the given
    country/subdivision. The anchor date itself does not count: the first
    business day is the next qualifying weekday after the anchor.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Literal

import holidays
from pydantic import BaseModel

from nuqe_engine.schema import DeadlineAnchor, DeadlineUnit, ObligationRow

logger = logging.getLogger(__name__)


# ── Public models ─────────────────────────────────────────────────────────


class DeadlineCalculation(BaseModel):
    """Result of calculate_deadline()."""

    due_at: datetime | None  # None when deadline_unit is 'none'
    anchor_event_at: datetime
    deadline_value: int | None
    deadline_unit: DeadlineUnit
    deadline_anchor: DeadlineAnchor


# ── Holiday cache ─────────────────────────────────────────────────────────

# Cache HolidayBase objects by (country, subdiv, year) to avoid reconstructing
# them on every call to add_business_days.
_holiday_cache: dict[tuple[str, str | None, int], Any] = {}


def _get_holidays(country: str, subdiv: str | None, year: int) -> Any:
    key = (country, subdiv, year)
    if key not in _holiday_cache:
        _holiday_cache[key] = holidays.country_holidays(
            country, subdiv=subdiv, years=year
        )
    return _holiday_cache[key]


def _is_business_day(dt: datetime, country: str, subdiv: str | None) -> bool:
    """Return True if dt falls on a weekday that is not a public holiday."""
    if dt.weekday() >= 5:  # Saturday=5, Sunday=6
        return False
    h = _get_holidays(country, subdiv, dt.year)
    return dt.date() not in h


# ── Public functions ──────────────────────────────────────────────────────


def add_business_days(
    start: datetime,
    days: int,
    country: str = "GB-ENG",
) -> datetime:
    """
    Add N business days to start, skipping weekends and public holidays.

    Args:
        start: Timezone-aware anchor datetime. Time-of-day is preserved in
            the output (the result lands at the same time on the target date).
        days: Number of business days to add. Must be >= 0.
        country: Hyphen-separated country code and optional subdivision,
            e.g. 'GB-ENG' (England), 'GB-SCT' (Scotland). Defaults to
            England & Wales, which is the standard for UK FCA deadlines.

    Returns:
        A timezone-aware datetime N business days after start.

    Raises:
        ValueError: If start is not timezone-aware, or days < 0.
    """
    if start.tzinfo is None:
        raise ValueError("start must be a timezone-aware datetime")
    if days < 0:
        raise ValueError(f"days must be >= 0, got {days}")
    if days == 0:
        return start

    parts = country.split("-", 1)
    country_code = parts[0]
    subdiv: str | None = parts[1] if len(parts) > 1 else None

    current = start
    remaining = days
    while remaining > 0:
        current = current + timedelta(days=1)
        if _is_business_day(current, country_code, subdiv):
            remaining -= 1

    return current


def calculate_deadline(
    obligation: ObligationRow,
    anchor_event_at: datetime,
) -> DeadlineCalculation:
    """
    Compute the due_at timestamp for an obligation given its anchor event.

    Args:
        obligation: A validated ObligationRow.
        anchor_event_at: When the triggering event occurred. Must be
            timezone-aware.

    Returns:
        DeadlineCalculation. due_at is None when deadline_unit is 'none'.

    Raises:
        ValueError: If anchor_event_at is not timezone-aware.
    """
    if anchor_event_at.tzinfo is None:
        raise ValueError("anchor_event_at must be a timezone-aware datetime")

    unit = obligation.deadline_unit
    value = obligation.deadline_value

    if unit == DeadlineUnit.NONE:
        due_at = None
    elif unit == DeadlineUnit.CALENDAR_DAYS:
        assert value is not None, "deadline_value required for calendar_days (M2 validated)"
        due_at = anchor_event_at + timedelta(days=value)
    elif unit == DeadlineUnit.BUSINESS_DAYS:
        assert value is not None, "deadline_value required for business_days (M2 validated)"
        due_at = add_business_days(anchor_event_at, value)
    elif unit == DeadlineUnit.HOURS:
        assert value is not None, "deadline_value required for hours (M2 validated)"
        due_at = anchor_event_at + timedelta(hours=value)
    else:
        raise ValueError(f"Unknown deadline_unit: {unit!r}")

    return DeadlineCalculation(
        due_at=due_at,
        anchor_event_at=anchor_event_at,
        deadline_value=value,
        deadline_unit=unit,
        deadline_anchor=obligation.deadline_anchor,
    )


def deadline_status(
    due_at: datetime | None,
    as_of: datetime,
    satisfied_at: datetime | None,
) -> Literal["pending", "met", "breached", "irrelevant"]:
    """
    Determine the current status of a deadline.

    Rules:
        irrelevant  — due_at is None (obligation has no deadline)
        met         — satisfied_at is not None AND satisfied_at <= due_at
        breached    — satisfied_at is None AND as_of > due_at,
                      OR satisfied_at is not None AND satisfied_at > due_at
        pending     — due_at is in the future relative to as_of, and
                      the obligation has not yet been satisfied

    The boundary case where as_of == due_at exactly is treated as pending:
    the firm still has until that instant, not past it.

    Args:
        due_at: The computed deadline, or None for 'none' obligations.
        as_of: The reference point in time (typically now).
        satisfied_at: When the requirement was marked satisfied, or None.

    Returns:
        One of: 'irrelevant', 'met', 'breached', 'pending'.
    """
    if due_at is None:
        return "irrelevant"

    if satisfied_at is not None:
        return "met" if satisfied_at <= due_at else "breached"

    # Not yet satisfied
    return "breached" if as_of > due_at else "pending"
