"""
nuqe_api.models — Pydantic request/response models for the API layer.

These models are distinct from the engine's internal models so that the API
can have different validation rules (e.g., forbidding case_id on ingestion).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, model_validator

from nuqe_engine.schema import TriggerEvent


class OpeningEvent(BaseModel):
    """Like Event but case_id must be absent (server assigns it)."""

    event: TriggerEvent
    occurred_at: datetime
    context: dict[str, object] = {}

    @model_validator(mode="before")
    @classmethod
    def forbid_case_id(cls, data: object) -> object:
        if isinstance(data, dict) and "case_id" in data and data["case_id"] is not None:
            raise ValueError(
                "case_id must not be set in opening_event; the server assigns it"
            )
        return data


class CaseCreate(BaseModel):
    external_ref: str | None = None
    type: Literal[
        "complaint",
        "credit_application",
        "arrears",
        "collections",
        "dsar",
        "other",
    ]
    status: str = "open"
    customer_id: str | None = None
    opening_event: OpeningEvent


class CaseCreateResult(BaseModel):
    case_id: UUID
    fired_obligations: list[object]
    deadlines: list[object]
    requirements: list[object]
    audit_entries: list[object]
