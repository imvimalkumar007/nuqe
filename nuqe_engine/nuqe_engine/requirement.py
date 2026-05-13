"""
M5: Requirement enforcer.

Given a FiredObligation, registers the required action and the assertion that
determines when it is satisfied. The assertion can later be re-evaluated against
a context dict using the same DSL as M4.

Design notes:
- register_requirement is pure and side-effect-free. Persistence is handled by
  the Engine layer (engine.py), which assigns the database fired_obligation_id.
- check_assertion attempts DSL evaluation. Natural-language assertions (those
  that cannot be parsed as DSL) return satisfied=False with a human-readable
  failed_clause indicating manual verification is required.
- When an assertion is a top-level AND conjunction, check_assertion identifies
  the first failing conjunct so the caller knows which specific clause failed.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel

from nuqe_engine.schema import RequirementAction
from nuqe_engine.trigger import ExpressionError, FiredObligation, evaluate_expression

logger = logging.getLogger(__name__)


# ── Public models ─────────────────────────────────────────────────────────


class RequirementRegistration(BaseModel):
    """Registered requirement, ready for persistence and later re-evaluation."""

    fired_obligation_id: UUID
    action: RequirementAction
    action_parameters: dict[str, Any]
    assertion: str  # Raw assertion expression for later re-evaluation


class AssertionResult(BaseModel):
    """Result of evaluating an assertion expression against a context."""

    satisfied: bool
    failed_clause: str | None  # First conjunct that failed; None when satisfied
    evaluated_at: datetime


# ── Internal helpers ──────────────────────────────────────────────────────


def _split_top_level_and(expr: str) -> list[str]:
    """
    Split a DSL expression on top-level AND, respecting parenthesis depth.

    Returns a list of conjunct strings. If the expression contains no top-level
    AND, returns a single-element list containing the whole expression.
    """
    conjuncts: list[str] = []
    depth = 0
    buf: list[str] = []

    i = 0
    tokens = expr.split()  # whitespace-split is sufficient for AND detection
    while i < len(tokens):
        tok = tokens[i]
        if tok.upper() == "AND" and depth == 0:
            clause = " ".join(buf).strip()
            if clause:
                conjuncts.append(clause)
            buf = []
        else:
            depth += tok.count("(") - tok.count(")")
            buf.append(tok)
        i += 1

    clause = " ".join(buf).strip()
    if clause:
        conjuncts.append(clause)

    return conjuncts or [expr]


# ── Public functions ──────────────────────────────────────────────────────


def register_requirement(
    fired_obligation: FiredObligation,
    fired_obligation_id: UUID | None = None,
) -> RequirementRegistration:
    """
    Register the requirement from a fired obligation.

    Args:
        fired_obligation: An obligation that has just fired.
        fired_obligation_id: The database primary key for the fired_obligation
            row. If not yet known (pre-persist), omit — a placeholder UUID is
            generated. The Engine layer should supply the real ID after INSERT.

    Returns:
        RequirementRegistration ready for persistence.
    """
    req = fired_obligation.obligation.requirement
    return RequirementRegistration(
        fired_obligation_id=fired_obligation_id or uuid4(),
        action=req.action,
        action_parameters=req.action_parameters,
        assertion=req.assertion,
    )


def check_assertion(
    registration: RequirementRegistration,
    context: dict[str, Any],
) -> AssertionResult:
    """
    Re-evaluate the assertion against the current context.

    Uses the same DSL as M4 (trigger.evaluate_expression). If the assertion
    is natural language rather than a DSL expression, DSL parsing will fail
    and the result will be satisfied=False with a failed_clause explaining
    that manual verification is required.

    If the assertion is a top-level AND conjunction and it evaluates to False,
    failed_clause names the first conjunct that returned False.

    Args:
        registration: A RequirementRegistration produced by register_requirement.
        context: Nested dict of case/customer/product/communication/firm state.

    Returns:
        AssertionResult with satisfied, failed_clause, and evaluated_at.
    """
    now = datetime.now(tz=UTC)
    assertion = registration.assertion.strip()

    try:
        result = evaluate_expression(assertion, context)
    except ExpressionError:
        # Natural language or malformed DSL — cannot auto-evaluate
        return AssertionResult(
            satisfied=False,
            failed_clause=f"assertion requires manual verification: {assertion!r}",
            evaluated_at=now,
        )

    if result:
        return AssertionResult(satisfied=True, failed_clause=None, evaluated_at=now)

    # Not satisfied — identify first failing conjunct for diagnostics
    conjuncts = _split_top_level_and(assertion)
    failed_clause: str | None = assertion  # default: whole expression
    if len(conjuncts) > 1:
        for clause in conjuncts:
            try:
                if not evaluate_expression(clause, context):
                    failed_clause = clause
                    break
            except ExpressionError:
                failed_clause = clause
                break
    else:
        failed_clause = assertion

    return AssertionResult(satisfied=False, failed_clause=failed_clause, evaluated_at=now)
