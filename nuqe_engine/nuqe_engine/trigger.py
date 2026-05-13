"""
M4: Trigger evaluator.

Given an incoming Event and a list of ObligationRows, determines which
obligations fire by evaluating the trigger_condition's event match,
conditions expression, and exclusions expression.

DSL grammar supported:
    expression   := disjunction
    disjunction  := conjunction ("OR" conjunction)*
    conjunction  := term ("AND" term)*
    term         := "NOT" term | "(" expression ")" | comparison
    comparison   := operand [operator operand]
    operator     := "==" | "!=" | "<" | "<=" | ">" | ">=" | "IN" | "NOT IN"
    operand      := dotted_path | string | number | "true" | "false" | "null"
    dotted_path  := identifier ("." identifier)*

IN lists accept both "[a, b]" (bracket) and "(a, b)" (paren) notation,
matching actual library usage.

Missing context paths resolve to None. None == anything returns False (not an
error). None with ordering operators (<, <=, >, >=) raises ExpressionError.
The special exclusion values "null" and "false" are treated as False (no
exclusion applies), per the Method specification.

Short-circuit evaluation applies: AND stops on the first False, OR stops on
the first True.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from enum import Enum, auto
from typing import Any
from uuid import UUID

from pydantic import BaseModel

from nuqe_engine.schema import ObligationRow, TriggerEvent

logger = logging.getLogger(__name__)


# ── Public types ──────────────────────────────────────────────────────────


class ExpressionError(ValueError):
    """Raised when an expression cannot be lexed, parsed, or evaluated."""


class Event(BaseModel):
    """An event that may fire obligations."""

    event: TriggerEvent
    case_id: UUID
    occurred_at: datetime
    context: dict[str, Any]


class FiredObligation(BaseModel):
    """An obligation that fired in response to an event."""

    obligation: ObligationRow
    matched_at: datetime
    trigger_event: TriggerEvent


# ── Lexer ─────────────────────────────────────────────────────────────────


class _TT(Enum):
    EOF = auto()
    STRING = auto()
    NUMBER = auto()
    IDENT = auto()    # dotted path, e.g. case.type
    LPAREN = auto()
    RPAREN = auto()
    LBRACKET = auto()
    RBRACKET = auto()
    COMMA = auto()
    EQ = auto()       # ==
    NEQ = auto()      # !=
    LT = auto()       # <
    LTE = auto()      # <=
    GT = auto()       # >
    GTE = auto()      # >=
    AND = auto()
    OR = auto()
    NOT = auto()
    IN = auto()
    TRUE = auto()
    FALSE = auto()
    NULL = auto()


@dataclass
class _Token:
    type: _TT
    value: Any = None


_KEYWORDS: dict[str, _TT] = {
    "AND": _TT.AND,
    "OR": _TT.OR,
    "NOT": _TT.NOT,
    "IN": _TT.IN,
    "true": _TT.TRUE,
    "false": _TT.FALSE,
    "null": _TT.NULL,
}


def _tokenise(expr: str) -> list[_Token]:
    tokens: list[_Token] = []
    pos = 0
    length = len(expr)

    while pos < length:
        ch = expr[pos]

        # Whitespace
        if ch in " \t\n\r":
            pos += 1
            continue

        # Quoted strings (single or double)
        if ch in ("'", '"'):
            quote = ch
            pos += 1
            chars: list[str] = []
            while pos < length and expr[pos] != quote:
                if expr[pos] == "\\" and pos + 1 < length:
                    pos += 1
                    chars.append(expr[pos])
                else:
                    chars.append(expr[pos])
                pos += 1
            if pos >= length:
                raise ExpressionError(
                    f"Unterminated string literal in expression: {expr!r}"
                )
            pos += 1  # closing quote
            tokens.append(_Token(_TT.STRING, "".join(chars)))
            continue

        # Two-character operators first
        two = expr[pos : pos + 2]
        if two == "==":
            tokens.append(_Token(_TT.EQ))
            pos += 2
            continue
        if two == "!=":
            tokens.append(_Token(_TT.NEQ))
            pos += 2
            continue
        if two == "<=":
            tokens.append(_Token(_TT.LTE))
            pos += 2
            continue
        if two == ">=":
            tokens.append(_Token(_TT.GTE))
            pos += 2
            continue

        # Single-character operators
        if ch == "<":
            tokens.append(_Token(_TT.LT))
            pos += 1
            continue
        if ch == ">":
            tokens.append(_Token(_TT.GT))
            pos += 1
            continue
        if ch == "(":
            tokens.append(_Token(_TT.LPAREN))
            pos += 1
            continue
        if ch == ")":
            tokens.append(_Token(_TT.RPAREN))
            pos += 1
            continue
        if ch == "[":
            tokens.append(_Token(_TT.LBRACKET))
            pos += 1
            continue
        if ch == "]":
            tokens.append(_Token(_TT.RBRACKET))
            pos += 1
            continue
        if ch == ",":
            tokens.append(_Token(_TT.COMMA))
            pos += 1
            continue

        # Numbers (integer or float, optionally negative)
        if ch.isdigit() or (ch == "-" and pos + 1 < length and expr[pos + 1].isdigit()):
            start = pos
            if ch == "-":
                pos += 1
            while pos < length and (expr[pos].isdigit() or expr[pos] == "."):
                pos += 1
            raw = expr[start:pos]
            tokens.append(_Token(_TT.NUMBER, float(raw) if "." in raw else int(raw)))
            continue

        # Identifiers, keywords, and dotted paths (e.g. case.type)
        if ch.isalpha() or ch == "_":
            start = pos
            # Read first segment
            while pos < length and (expr[pos].isalnum() or expr[pos] == "_"):
                pos += 1
            # Extend with dotted continuations: .identifier
            while (
                pos < length
                and expr[pos] == "."
                and pos + 1 < length
                and (expr[pos + 1].isalpha() or expr[pos + 1] == "_")
            ):
                pos += 1  # consume dot
                while pos < length and (expr[pos].isalnum() or expr[pos] == "_"):
                    pos += 1
            word = expr[start:pos]
            tt = _KEYWORDS.get(word, _TT.IDENT)
            kw_values: dict[_TT, Any] = {
                _TT.TRUE: True,
                _TT.FALSE: False,
                _TT.NULL: None,
            }
            val = kw_values.get(tt, word if tt == _TT.IDENT else None)
            tokens.append(_Token(tt, val))
            continue

        raise ExpressionError(
            f"Unexpected character {ch!r} at position {pos} in: {expr!r}"
        )

    tokens.append(_Token(_TT.EOF))
    return tokens


# ── AST nodes ─────────────────────────────────────────────────────────────


@dataclass
class _PathNode:
    path: str  # dotted path string, e.g. "case.type"


@dataclass
class _LiteralNode:
    value: Any  # str, int, float, bool, or None


@dataclass
class _ListNode:
    items: list[Any]


@dataclass
class _CompareNode:
    op: str   # "==", "!=", "<", "<=", ">", ">=", "IN", "NOT IN"
    left: Any  # AST node
    right: Any  # AST node


@dataclass
class _AndNode:
    left: Any
    right: Any


@dataclass
class _OrNode:
    left: Any
    right: Any


@dataclass
class _NotNode:
    operand: Any


# ── Parser ────────────────────────────────────────────────────────────────


class _Parser:
    def __init__(self, tokens: list[_Token]) -> None:
        self._tokens = tokens
        self._pos = 0

    def _peek(self) -> _Token:
        return self._tokens[self._pos]

    def _advance(self) -> _Token:
        tok = self._tokens[self._pos]
        self._pos += 1
        return tok

    def _expect(self, *types: _TT) -> _Token:
        tok = self._peek()
        if tok.type not in types:
            raise ExpressionError(
                f"Expected {[t.name for t in types]}, got {tok.type.name!r}"
                f" (value={tok.value!r})"
            )
        return self._advance()

    def _at(self, *types: _TT) -> bool:
        return self._peek().type in types

    def parse(self) -> Any:
        node = self._disjunction()
        if not self._at(_TT.EOF):
            tok = self._peek()
            raise ExpressionError(
                f"Unexpected token after expression: {tok.type.name!r} ({tok.value!r})"
            )
        return node

    # expression := disjunction
    def _disjunction(self) -> Any:
        left = self._conjunction()
        while self._at(_TT.OR):
            self._advance()
            right = self._conjunction()
            left = _OrNode(left, right)
        return left

    # conjunction := term ("AND" term)*
    def _conjunction(self) -> Any:
        left = self._term()
        while self._at(_TT.AND):
            self._advance()
            right = self._term()
            left = _AndNode(left, right)
        return left

    # term := "NOT" term | "(" expression ")" | comparison
    def _term(self) -> Any:
        if self._at(_TT.NOT):
            self._advance()
            # Disambiguate: "NOT IN" as a binary operator is handled inside
            # _comparison. A bare NOT here means logical negation.
            return _NotNode(self._term())
        if self._at(_TT.LPAREN):
            self._advance()
            node = self._disjunction()
            self._expect(_TT.RPAREN)
            return node
        return self._comparison()

    # comparison := operand [operator operand]
    def _comparison(self) -> Any:
        left = self._operand()

        _op_tokens = (_TT.EQ, _TT.NEQ, _TT.LT, _TT.LTE, _TT.GT, _TT.GTE, _TT.IN, _TT.NOT)
        if not self._at(*_op_tokens):
            return left

        if self._at(_TT.NOT):
            # "NOT IN" two-token operator
            self._advance()
            self._expect(_TT.IN)
            op = "NOT IN"
        elif self._at(_TT.IN):
            self._advance()
            op = "IN"
        else:
            op_tok = self._advance()
            op = {
                _TT.EQ: "==",
                _TT.NEQ: "!=",
                _TT.LT: "<",
                _TT.LTE: "<=",
                _TT.GT: ">",
                _TT.GTE: ">=",
            }[op_tok.type]

        if op in ("IN", "NOT IN"):
            right: Any = self._list_literal()
        else:
            right = self._operand()

        return _CompareNode(op, left, right)

    def _operand(self) -> Any:
        tok = self._peek()
        if tok.type == _TT.STRING:
            self._advance()
            return _LiteralNode(tok.value)
        if tok.type == _TT.NUMBER:
            self._advance()
            return _LiteralNode(tok.value)
        if tok.type == _TT.TRUE:
            self._advance()
            return _LiteralNode(True)
        if tok.type == _TT.FALSE:
            self._advance()
            return _LiteralNode(False)
        if tok.type == _TT.NULL:
            self._advance()
            return _LiteralNode(None)
        if tok.type == _TT.IDENT:
            self._advance()
            return _PathNode(tok.value)
        raise ExpressionError(
            f"Expected operand (path, string, number, true, false, null),"
            f" got {tok.type.name!r} (value={tok.value!r})"
        )

    def _list_literal(self) -> _ListNode:
        """Parse ( val, val, ... ) or [ val, val, ... ] for IN operator."""
        if self._at(_TT.LBRACKET):
            close_t = _TT.RBRACKET
        elif self._at(_TT.LPAREN):
            close_t = _TT.RPAREN
        else:
            raise ExpressionError(
                f"Expected '[' or '(' for IN list, got {self._peek().type.name!r}"
            )
        self._advance()  # consume opener
        items: list[Any] = []
        while not self._at(close_t, _TT.EOF):
            tok = self._peek()
            if tok.type in (_TT.STRING, _TT.NUMBER, _TT.TRUE, _TT.FALSE, _TT.NULL, _TT.IDENT):
                self._advance()
                if tok.type == _TT.TRUE:
                    items.append(True)
                elif tok.type == _TT.FALSE:
                    items.append(False)
                elif tok.type == _TT.NULL:
                    items.append(None)
                else:
                    items.append(tok.value)
            else:
                raise ExpressionError(
                    f"Unexpected token in list: {tok.type.name!r} ({tok.value!r})"
                )
            if self._at(_TT.COMMA):
                self._advance()
        self._expect(close_t)
        return _ListNode(items)


# ── Evaluator ─────────────────────────────────────────────────────────────


def _resolve_path(path: str, context: dict[str, Any]) -> Any:
    """
    Walk a dotted path through a nested context dict.

    For dotted paths (e.g. case.type), a missing segment returns None.
    For single-segment paths (no dots), a missing key returns the path
    string itself as a string literal. This handles library patterns like
    ``jurisdiction==UK`` where ``UK`` is an unquoted string constant, not a
    context key.
    """
    parts = path.split(".")
    current: Any = context
    for part in parts:
        if not isinstance(current, dict) or part not in current:
            # Single-segment path not found: treat as string literal
            if len(parts) == 1:
                return path
            return None
        current = current[part]
    return current


def _compare(op: str, left: Any, right: Any) -> bool:
    if op == "==":
        if left is None and right is None:
            return True
        if left is None or right is None:
            return False
        return bool(left == right)
    if op == "!=":
        if left is None and right is None:
            return False
        if left is None or right is None:
            return True
        return bool(left != right)
    if op in ("<", "<=", ">", ">="):
        if left is None or right is None:
            raise ExpressionError(
                f"Cannot apply '{op}' to a missing (null) value"
            )
        if op == "<":
            return bool(left < right)
        if op == "<=":
            return bool(left <= right)
        if op == ">":
            return bool(left > right)
        return bool(left >= right)
    if op == "IN":
        if left is None:
            return False
        return left in right
    if op == "NOT IN":
        if left is None:
            return True
        return left not in right
    raise ExpressionError(f"Unknown operator: {op!r}")


def _eval(node: Any, context: dict[str, Any]) -> Any:
    if isinstance(node, _LiteralNode):
        return node.value

    if isinstance(node, _PathNode):
        return _resolve_path(node.path, context)

    if isinstance(node, _ListNode):
        return node.items

    if isinstance(node, _AndNode):
        left_val = _eval(node.left, context)
        if not left_val:  # short-circuit on False
            return False
        return bool(_eval(node.right, context))

    if isinstance(node, _OrNode):
        left_val = _eval(node.left, context)
        if left_val:  # short-circuit on True
            return True
        return bool(_eval(node.right, context))

    if isinstance(node, _NotNode):
        return not _eval(node.operand, context)

    if isinstance(node, _CompareNode):
        left_val = _eval(node.left, context)
        if node.op in ("IN", "NOT IN"):
            right_val = _eval(node.right, context)
        else:
            right_val = _eval(node.right, context)
        return _compare(node.op, left_val, right_val)

    raise ExpressionError(f"Unknown AST node type: {type(node).__name__}")


# ── Public API ────────────────────────────────────────────────────────────


def parse_expression(expr: str) -> Any:
    """
    Parse a DSL expression and return the AST without evaluating it.

    Useful for validating expression syntax at load time. Returns None for the
    sentinel values "null", "false", and the empty string (no AST needed).

    Raises:
        ExpressionError: If the expression has a lexer or parser error.
    """
    stripped = expr.strip() if expr else ""
    if stripped in ("null", "false", ""):
        return None
    tokens = _tokenise(stripped)
    return _Parser(tokens).parse()


def evaluate_expression(expr: str, context: dict[str, Any]) -> bool:
    """
    Evaluate a boolean DSL expression against a context dict.

    The special strings "null" and "false" (used in the exclusions field to
    mean "no exclusion applies") are treated as False without parsing.

    Args:
        expr: A DSL expression string from trigger_condition.conditions or
            trigger_condition.exclusions.
        context: Nested dict of case/customer/product/communication/firm state.

    Returns:
        True if the expression is satisfied, False otherwise.

    Raises:
        ExpressionError: If the expression cannot be lexed or parsed, or if an
            operator is applied to incompatible types (e.g. < with None).
    """
    stripped = expr.strip() if expr else ""
    # "null" and "false" are the canonical "no exclusion" sentinel values
    if stripped in ("null", "false", ""):
        return False

    try:
        tokens = _tokenise(stripped)
        ast = _Parser(tokens).parse()
        result = _eval(ast, context)
        return bool(result)
    except ExpressionError:
        raise
    except Exception as exc:
        raise ExpressionError(f"Unexpected evaluation failure: {exc}") from exc


def find_fired_obligations(
    event: Event,
    obligations: list[ObligationRow],
) -> list[FiredObligation]:
    """
    Return the subset of obligations whose trigger fires for the given event.

    An obligation fires when:
      1. trigger_condition.event matches event.event, AND
      2. trigger_condition.conditions evaluates to True, AND
      3. trigger_condition.exclusions evaluates to False (or is "null"/"false").

    Obligations that raise ExpressionError during evaluation are skipped with
    a warning rather than crashing the pipeline.
    """
    fired: list[FiredObligation] = []

    for obl in obligations:
        tc = obl.trigger_condition

        # Step 1: event type must match
        if tc.event != event.event:
            continue

        # Step 2: conditions must be satisfied
        try:
            if not evaluate_expression(tc.conditions, event.context):
                continue
        except ExpressionError as exc:
            logger.warning(
                "Skipping %s: conditions expression error: %s",
                obl.obligation_id,
                exc,
            )
            continue

        # Step 3: exclusions must NOT be satisfied
        try:
            if evaluate_expression(tc.exclusions, event.context):
                continue
        except ExpressionError as exc:
            logger.warning(
                "Skipping %s: exclusions expression error: %s",
                obl.obligation_id,
                exc,
            )
            continue

        fired.append(
            FiredObligation(
                obligation=obl,
                matched_at=event.occurred_at,
                trigger_event=event.event,
            )
        )

    return fired
