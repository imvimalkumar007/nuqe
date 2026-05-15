"""Tests for nuqe_engine.requirement (M5)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path
from uuid import UUID, uuid4

import pytest

from nuqe_engine.requirement import (
    AssertionResult,
    RequirementRegistration,
    check_assertion,
    register_requirement,
)
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
from nuqe_engine.trigger import FiredObligation

UTC = UTC


# ── Fixtures ───────────────────────────────────────────────────────────────


def _make_obligation(
    assertion: str = "case.acknowledged == true",
    conditions: str = "true",
) -> ObligationRow:
    return ObligationRow.model_validate({
        "obligation_id": "UK-CD-001",
        "obligation_name": "Complaint acknowledgement obligation",
        "jurisdiction": Jurisdiction.UK,
        "regulator": Regulator.FCA,
        "framework": Framework.CONSUMER_DUTY,
        "source_document": "FCA DISP 1.6.1",
        "source_url": "https://www.handbook.fca.org.uk/handbook/DISP/1/6.html",
        "source_provision_type": ProvisionType.RULE,
        "product_types": [ProductType.LOAN],
        "customer_segments": [CustomerSegment.RETAIL],
        "trigger_condition": TriggerCondition(
            event=TriggerEvent.COMPLAINT_RECEIVED,
            conditions=conditions,
            exclusions="null",
        ),
        "requirement": Requirement(
            action=RequirementAction.SEND_COMMUNICATION,
            action_parameters={"template": "complaint_acknowledgement"},
            assertion=assertion,
        ),
        "deadline_value": 5,
        "deadline_unit": DeadlineUnit.BUSINESS_DAYS,
        "deadline_anchor": DeadlineAnchor.COMPLAINT_RECEIVED,
        "evidence_required": [
            Evidence(
                type=EvidenceType.COMMUNICATION,
                location=EvidenceLocation.COMMUNICATIONS_TABLE,
                selector="type == 'acknowledgement'",
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


def _make_fired(assertion: str = "case.acknowledged == true") -> FiredObligation:
    return FiredObligation(
        obligation=_make_obligation(assertion=assertion),
        matched_at=datetime(2026, 1, 7, 9, 0, 0, tzinfo=UTC),
        trigger_event=TriggerEvent.COMPLAINT_RECEIVED,
    )


# ── register_requirement ──────────────────────────────────────────────────


def test_register_returns_correct_action() -> None:
    fired = _make_fired()
    reg = register_requirement(fired)
    assert reg.action == RequirementAction.SEND_COMMUNICATION


def test_register_returns_correct_assertion() -> None:
    fired = _make_fired(assertion="case.acknowledged == true")
    reg = register_requirement(fired)
    assert reg.assertion == "case.acknowledged == true"


def test_register_returns_action_parameters() -> None:
    fired = _make_fired()
    reg = register_requirement(fired)
    assert reg.action_parameters == {"template": "complaint_acknowledgement"}


def test_register_generates_uuid_when_id_not_supplied() -> None:
    fired = _make_fired()
    reg = register_requirement(fired)
    assert isinstance(reg.fired_obligation_id, UUID)


def test_register_uses_supplied_fired_obligation_id() -> None:
    fired = _make_fired()
    fid = uuid4()
    reg = register_requirement(fired, fired_obligation_id=fid)
    assert reg.fired_obligation_id == fid


def test_register_is_requirement_registration_model() -> None:
    fired = _make_fired()
    reg = register_requirement(fired)
    assert isinstance(reg, RequirementRegistration)


# ── check_assertion: satisfied ────────────────────────────────────────────


def test_check_assertion_satisfied_returns_true() -> None:
    reg = RequirementRegistration(
        fired_obligation_id=uuid4(),
        action=RequirementAction.SEND_COMMUNICATION,
        action_parameters={},
        assertion="case.acknowledged == true",
    )
    result = check_assertion(reg, {"case": {"acknowledged": True}})
    assert result.satisfied is True
    assert result.failed_clause is None


def test_check_assertion_satisfied_result_has_evaluated_at() -> None:
    reg = RequirementRegistration(
        fired_obligation_id=uuid4(),
        action=RequirementAction.SEND_COMMUNICATION,
        action_parameters={},
        assertion="case.acknowledged == true",
    )
    result = check_assertion(reg, {"case": {"acknowledged": True}})
    assert result.evaluated_at.tzinfo is not None


# ── check_assertion: not satisfied ────────────────────────────────────────


def test_check_assertion_not_satisfied_returns_false() -> None:
    reg = RequirementRegistration(
        fired_obligation_id=uuid4(),
        action=RequirementAction.SEND_COMMUNICATION,
        action_parameters={},
        assertion="case.acknowledged == true",
    )
    result = check_assertion(reg, {"case": {"acknowledged": False}})
    assert result.satisfied is False


def test_check_assertion_failed_clause_is_whole_expression_for_single_clause() -> None:
    reg = RequirementRegistration(
        fired_obligation_id=uuid4(),
        action=RequirementAction.SEND_COMMUNICATION,
        action_parameters={},
        assertion="case.status == 'sent'",
    )
    result = check_assertion(reg, {"case": {"status": "pending"}})
    assert result.satisfied is False
    assert result.failed_clause is not None
    assert "case.status" in result.failed_clause


def test_check_assertion_identifies_failing_conjunct_in_and_expression() -> None:
    reg = RequirementRegistration(
        fired_obligation_id=uuid4(),
        action=RequirementAction.SEND_COMMUNICATION,
        action_parameters={},
        assertion="case.acknowledged == true AND case.status == 'sent'",
    )
    ctx = {"case": {"acknowledged": True, "status": "pending"}}
    result = check_assertion(reg, ctx)
    assert result.satisfied is False
    # The second conjunct failed — status is 'pending' not 'sent'
    assert result.failed_clause is not None
    assert "case.status" in result.failed_clause


def test_check_assertion_first_conjunct_fails() -> None:
    reg = RequirementRegistration(
        fired_obligation_id=uuid4(),
        action=RequirementAction.SEND_COMMUNICATION,
        action_parameters={},
        assertion="case.acknowledged == true AND case.status == 'sent'",
    )
    ctx = {"case": {"acknowledged": False, "status": "sent"}}
    result = check_assertion(reg, ctx)
    assert result.satisfied is False
    assert result.failed_clause is not None
    assert "case.acknowledged" in result.failed_clause


# ── check_assertion: natural language (non-DSL) ───────────────────────────


def test_check_assertion_natural_language_returns_false_with_manual_note() -> None:
    """Natural-language assertions cannot be auto-evaluated."""
    reg = RequirementRegistration(
        fired_obligation_id=uuid4(),
        action=RequirementAction.SEND_COMMUNICATION,
        action_parameters={},
        assertion=(
            "The firm has sent an acknowledgement letter to the customer "
            "within 5 business days of receiving the complaint."
        ),
    )
    result = check_assertion(reg, {})
    assert result.satisfied is False
    assert result.failed_clause is not None
    assert "manual verification" in result.failed_clause


def test_check_assertion_result_is_assertion_result_model() -> None:
    reg = RequirementRegistration(
        fired_obligation_id=uuid4(),
        action=RequirementAction.SEND_COMMUNICATION,
        action_parameters={},
        assertion="case.acknowledged == true",
    )
    result = check_assertion(reg, {"case": {"acknowledged": True}})
    assert isinstance(result, AssertionResult)


# ── Real obligation from library ──────────────────────────────────────────


def test_real_disp001_obligation_registers_and_checks(library_path: Path) -> None:
    """UK-DISP-001 (or first COMPLAINT_RECEIVED obligation) registers without error."""
    from nuqe_engine.loader import load_library
    from nuqe_engine.validator import validate

    raw = load_library(library_path, approved_only=True)
    result = validate(raw)
    complaint_obls = [
        o for o in result.valid
        if o.trigger_condition.event == TriggerEvent.COMPLAINT_RECEIVED
    ]
    if not complaint_obls:
        pytest.skip("No COMPLAINT_RECEIVED obligations in library")

    obl = complaint_obls[0]
    fired = FiredObligation(
        obligation=obl,
        matched_at=datetime(2026, 1, 7, 9, 0, 0, tzinfo=UTC),
        trigger_event=TriggerEvent.COMPLAINT_RECEIVED,
    )
    reg = register_requirement(fired)

    assert reg.action == obl.requirement.action
    assert reg.assertion == obl.requirement.assertion

    # check_assertion with empty context — real assertions are natural language,
    # so this returns satisfied=False with a manual-verification note (not a crash)
    ar = check_assertion(reg, {})
    assert isinstance(ar, AssertionResult)
    assert ar.evaluated_at.tzinfo is not None
