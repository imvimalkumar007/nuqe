"""Tests for nuqe_engine.trigger (M4)."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from uuid import UUID, uuid4

import pytest

from nuqe_engine.schema import (
    BreachConsequence,
    CustomerSegment,
    DeadlineAnchor,
    DeadlineUnit,
    Evidence,
    EvidenceLocation,
    EvidenceType,
    Framework,
    Jurisdiction,
    ObligationRow,
    ProductType,
    ProvisionType,
    Regulator,
    Requirement,
    RequirementAction,
    ReviewStatus,
    TriggerCondition,
    TriggerEvent,
)
from nuqe_engine.trigger import (
    Event,
    ExpressionError,
    FiredObligation,
    evaluate_expression,
    find_fired_obligations,
)

UTC = timezone.utc


# ── Fixtures ───────────────────────────────────────────────────────────────


def _make_obligation(
    obligation_id: str = "UK-CD-001",
    event: TriggerEvent = TriggerEvent.COMPLAINT_RECEIVED,
    conditions: str = "true",
    exclusions: str = "null",
    deadline_unit: DeadlineUnit = DeadlineUnit.NONE,
    deadline_value: int | None = None,
) -> ObligationRow:
    """Build a minimal valid ObligationRow for testing."""
    return ObligationRow.model_validate({
        "obligation_id": obligation_id,
        "obligation_name": "Test obligation for unit tests",
        "jurisdiction": Jurisdiction.UK,
        "regulator": Regulator.FCA,
        "framework": Framework.CONSUMER_DUTY,
        "source_document": "FCA DISP 1.3",
        "source_url": "https://www.handbook.fca.org.uk/handbook/DISP/1/3.html",
        "source_provision_type": ProvisionType.RULE,
        "product_types": [ProductType.LOAN],
        "customer_segments": [CustomerSegment.RETAIL],
        "trigger_condition": TriggerCondition(
            event=event,
            conditions=conditions,
            exclusions=exclusions,
        ),
        "requirement": Requirement(
            action=RequirementAction.SEND_COMMUNICATION,
            action_parameters={},
            assertion="Communication sent to customer within required period.",
        ),
        "deadline_value": deadline_value,
        "deadline_unit": deadline_unit,
        "deadline_anchor": DeadlineAnchor.COMPLAINT_RECEIVED,
        "evidence_required": [
            Evidence(
                type=EvidenceType.COMMUNICATION,
                location=EvidenceLocation.COMMUNICATIONS_TABLE,
                selector="case_id == {case_id}",
                retention_years=6,
            )
        ],
        "breach_consequence": BreachConsequence.REGULATORY_REFERRAL,
        "exceptions": [],
        "overlay_of": None,
        "supersedes": None,
        "effective_from": date(2024, 7, 31),
        "effective_to": None,
        "version": "1.0.0",
        "review_status": ReviewStatus.APPROVED,
    })


def _make_event(
    event: TriggerEvent = TriggerEvent.COMPLAINT_RECEIVED,
    context: dict | None = None,
) -> Event:
    return Event(
        event=event,
        case_id=UUID("00000000-0000-0000-0000-000000000001"),
        occurred_at=datetime(2026, 1, 7, 9, 0, 0, tzinfo=UTC),
        context=context or {},
    )


# ── evaluate_expression: sentinel values ──────────────────────────────────


def test_null_sentinel_returns_false() -> None:
    """The string 'null' evaluates to False (no exclusion)."""
    assert evaluate_expression("null", {}) is False


def test_false_sentinel_returns_false() -> None:
    """The string 'false' evaluates to False (no exclusion)."""
    assert evaluate_expression("false", {}) is False


def test_empty_string_returns_false() -> None:
    """An empty expression evaluates to False."""
    assert evaluate_expression("", {}) is False


def test_whitespace_only_returns_false() -> None:
    """Whitespace-only expression evaluates to False."""
    assert evaluate_expression("   ", {}) is False


# ── evaluate_expression: literals ─────────────────────────────────────────


def test_true_literal() -> None:
    assert evaluate_expression("true", {}) is True


def test_string_equality_match() -> None:
    assert evaluate_expression("case.type == 'complaint'", {"case": {"type": "complaint"}}) is True


def test_string_equality_no_match() -> None:
    assert evaluate_expression("case.type == 'complaint'", {"case": {"type": "enquiry"}}) is False


def test_string_inequality() -> None:
    assert evaluate_expression("case.type != 'complaint'", {"case": {"type": "enquiry"}}) is True


def test_double_quoted_string() -> None:
    assert evaluate_expression('case.type == "complaint"', {"case": {"type": "complaint"}}) is True


# ── evaluate_expression: numeric comparisons ──────────────────────────────


def test_numeric_equality() -> None:
    assert evaluate_expression("amount == 100", {"amount": 100}) is True


def test_numeric_less_than() -> None:
    assert evaluate_expression("amount < 500", {"amount": 100}) is True


def test_numeric_less_than_or_equal() -> None:
    assert evaluate_expression("amount <= 100", {"amount": 100}) is True


def test_numeric_greater_than() -> None:
    assert evaluate_expression("amount > 50", {"amount": 100}) is True


def test_numeric_greater_than_or_equal() -> None:
    assert evaluate_expression("amount >= 100", {"amount": 100}) is True


def test_numeric_less_than_false() -> None:
    assert evaluate_expression("amount < 50", {"amount": 100}) is False


# ── evaluate_expression: dotted path resolution ───────────────────────────


def test_dotted_path_two_levels() -> None:
    assert evaluate_expression(
        "customer.segment == 'retail'",
        {"customer": {"segment": "retail"}},
    ) is True


def test_dotted_path_three_levels() -> None:
    assert evaluate_expression(
        "firm.permissions.regulated == true",
        {"firm": {"permissions": {"regulated": True}}},
    ) is True


def test_missing_path_returns_false_for_equality() -> None:
    """A missing path resolves to None; None == anything returns False."""
    assert evaluate_expression("case.missing_field == 'value'", {}) is False


def test_missing_path_returns_true_for_inequality() -> None:
    """None != a non-None value returns True."""
    assert evaluate_expression("case.missing_field != 'value'", {}) is True


def test_missing_path_ordering_raises() -> None:
    """None with < raises ExpressionError."""
    with pytest.raises(ExpressionError, match="null"):
        evaluate_expression("case.missing_field < 100", {})


# ── evaluate_expression: IN / NOT IN ──────────────────────────────────────


def test_in_bracket_list() -> None:
    assert evaluate_expression(
        "case.type IN ['complaint', 'dispute']",
        {"case": {"type": "complaint"}},
    ) is True


def test_in_paren_list() -> None:
    """IN with parentheses (actual library format)."""
    assert evaluate_expression(
        "case.type IN ('complaint', 'dispute')",
        {"case": {"type": "complaint"}},
    ) is True


def test_in_no_match() -> None:
    assert evaluate_expression(
        "case.type IN ('complaint', 'dispute')",
        {"case": {"type": "enquiry"}},
    ) is False


def test_not_in_list() -> None:
    assert evaluate_expression(
        "case.type NOT IN ('enquiry',)",
        {"case": {"type": "complaint"}},
    ) is True


def test_not_in_match_returns_false() -> None:
    assert evaluate_expression(
        "case.type NOT IN ('complaint', 'dispute')",
        {"case": {"type": "complaint"}},
    ) is False


def test_in_null_path_returns_false() -> None:
    """None IN list returns False."""
    assert evaluate_expression("missing IN ('a', 'b')", {}) is False


def test_not_in_null_path_returns_true() -> None:
    """None NOT IN list returns True (None is not a member)."""
    assert evaluate_expression("missing NOT IN ('a', 'b')", {}) is True


# ── evaluate_expression: AND / OR / NOT ──────────────────────────────────


def test_and_both_true() -> None:
    assert evaluate_expression(
        "case.type == 'complaint' AND customer.segment == 'retail'",
        {"case": {"type": "complaint"}, "customer": {"segment": "retail"}},
    ) is True


def test_and_one_false() -> None:
    assert evaluate_expression(
        "case.type == 'complaint' AND customer.segment == 'business'",
        {"case": {"type": "complaint"}, "customer": {"segment": "retail"}},
    ) is False


def test_or_first_true() -> None:
    assert evaluate_expression(
        "case.type == 'complaint' OR case.type == 'dispute'",
        {"case": {"type": "complaint"}},
    ) is True


def test_or_second_true() -> None:
    assert evaluate_expression(
        "case.type == 'dispute' OR case.type == 'complaint'",
        {"case": {"type": "complaint"}},
    ) is True


def test_or_both_false() -> None:
    assert evaluate_expression(
        "case.type == 'dispute' OR case.type == 'enquiry'",
        {"case": {"type": "complaint"}},
    ) is False


def test_not_negates() -> None:
    assert evaluate_expression(
        "NOT case.type == 'enquiry'",
        {"case": {"type": "complaint"}},
    ) is True


def test_not_false_gives_true() -> None:
    assert evaluate_expression("NOT false", {}) is True


def test_complex_and_or_expression() -> None:
    ctx = {
        "case": {"type": "complaint", "value": 200},
        "customer": {"segment": "retail"},
    }
    expr = (
        "case.type == 'complaint' AND "
        "(customer.segment == 'retail' OR case.value > 500)"
    )
    assert evaluate_expression(expr, ctx) is True


# ── evaluate_expression: short-circuit behaviour ─────────────────────────


def test_and_short_circuits_on_false(caplog: pytest.LogCaptureFixture) -> None:
    """AND stops at first False; second branch is not evaluated."""
    # If short-circuit works, the missing path on the right is never reached
    # (and no ordering error should bubble up).
    result = evaluate_expression(
        "case.type == 'enquiry' AND case.missing_field < 100",
        {"case": {"type": "complaint"}},
    )
    assert result is False


def test_or_short_circuits_on_true() -> None:
    """OR stops at first True; the second branch (with a potential error) is skipped."""
    result = evaluate_expression(
        "case.type == 'complaint' OR case.missing_field < 100",
        {"case": {"type": "complaint"}},
    )
    assert result is True


# ── evaluate_expression: parenthesised grouping ──────────────────────────


def test_parentheses_change_precedence() -> None:
    ctx = {"a": 1, "b": 2, "c": 3}
    # Without parens: a==1 AND b==2 OR c==99 = (True AND True) OR False = True
    # With parens: a==1 AND (b==99 OR c==3) = True AND (False OR True) = True
    assert evaluate_expression("a == 1 AND (b == 99 OR c == 3)", ctx) is True
    assert evaluate_expression("(a == 99 OR b == 2) AND c == 3", ctx) is True
    assert evaluate_expression("(a == 99 OR b == 99) AND c == 3", ctx) is False


# ── evaluate_expression: error cases ─────────────────────────────────────


def test_unterminated_string_raises() -> None:
    with pytest.raises(ExpressionError, match="Unterminated"):
        evaluate_expression("case.type == 'complaint", {})


def test_unexpected_character_raises() -> None:
    with pytest.raises(ExpressionError, match="Unexpected character"):
        evaluate_expression("case.type == @bad", {})


def test_incomplete_expression_raises() -> None:
    with pytest.raises(ExpressionError):
        evaluate_expression("case.type ==", {})


# ── find_fired_obligations: event matching ────────────────────────────────


def test_matching_event_fires_obligation() -> None:
    obl = _make_obligation(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        conditions="true",
    )
    event = _make_event(TriggerEvent.COMPLAINT_RECEIVED)
    result = find_fired_obligations(event, [obl])
    assert len(result) == 1
    assert result[0].obligation.obligation_id == "UK-CD-001"
    assert result[0].trigger_event == TriggerEvent.COMPLAINT_RECEIVED


def test_wrong_event_does_not_fire() -> None:
    obl = _make_obligation(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        conditions="true",
    )
    event = _make_event(TriggerEvent.CASE_OPENED)
    result = find_fired_obligations(event, [obl])
    assert result == []


def test_empty_obligations_returns_empty() -> None:
    event = _make_event(TriggerEvent.COMPLAINT_RECEIVED)
    result = find_fired_obligations(event, [])
    assert result == []


# ── find_fired_obligations: conditions evaluation ────────────────────────


def test_conditions_false_does_not_fire() -> None:
    obl = _make_obligation(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        conditions="case.type == 'dispute'",
    )
    event = _make_event(
        TriggerEvent.COMPLAINT_RECEIVED,
        context={"case": {"type": "complaint"}},
    )
    result = find_fired_obligations(event, [obl])
    assert result == []


def test_conditions_true_with_context_fires() -> None:
    obl = _make_obligation(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        conditions="case.type == 'complaint'",
    )
    event = _make_event(
        TriggerEvent.COMPLAINT_RECEIVED,
        context={"case": {"type": "complaint"}},
    )
    result = find_fired_obligations(event, [obl])
    assert len(result) == 1


# ── find_fired_obligations: exclusions suppression ───────────────────────


def test_exclusions_true_suppresses_obligation() -> None:
    obl = _make_obligation(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        conditions="true",
        exclusions="case.exempt == true",
    )
    event = _make_event(
        TriggerEvent.COMPLAINT_RECEIVED,
        context={"case": {"exempt": True}},
    )
    result = find_fired_obligations(event, [obl])
    assert result == []


def test_exclusions_false_does_not_suppress() -> None:
    obl = _make_obligation(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        conditions="true",
        exclusions="case.exempt == true",
    )
    event = _make_event(
        TriggerEvent.COMPLAINT_RECEIVED,
        context={"case": {"exempt": False}},
    )
    result = find_fired_obligations(event, [obl])
    assert len(result) == 1


def test_exclusions_null_sentinel_does_not_suppress() -> None:
    obl = _make_obligation(
        event=TriggerEvent.COMPLAINT_RECEIVED,
        conditions="true",
        exclusions="null",
    )
    event = _make_event(TriggerEvent.COMPLAINT_RECEIVED)
    result = find_fired_obligations(event, [obl])
    assert len(result) == 1


# ── find_fired_obligations: multiple obligations ──────────────────────────


def test_multiple_obligations_correct_subset_fires() -> None:
    obl_complaint = _make_obligation(
        obligation_id="UK-CD-001",
        event=TriggerEvent.COMPLAINT_RECEIVED,
        conditions="true",
    )
    obl_case = _make_obligation(
        obligation_id="UK-CD-002",
        event=TriggerEvent.CASE_OPENED,
        conditions="true",
    )
    obl_complaint2 = _make_obligation(
        obligation_id="UK-CD-003",
        event=TriggerEvent.COMPLAINT_RECEIVED,
        conditions="case.value > 1000",
    )

    ctx = {"case": {"value": 500}}
    event = _make_event(TriggerEvent.COMPLAINT_RECEIVED, context=ctx)
    result = find_fired_obligations(event, [obl_complaint, obl_case, obl_complaint2])

    fired_ids = {r.obligation.obligation_id for r in result}
    assert fired_ids == {"UK-CD-001"}


def test_all_matching_obligations_fire() -> None:
    obls = [
        _make_obligation(
            obligation_id=f"UK-CD-{i:03d}",
            event=TriggerEvent.COMPLAINT_RECEIVED,
            conditions="true",
        )
        for i in range(1, 4)
    ]
    event = _make_event(TriggerEvent.COMPLAINT_RECEIVED)
    result = find_fired_obligations(event, obls)
    assert len(result) == 3


# ── find_fired_obligations: FiredObligation fields ────────────────────────


def test_fired_obligation_matched_at_equals_event_occurred_at() -> None:
    obl = _make_obligation(event=TriggerEvent.COMPLAINT_RECEIVED, conditions="true")
    event = _make_event(TriggerEvent.COMPLAINT_RECEIVED)
    result = find_fired_obligations(event, [obl])
    assert len(result) == 1
    assert result[0].matched_at == event.occurred_at


def test_fired_obligation_trigger_event_field() -> None:
    obl = _make_obligation(event=TriggerEvent.CASE_OPENED, conditions="true")
    event = _make_event(TriggerEvent.CASE_OPENED)
    result = find_fired_obligations(event, [obl])
    assert result[0].trigger_event == TriggerEvent.CASE_OPENED


# ── find_fired_obligations: error resilience ──────────────────────────────


def test_bad_conditions_expression_skipped_with_warning(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """An obligation with an unparseable conditions expression is skipped, not crashed."""
    obl_bad = _make_obligation(
        obligation_id="UK-CD-001",
        event=TriggerEvent.COMPLAINT_RECEIVED,
        conditions="case.type == @INVALID",
    )
    obl_good = _make_obligation(
        obligation_id="UK-CD-002",
        event=TriggerEvent.COMPLAINT_RECEIVED,
        conditions="true",
    )
    event = _make_event(TriggerEvent.COMPLAINT_RECEIVED)
    with caplog.at_level(logging.WARNING, logger="nuqe_engine.trigger"):
        result = find_fired_obligations(event, [obl_bad, obl_good])

    # Good obligation still fires
    assert len(result) == 1
    assert result[0].obligation.obligation_id == "UK-CD-002"
    # Warning was logged for the bad one
    assert any("UK-CD-001" in r.message for r in caplog.records)


def test_bad_exclusions_expression_skipped_with_warning(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """An obligation with a bad exclusions expression is skipped safely."""
    obl_bad = _make_obligation(
        obligation_id="UK-CD-001",
        event=TriggerEvent.COMPLAINT_RECEIVED,
        conditions="true",
        exclusions="case.type == @INVALID",
    )
    event = _make_event(TriggerEvent.COMPLAINT_RECEIVED)
    with caplog.at_level(logging.WARNING, logger="nuqe_engine.trigger"):
        result = find_fired_obligations(event, [obl_bad])

    assert result == []
    assert any("UK-CD-001" in r.message for r in caplog.records)


# ── evaluate_expression: null == null ────────────────────────────────────


def test_null_equals_null_is_true() -> None:
    """null == null is True per spec."""
    assert evaluate_expression("null == null", {}) is True


def test_null_not_equals_string_is_true() -> None:
    assert evaluate_expression("null != 'something'", {}) is True


def test_null_equals_string_is_false() -> None:
    assert evaluate_expression("null == 'something'", {}) is False


# ── evaluate_expression: float numbers ───────────────────────────────────


def test_float_comparison() -> None:
    assert evaluate_expression("score >= 0.5", {"score": 0.75}) is True


def test_float_equality() -> None:
    assert evaluate_expression("score == 1.0", {"score": 1.0}) is True
