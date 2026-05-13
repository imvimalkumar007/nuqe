"""
Pydantic models for the Nuqe obligation library schema.

These models correspond exactly to the 24-column schema defined in the
Obligation Decomposition Method v0.1. Adding, renaming, or removing a column
is a Method version change.

Method reference: /Nuqe_Obligation_Decomposition_Method.docx Section 4.
"""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ── Controlled vocabularies (Method Section 9) ──────────────────────────


class Jurisdiction(str, Enum):
    UK = "UK"
    EU = "EU"
    IN = "IN"
    AU = "AU"
    GLOBAL = "global"


class Regulator(str, Enum):
    FCA = "FCA"
    FOS = "FOS"
    PRA = "PRA"
    RBI = "RBI"
    EBA = "EBA"
    ASIC = "ASIC"


class Framework(str, Enum):
    DISP = "DISP"
    CONC = "CONC"
    CCA = "CCA"
    BNPL = "BNPL"
    CONSUMER_DUTY = "CONSUMER_DUTY"
    PAYMENTS = "PAYMENTS"
    GDPR = "GDPR"
    DPDP = "DPDP"


class ProvisionType(str, Enum):
    RULE = "rule"
    GUIDANCE = "guidance"
    EVIDENTIAL_PROVISION = "evidential_provision"
    DIRECTION = "direction"


class ProductType(str, Enum):
    LOAN = "loan"
    CARD = "card"
    BNPL = "bnpl"
    CURRENT_ACCOUNT = "current_account"
    WALLET = "wallet"
    MORTGAGE = "mortgage"


class CustomerSegment(str, Enum):
    RETAIL = "retail"
    VULNERABLE = "vulnerable"
    SME = "sme"
    HIGH_NET_WORTH = "high_net_worth"
    ALL = "all"


class DeadlineUnit(str, Enum):
    CALENDAR_DAYS = "calendar_days"
    BUSINESS_DAYS = "business_days"
    HOURS = "hours"
    NONE = "none"


class DeadlineAnchor(str, Enum):
    CASE_OPENED = "case_opened"
    COMPLAINT_RECEIVED = "complaint_received"
    BREACH_DETECTED = "breach_detected"
    COMMUNICATION_SENT = "communication_sent"
    COMMUNICATION_RECEIVED = "communication_received"
    PAYMENT_DUE = "payment_due"
    STATUS_CHANGED = "status_changed"
    SCHEDULED_CHECK = "scheduled_check"


class BreachConsequence(str, Enum):
    REGULATORY_REFERRAL = "regulatory_referral"
    FINANCIAL_PENALTY = "financial_penalty"
    CUSTOMER_REMEDY = "customer_remedy"
    AUDIT_FINDING = "audit_finding"


class ReviewStatus(str, Enum):
    DRAFT = "draft"
    PEER_REVIEW = "peer_review"
    APPROVED = "approved"
    DEPRECATED = "deprecated"


class TriggerEvent(str, Enum):
    """Events that can fire an obligation. See Method Section 5."""

    CASE_OPENED = "case_opened"
    COMPLAINT_RECEIVED = "complaint_received"
    COMPLAINT_CLASSIFIED = "complaint_classified"
    COMMUNICATION_SENT = "communication_sent"
    COMMUNICATION_RECEIVED = "communication_received"
    DEADLINE_APPROACHING = "deadline_approaching"
    DEADLINE_BREACHED = "deadline_breached"
    STATUS_CHANGED = "status_changed"
    PAYMENT_DUE = "payment_due"
    SCHEDULED_CHECK = "scheduled_check"


class RequirementAction(str, Enum):
    """Actions a firm must take. See Method Section 6."""

    SEND_COMMUNICATION = "send_communication"
    DOCUMENT_ASSESSMENT = "document_assessment"
    CAPTURE_CONSENT = "capture_consent"
    PERFORM_CHECK = "perform_check"
    ESCALATE = "escalate"
    REFUND = "refund"
    SUSPEND_ACTIVITY = "suspend_activity"
    NOTIFY_REGULATOR = "notify_regulator"


