"""
A small parser for the JavaScript-like object literal syntax used in the
spreadsheet's structured sub-fields (trigger_condition, requirement,
evidence_required, exceptions).

Example input:
    { event: 'communication_received',
      conditions: "communication.type=='withdrawal_notice'",
      exclusions: 'null' }

Returns:
    {'event': 'communication_received',
     'conditions': "communication.type=='withdrawal_notice'",
     'exclusions': 'null'}

This is intentionally not a full JS parser. It supports exactly what the
decomposition spreadsheet uses:
    - Bare-word keys: foo, foo_bar, foo.bar
    - String values in single or double quotes, with escape support
    - Bare-word values that look like identifiers
    - Number literals: 5, 30, 14
    - Boolean literals: true, false
    - Null literal: null (returned as Python None)
    - Nested objects (recursive)
    - Arrays of any of the above (recursive)
    - Trailing commas (tolerated, JS doesn't but the spreadsheet sometimes does)

Anything outside that surface raises ParseError with a position hint.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class ParseError(ValueError):
    """Raised when the JS-like string cannot be parsed."""

    def __init__(self, message: str, position: int, source: str) -> None:
        # Build a small context window for diagnostics
        start = max(0, position - 25)
        end = min(len(source), position + 25)
        window = source[start:end].replace("\n", " ")
        pointer = " " * (position - start) + "^"
        super().__init__(
            f"{message} at position {position}:\n  {window}\n  {pointer}"
        )
        self.position = position
        self.source = source


class _Parser:
    """Recursive-descent parser. Single-pass, single-character lookahead."""

    def __init__(self, source: str) -> None:
        self.source = source
        self.pos = 0
        self.length = len(source)

    # ── Whitespace ──────────────────────────────────────────────────────
    def _skip_ws(self) -> None:
        while self.pos < self.length and self.source[self.pos] in " \t\n\r":
            self.pos += 1

    def _peek(self) -> str:
        return self.source[self.pos] if self.pos < self.length else ""

    def _consume(self, expected: str) -> None:
        if self._peek() != expected:
            raise ParseError(
                f"Expected '{expected}', got '{self._peek() or 'EOF'}'",
                self.pos,
                self.source,
            )
        self.pos += 1

    # ── Top-level entry ─────────────────────────────────────────────────
    def parse(self) -> Any:
        self._skip_ws()
        value = self._parse_value()
        self._skip_ws()
        if self.pos != self.length:
            raise ParseError(
                f"Unexpected trailing content: {self.source[self.pos:][:20]!r}",
                self.pos,
                self.source,
            )
        return value

    # ── Value dispatch ──────────────────────────────────────────────────
    def _parse_value(self) -> Any:
        self._skip_ws()
        ch = self._peek()
        if ch == "{":
            return self._parse_object()
        if ch == "[":
            return self._parse_array()
        if ch in ("'", '"'):
            return self._parse_string()
        if ch == "-" or ch.isdigit():
            return self._parse_number()
        if ch.isalpha() or ch == "_":
            return self._parse_identifier_or_keyword()
        raise ParseError(
            f"Unexpected character '{ch or 'EOF'}'", self.pos, self.source
        )

    # ── Objects: { key: value, ... } ────────────────────────────────────
    def _parse_object(self) -> dict[str, Any]:
        self._consume("{")
        result: dict[str, Any] = {}
        self._skip_ws()
        if self._peek() == "}":
            self._consume("}")
            return result
        while True:
            self._skip_ws()
            # Trailing comma tolerance
            if self._peek() == "}":
                break
            key = self._parse_key()
            self._skip_ws()
            self._consume(":")
            value = self._parse_value()
            result[key] = value
            self._skip_ws()
            if self._peek() == ",":
                self.pos += 1
                continue
            if self._peek() == "}":
                break
            raise ParseError(
                f"Expected ',' or '}}' in object, got '{self._peek() or 'EOF'}'",
                self.pos,
                self.source,
            )
        self._consume("}")
        return result

    def _parse_key(self) -> str:
        """A key is either a bare word or a quoted string."""
        ch = self._peek()
        if ch in ("'", '"'):
            return self._parse_string()
        # Bare key: identifier characters
        start = self.pos
        while self.pos < self.length and (
            self.source[self.pos].isalnum() or self.source[self.pos] in "_."
        ):
            self.pos += 1
        if start == self.pos:
            raise ParseError(
                "Expected object key", self.pos, self.source
            )
        return self.source[start : self.pos]

    # ── Arrays: [ value, value, ... ] ───────────────────────────────────
    def _parse_array(self) -> list[Any]:
        self._consume("[")
        result: list[Any] = []
        self._skip_ws()
        if self._peek() == "]":
            self._consume("]")
            return result
        while True:
            self._skip_ws()
            if self._peek() == "]":
                break
            result.append(self._parse_value())
            self._skip_ws()
            if self._peek() == ",":
                self.pos += 1
                continue
            if self._peek() == "]":
                break
            raise ParseError(
                f"Expected ',' or ']' in array, got '{self._peek() or 'EOF'}'",
                self.pos,
                self.source,
            )
        self._consume("]")
        return result

    # ── Strings: 'foo' or "foo" with backslash escapes ──────────────────
    def _parse_string(self) -> str:
        quote = self._peek()
        if quote not in ("'", '"'):
            raise ParseError(
                f"Expected string quote, got '{quote or 'EOF'}'",
                self.pos,
                self.source,
            )
        self.pos += 1
        chars: list[str] = []
        while self.pos < self.length:
            ch = self.source[self.pos]
            if ch == "\\":
                self.pos += 1
                if self.pos >= self.length:
                    raise ParseError(
                        "Unterminated escape sequence", self.pos, self.source
                    )
                esc = self.source[self.pos]
                escape_map = {
                    "n": "\n",
                    "t": "\t",
                    "r": "\r",
                    "\\": "\\",
                    "'": "'",
                    '"': '"',
                    "/": "/",
                }
                chars.append(escape_map.get(esc, esc))
                self.pos += 1
                continue
            if ch == quote:
                self.pos += 1
                return "".join(chars)
            chars.append(ch)
            self.pos += 1
        raise ParseError("Unterminated string", self.pos, self.source)

    # ── Numbers ─────────────────────────────────────────────────────────
    def _parse_number(self) -> int | float:
        start = self.pos
        if self._peek() == "-":
            self.pos += 1
        while self.pos < self.length and self.source[self.pos].isdigit():
            self.pos += 1
        is_float = False
        if self._peek() == ".":
            is_float = True
            self.pos += 1
            while self.pos < self.length and self.source[self.pos].isdigit():
                self.pos += 1
        text = self.source[start : self.pos]
        if not text or text == "-":
            raise ParseError("Invalid number", start, self.source)
        return float(text) if is_float else int(text)

    # ── Identifiers and keywords ────────────────────────────────────────
    def _parse_identifier_or_keyword(self) -> Any:
        """
        Bare-word values. We recognise:
          - true, false → Python True, False
          - null → Python None
          - Anything else → the bare word as a string

        Bare-word values appear in the spreadsheet for things like
        action types, channels, or referenced fields.
        """
        start = self.pos
        while self.pos < self.length and (
            self.source[self.pos].isalnum() or self.source[self.pos] in "_.-"
        ):
            self.pos += 1
        word = self.source[start : self.pos]
        if word == "true":
            return True
        if word == "false":
            return False
        if word == "null":
            return None
        return word


def parse(source: str) -> Any:
    """
    Parse a JS-like object literal string into Python data.

    Raises ParseError on syntax error, with a position hint.
    """
    if not source or not source.strip():
        raise ParseError("Empty input", 0, source or "")
    return _Parser(source).parse()


def parse_array(source: str) -> list[Any]:
    """
    Parse and return a list. Raises ParseError if the result isn't a list.
    Used for evidence_required and exceptions columns.
    """
    result = parse(source)
    if not isinstance(result, list):
        raise ParseError(
            f"Expected array, got {type(result).__name__}", 0, source
        )
    return result


def parse_object(source: str) -> dict[str, Any]:
    """
    Parse and return a dict. Raises ParseError if the result isn't a dict.
    Used for trigger_condition and requirement columns.
    """
    result = parse(source)
    if not isinstance(result, dict):
        raise ParseError(
            f"Expected object, got {type(result).__name__}", 0, source
        )
    return result
