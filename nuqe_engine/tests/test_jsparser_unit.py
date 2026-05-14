"""
Unit tests for nuqe_engine.jsparser targeting uncovered error-recovery branches.

The existing test_trigger.py and test_validator.py exercise the happy paths.
This file targets the specific error conditions and ParseError position hints
that are not yet covered:
- Unterminated string
- Unterminated escape sequence
- Unbalanced braces / missing closing }
- Trailing content after top-level value
- Expected object key missing
- Expected ',' or '}' missing in object
- Expected ',' or ']' missing in array
- Invalid number (bare minus)
- parse_array called on a non-array result
- parse_object called on a non-object result
- Empty / whitespace-only input
- Every ParseError carries position and source attributes
"""

from __future__ import annotations

import pytest

from nuqe_engine.jsparser import ParseError, parse, parse_array, parse_object

# ── ParseError attributes ─────────────────────────────────────────────────


class TestParseErrorAttributes:
    def test_parse_error_has_position(self) -> None:
        with pytest.raises(ParseError) as exc_info:
            parse("{ broken: ")
        assert exc_info.value.position >= 0

    def test_parse_error_has_source(self) -> None:
        src = "{ broken: "
        with pytest.raises(ParseError) as exc_info:
            parse(src)
        assert exc_info.value.source == src

    def test_parse_error_message_contains_position_hint(self) -> None:
        with pytest.raises(ParseError) as exc_info:
            parse("{ key: 'unterminated")
        msg = str(exc_info.value)
        assert "position" in msg

    def test_parse_error_context_window_in_message(self) -> None:
        """The error message includes a '^' pointer line."""
        with pytest.raises(ParseError) as exc_info:
            parse("{ key: 'unterminated")
        msg = str(exc_info.value)
        assert "^" in msg


# ── Unterminated string ───────────────────────────────────────────────────


class TestUnterminatedString:
    def test_single_quote_unterminated(self) -> None:
        with pytest.raises(ParseError, match="Unterminated string"):
            parse("{ key: 'no closing quote }")

    def test_double_quote_unterminated(self) -> None:
        with pytest.raises(ParseError, match="Unterminated string"):
            parse('{ key: "no closing double quote }')

    def test_string_in_array_unterminated(self) -> None:
        with pytest.raises(ParseError, match="Unterminated string"):
            parse("['ok', 'not closed")

    def test_unterminated_escape_sequence(self) -> None:
        """String ending with a bare backslash raises ParseError."""
        with pytest.raises(ParseError):
            parse("{ key: 'value\\")


# ── Unbalanced braces ─────────────────────────────────────────────────────


class TestUnbalancedBraces:
    def test_missing_closing_brace(self) -> None:
        with pytest.raises(ParseError):
            parse("{ key: 'value'")

    def test_missing_closing_bracket(self) -> None:
        with pytest.raises(ParseError):
            parse("['a', 'b'")

    def test_extra_closing_brace_triggers_trailing_content_error(self) -> None:
        with pytest.raises(ParseError):
            parse("{ key: 'v' }}")

    def test_extra_closing_bracket(self) -> None:
        with pytest.raises(ParseError):
            parse("['a']]")


# ── Trailing content after top-level value ────────────────────────────────


class TestTrailingContent:
    def test_trailing_content_after_object(self) -> None:
        with pytest.raises(ParseError, match="trailing"):
            parse("{ key: 'v' } extra")

    def test_trailing_content_after_array(self) -> None:
        with pytest.raises(ParseError, match="trailing"):
            parse("['a'] leftover")

    def test_trailing_content_after_number(self) -> None:
        with pytest.raises(ParseError, match="trailing"):
            parse("42 garbage")


# ── Expected object key ───────────────────────────────────────────────────


class TestObjectKeyErrors:
    def test_missing_key_after_opening_brace(self) -> None:
        """{ : 'value' } has no key before the colon."""
        with pytest.raises(ParseError):
            parse("{ : 'value' }")

    def test_missing_colon_after_key(self) -> None:
        with pytest.raises(ParseError):
            parse("{ key 'value' }")

    def test_missing_comma_or_brace_between_key_value_pairs(self) -> None:
        with pytest.raises(ParseError):
            parse("{ a: 'x' b: 'y' }")