class EvidenceType(str, Enum):
    """Evidence types. See Method Section 7."""

    COMMUNICATION = "communication"
    CASE_NOTE = "case_note"
    SYSTEM_RECORD = "system_record"
    DOCUMENT_UPLOAD = "document_upload"
    THIRD_PARTY_ATTESTATION = "third_party_attestation"
    PAYMENT_RECORD = "payment_record"


class EvidenceLocation(str, Enum):
    """Where evidence is stored. See Method Section 7."""

    COMMUNICATIONS_TABLE = "communications_table"
    CASE_NOTES_TABLE = "case_notes_table"
    DOCUMENT_STORE = "document_store"
    EXTERNAL_SYSTEM = "external_system"


# ── Sub-schemas inside the obligation row ───────────────────────────────


class TriggerCondition(BaseModel):
    """
    The trigger_condition column (column 11). Method Section 5.

    Parsed from the spreadsheet's free-text dict-like syntax. The validator
    module (M2) is responsible for parsing the original string into this model.
    """

    model_config = ConfigDict(extra="forbid")

    event: TriggerEvent
    conditions: str = Field(
        ...,
        description=(
            "Boolean expression over case, customer, product, and firm fields. "
            "Uses AND, OR, NOT, ==, !=, IN, NOT IN, comparison operators."
        ),
    )
    exclusions: str = Field(
        default="null",
        description="Boolean expression that, when true, suppresses the trigger.",
    )


class Requirement(BaseModel):
    """The requirement column (column 12). Method Section 6."""

    model_config = ConfigDict(extra="forbid")

    action: RequirementAction
    action_parameters: dict[str, Any] = Field(default_factory=dict)
    assertion: str = Field(
        ...,
        description="A testable statement that must be true after the action completes.",
    )


class Evidence(BaseModel):
    """One element of the evidence_required array (column 16). Method Section 7."""

    model_config = ConfigDict(extra="forbid")

    type: EvidenceType
    location: EvidenceLocation
    selector: str = Field(
        ...,
        description="How to identify the specific evidence row. Must resolve deterministically.",
    )
    retention_years: int = Field(..., ge=0, le=100)


class Exception_(BaseModel):
    """One element of the exceptions array (column 18). Method Section 8."""

    model_config = ConfigDict(extra="forbid")

    condition: str
    effect: str


# ── The 24-column obligation row ────────────────────────────────────────