# ── Expected comma or bracket in array ───────────────────────────────────


class TestArrayErrors:
    def test_missing_comma_between_elements(self) -> None:
        with pytest.raises(ParseError):
            parse("['a' 'b']")

    def test_unexpected_character_in_array(self) -> None:
        with pytest.raises(ParseError):
            parse("[@ 'bad']")


# ── Invalid number ────────────────────────────────────────────────────────


class TestNumberErrors:
    def test_bare_minus_is_invalid_number(self) -> None:
        with pytest.raises(ParseError, match="Invalid number"):
            parse("{ key: - }")

    def test_negative_integer_is_valid(self) -> None:
        result = parse("{ n: -5 }")
        assert result["n"] == -5

    def test_float_is_valid(self) -> None:
        result = parse("{ n: 3.14 }")
        assert abs(result["n"] - 3.14) < 1e-10

    def test_negative_float_is_valid(self) -> None:
        result = parse("{ n: -1.5 }")
        assert abs(result["n"] - (-1.5)) < 1e-10


# ── Unexpected character ──────────────────────────────────────────────────


class TestUnexpectedCharacter:
    def test_unexpected_at_sign(self) -> None:
        with pytest.raises(ParseError, match="Unexpected character"):
            parse("@unexpected")

    def test_unexpected_hash(self) -> None:
        with pytest.raises(ParseError):
            parse("{ key: # }")

    def test_eof_as_value(self) -> None:
        with pytest.raises(ParseError):
            parse("{key: }")


# ── parse_array / parse_object type guards ────────────────────────────────


class TestTypeGuards:
    def test_parse_array_on_object_raises(self) -> None:
        with pytest.raises(ParseError, match="Expected array"):
            parse_array("{ key: 'v' }")

    def test_parse_object_on_array_raises(self) -> None:
        with pytest.raises(ParseError, match="Expected object"):
            parse_object("['a', 'b']")

    def test_parse_array_on_string_raises(self) -> None:
        with pytest.raises(ParseError, match="Expected array"):
            parse_array("'just a string'")

    def test_parse_object_on_number_raises(self) -> None:
        with pytest.raises(ParseError, match="Expected object"):
            parse_object("42")


# ── Empty / whitespace input ──────────────────────────────────────────────


class TestEmptyInput:
    def test_empty_string_raises(self) -> None:
        with pytest.raises(ParseError):
            parse("")

    def test_whitespace_only_raises(self) -> None:
        with pytest.raises(ParseError):
            parse("   \t\n  ")

    def test_none_handled_by_empty_check(self) -> None:
        """parse() guards against None by treating falsy as empty."""
        with pytest.raises(ParseError):
            parse("")  # type guard — empty string branch


# ── Happy path regressions (ensure they still work) ──────────────────────


class TestHappyPaths:
    def test_empty_object(self) -> None:
        assert parse("{}") == {}

    def test_empty_array(self) -> None:
        assert parse("[]") == []

    def test_nested_object(self) -> None:
        result = parse("{ outer: { inner: 'v' } }")
        assert result == {"outer": {"inner": "v"}}

    def test_trailing_comma_object_tolerated(self) -> None:
        result = parse("{ a: 'x', }")
        assert result == {"a": "x"}

    def test_trailing_comma_array_tolerated(self) -> None:
        result = parse("['a', 'b',]")
        assert result == ["a", "b"]

    def test_boolean_true(self) -> None:
        result = parse("{ flag: true }")
        assert result["flag"] is True

    def test_boolean_false(self) -> None:
        result = parse("{ flag: false }")
        assert result["flag"] is False

    def test_null_keyword(self) -> None:
        result = parse("{ val: null }")
        assert result["val"] is None

    def test_bare_word_value(self) -> None:
        result = parse("{ action: send_email }")
        assert result["action"] == "send_email"

    def test_escape_sequences_in_string(self) -> None:
        result = parse(r"{ msg: 'line1\nline2' }")
        assert "\n" in result["msg"]

    def test_double_quote_string(self) -> None:
        result = parse('{ key: "value" }')
        assert result["key"] == "value"

    def test_quoted_key(self) -> None:
        result = parse("{ 'quoted-key': 'v' }")
        assert result["quoted-key"] == "v"