class ObligationRow(BaseModel):
    """
    A single decomposed obligation, fully validated, ready for the engine.

    Maps 1:1 to a row in the obligation_library sheet, after parsing the
    structured sub-fields (trigger_condition, requirement, evidence_required,
    exceptions) from their spreadsheet representation.

    Cases bind to (obligation_id, version), not obligation_id alone. This is
    a locked architectural decision (Project Doc, decision 6).
    """

    model_config = ConfigDict(extra="forbid", use_enum_values=False)

    # Column 1
    obligation_id: str = Field(
        ...,
        pattern=r"^[A-Z]{2,3}-[A-Z_]{2,20}-\d{3}$",
        description="Stable identifier. Format JURIS-FRAMEWORK-NNN (e.g. UK-DISP-001).",
    )
    # Column 2
    obligation_name: str = Field(..., min_length=5, max_length=500)
    # Column 3
    jurisdiction: Jurisdiction
    # Column 4
    regulator: Regulator
    # Column 5
    framework: Framework
    # Column 6
    source_document: str = Field(..., min_length=5)
    # Column 7
    source_url: str = Field(..., min_length=5)
    # Column 8
    source_provision_type: ProvisionType
    # Column 9
    product_types: list[ProductType] = Field(..., min_length=1)
    # Column 10
    customer_segments: list[CustomerSegment] = Field(..., min_length=1)
    # Column 11 (parsed)
    trigger_condition: TriggerCondition
    # Column 12 (parsed)
    requirement: Requirement
    # Column 13
    deadline_value: int | None = Field(default=None, ge=0)
    # Column 14
    deadline_unit: DeadlineUnit
    # Column 15
    deadline_anchor: DeadlineAnchor
    # Column 16 (parsed)
    evidence_required: list[Evidence] = Field(..., min_length=1)
    # Column 17
    breach_consequence: BreachConsequence
    # Column 18 (parsed)
    exceptions: list[Exception_] = Field(default_factory=list)
    # Column 19
    overlay_of: str | None = Field(default=None)
    # Column 20
    supersedes: str | None = Field(default=None)
    # Column 21
    effective_from: date
    # Column 22
    effective_to: date | None = Field(default=None)
    # Column 23
    version: str = Field(..., pattern=r"^\d+\.\d+\.\d+$")
    # Column 24
    review_status: ReviewStatus

    @field_validator("deadline_value")
    @classmethod
    def deadline_value_required_when_unit_is_temporal(
        cls, v: int | None, info: Any
    ) -> int | None:
        """
        If deadline_unit is not 'none', deadline_value must be present and positive.
        If deadline_unit is 'none', deadline_value should be null.

        Cross-field validation runs in a model_validator, not field_validator,
        because field_validators can't see other fields reliably. We defer the
        cross-field rule to the validator module (M2).
        """
        return v

    @field_validator("effective_to")
    @classmethod
    def effective_to_after_effective_from(cls, v: date | None, info: Any) -> date | None:
        """effective_to, if set, must be on or after effective_from."""
        if v is None:
            return v
        effective_from = info.data.get("effective_from")
        if effective_from is not None and v < effective_from:
            raise ValueError(
                f"effective_to ({v}) must be on or after effective_from ({effective_from})"
            )
        return v


# ── Raw row from the spreadsheet, before parsing ─────────────────────────


class RawObligationRow(BaseModel):
    """
    A row exactly as it appears in the spreadsheet, before parsing the
    structured sub-fields. The loader (M1) emits these; the validator (M2)
    parses them into ObligationRow.

    String-typed sub-fields are deliberately permissive here so we can produce
    clear, row-level error messages.
    """

    model_config = ConfigDict(extra="forbid")

    obligation_id: str
    obligation_name: str
    jurisdiction: str
    regulator: str
    framework: str
    source_document: str
    source_url: str
    source_provision_type: str
    product_types: str  # Spreadsheet representation, e.g. "['loan','card']"
    customer_segments: str  # Same
    trigger_condition: str  # Dict-like string, parsed in M2
    requirement: str  # Dict-like string, parsed in M2
    deadline_value: int | None
    deadline_unit: str
    deadline_anchor: str
    evidence_required: str  # Array of dicts as string, parsed in M2
    breach_consequence: str
    exceptions: str  # Array of dicts as string, parsed in M2
    overlay_of: str | None
    supersedes: str | None
    effective_from: date
    effective_to: date | None
    version: str
    review_status: str

    # Provenance: which spreadsheet row did this come from?
    _source_row_number: int = 0


# ── Helpers ─────────────────────────────────────────────────────────────


def column_order() -> list[str]:
    """Canonical column order, used by the loader and validator."""
    return [
        "obligation_id",
        "obligation_name",
        "jurisdiction",
        "regulator",
        "framework",
        "source_document",
        "source_url",
        "source_provision_type",
        "product_types",
        "customer_segments",
        "trigger_condition",
        "requirement",
        "deadline_value",
        "deadline_unit",
        "deadline_anchor",
        "evidence_required",
        "breach_consequence",
        "exceptions",
        "overlay_of",
        "supersedes",
        "effective_from",
        "effective_to",
        "version",
        "review_status",
    ]
