"""
Unit tests for nuqe_engine.audit (M8) — no database required.

Covers:
- _canonical_message: deterministic JSON serialisation
- _sign: HMAC-SHA256 computation
- verify_signature: correct and tampered entries
- append_audit_entry: all fields populated, correct SQL issued, signature matches
- get_audit_trail: filtering logic, verify_signatures=False, signing_key guard
- Every AuditEventType enum value round-trips through append + retrieval
"""

from __future__ import annotations

import hashlib
import hmac as hmac_module
import json
from datetime import UTC, datetime
from typing import Any
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest

from nuqe_engine.audit import (
    AuditEntry,
    AuditEventType,
    _canonical_message,
    _sign,
    append_audit_entry,
    get_audit_trail,
    verify_signature,
)

# ── Constants ──────────────────────────────────────────────────────────────

SIGNING_KEY = b"test-unit-signing-key"
FIXED_ID = uuid4()
FIXED_ENTITY_ID = uuid4()
FIXED_TS = datetime(2026, 1, 15, 10, 30, 0, tzinfo=UTC)


# ── Helpers ────────────────────────────────────────────────────────────────


def _make_entry(
    *,
    entry_id: UUID | None = None,
    entity_type: str = "case",
    entity_id: UUID | None = None,
    event_type: str = AuditEventType.CASE_OPENED,
    actor: str = "engine",
    payload: dict[str, Any] | None = None,
    created_at: datetime | None = None,
    hmac_signature: str = "deadbeef",
    signature_valid: bool | None = None,
) -> AuditEntry:
    return AuditEntry(
        id=entry_id or FIXED_ID,
        entity_type=entity_type,
        entity_id=entity_id or FIXED_ENTITY_ID,
        event_type=event_type,
        actor=actor,
        payload=payload or {"key": "value"},
        created_at=created_at or FIXED_TS,
        hmac_signature=hmac_signature,
        signature_valid=signature_valid,
    )


def _make_mock_conn(fetchall_return: list | None = None) -> MagicMock:
    """Return a mocked psycopg.Connection with a fake cursor."""
    conn = MagicMock()
    cur = MagicMock()
    cur.__enter__ = MagicMock(return_value=cur)
    cur.__exit__ = MagicMock(return_value=False)
    cur.fetchall.return_value = fetchall_return or []
    conn.cursor.return_value = cur
    return conn


def _compute_expected_sig(entry: AuditEntry) -> str:
    msg = _canonical_message(
        entry_id=entry.id,
        entity_type=entry.entity_type,
        entity_id=entry.entity_id,
        event_type=entry.event_type,
        actor=entry.actor,
        payload=entry.payload,
        created_at=entry.created_at,
    )
    return _sign(msg, SIGNING_KEY)


# ── _canonical_message ─────────────────────────────────────────────────────


class TestCanonicalMessage:
    def test_returns_bytes(self) -> None:
        msg = _canonical_message(
            entry_id=FIXED_ID,
            entity_type="case",
            entity_id=FIXED_ENTITY_ID,
            event_type="case_opened",
            actor="engine",
            payload={"k": "v"},
            created_at=FIXED_TS,
        )
        assert isinstance(msg, bytes)

    def test_is_valid_json(self) -> None:
        msg = _canonical_message(
            entry_id=FIXED_ID,
            entity_type="case",
            entity_id=FIXED_ENTITY_ID,
            event_type="case_opened",
            actor="engine",
            payload={"k": "v"},
            created_at=FIXED_TS,
        )
        doc = json.loads(msg.decode())
        assert doc["id"] == str(FIXED_ID)
        assert doc["entity_type"] == "case"
        assert doc["entity_id"] == str(FIXED_ENTITY_ID)
        assert doc["event_type"] == "case_opened"
        assert doc["actor"] == "engine"
        assert doc["payload"] == {"k": "v"}
        assert doc["created_at"] == FIXED_TS.isoformat()

    def test_keys_are_sorted(self) -> None:
        msg = _canonical_message(
            entry_id=FIXED_ID,
            entity_type="case",
            entity_id=FIXED_ENTITY_ID,
            event_type="case_opened",
            actor="engine",
            payload={},
            created_at=FIXED_TS,
        )
        raw = msg.decode()
        # Verify sort_keys=True was applied: parse the JSON to check key order
        # (json.dumps with sort_keys produces ASCII-sorted keys)
        keys = list(json.loads(raw).keys())
        assert keys == sorted(keys)

    def test_deterministic_for_same_inputs(self) -> None:
        kwargs: dict = dict(
            entry_id=FIXED_ID,
            entity_type="case",
            entity_id=FIXED_ENTITY_ID,
            event_type="case_opened",
            actor="engine",
            payload={"x": 1},
            created_at=FIXED_TS,
        )
        assert _canonical_message(**kwargs) == _canonical_message(**kwargs)

    def test_different_payloads_produce_different_messages(self) -> None:
        base: dict = dict(
            entry_id=FIXED_ID,
            entity_type="case",
            entity_id=FIXED_ENTITY_ID,
            event_type="case_opened",
            actor="engine",
            created_at=FIXED_TS,
        )
        m1 = _canonical_message(**base, payload={"a": 1})
        m2 = _canonical_message(**base, payload={"a": 2})
        assert m1 != m2


# ── _sign ─────────────────────────────────────────────────────────────────


class TestSign:
    def test_returns_64_char_hex(self) -> None:
        sig = _sign(b"hello", SIGNING_KEY)
        assert len(sig) == 64
        assert all(c in "0123456789abcdef" for c in sig)

    def test_matches_hmac_sha256(self) -> None:
        msg = b"test message"
        expected = hmac_module.new(SIGNING_KEY, msg, hashlib.sha256).hexdigest()
        assert _sign(msg, SIGNING_KEY) == expected

    def test_different_keys_produce_different_sigs(self) -> None:
        msg = b"same message"
        assert _sign(msg, b"key1") != _sign(msg, b"key2")

    def test_different_messages_produce_different_sigs(self) -> None:
        assert _sign(b"msg1", SIGNING_KEY) != _sign(b"msg2", SIGNING_KEY)


# ── verify_signature ──────────────────────────────────────────────────────


class TestVerifySignature:
    def _signed_entry(self, payload: dict[str, Any] | None = None) -> AuditEntry:
        p = payload or {"k": "v"}
        msg = _canonical_message(
            entry_id=FIXED_ID,
            entity_type="case",
            entity_id=FIXED_ENTITY_ID,
            event_type=AuditEventType.CASE_OPENED,
            actor="engine",
            payload=p,
            created_at=FIXED_TS,
        )
        sig = _sign(msg, SIGNING_KEY)
        return _make_entry(
            entry_id=FIXED_ID,
            entity_id=FIXED_ENTITY_ID,
            payload=p,
            created_at=FIXED_TS,
            hmac_signature=sig,
        )

    def test_valid_signature_returns_true(self) -> None:
        entry = self._signed_entry()
        assert verify_signature(entry, SIGNING_KEY) is True

    def test_wrong_key_returns_false(self) -> None:
        entry = self._signed_entry()
        assert verify_signature(entry, b"wrong-key") is False

    def test_tampered_payload_returns_false(self) -> None:
        entry = self._signed_entry({"original": True})
        # Modify the payload without updating the signature
        tampered = entry.model_copy(update={"payload": {"tampered": True}})
        assert verify_signature(tampered, SIGNING_KEY) is False

    def test_tampered_actor_returns_false(self) -> None:
        entry = self._signed_entry()
        tampered = entry.model_copy(update={"actor": "attacker"})
        assert verify_signature(tampered, SIGNING_KEY) is False

    def test_tampered_event_type_returns_false(self) -> None:
        entry = self._signed_entry()
        tampered = entry.model_copy(update={"event_type": "case_closed"})
        assert verify_signature(tampered, SIGNING_KEY) is False


# ── append_audit_entry ────────────────────────────────────────────────────


class TestAppendAuditEntry:
    def _do_append(
        self,
        conn: MagicMock,
        entity_id: UUID | None = None,
        event_type: str = AuditEventType.CASE_OPENED,
        payload: dict[str, Any] | None = None,
    ) -> AuditEntry:
        return append_audit_entry(
            conn,
            entity_type="case",
            entity_id=entity_id or FIXED_ENTITY_ID,
            event_type=event_type,
            actor="engine",
            payload=payload or {"test": True},
            signing_key=SIGNING_KEY,
        )

    def test_returns_audit_entry(self) -> None:
        conn = _make_mock_conn()
        entry = self._do_append(conn)
        assert isinstance(entry, AuditEntry)

    def test_entry_has_uuid_id(self) -> None:
        conn = _make_mock_conn()
        entry = self._do_append(conn)
        assert isinstance(entry.id, UUID)

    def test_entry_has_tz_aware_created_at(self) -> None:
        conn = _make_mock_conn()
        entry = self._do_append(conn)
        assert entry.created_at.tzinfo is not None

    def test_entry_hmac_signature_is_64_chars(self) -> None:
        conn = _make_mock_conn()
        entry = self._do_append(conn)
        assert len(entry.hmac_signature) == 64

    def test_signature_verifies_immediately(self) -> None:
        conn = _make_mock_conn()
        entry = self._do_append(conn)
        assert verify_signature(entry, SIGNING_KEY) is True

    def test_signature_valid_is_none_on_append(self) -> None:
        """append_audit_entry does not verify; signature_valid stays None."""
        conn = _make_mock_conn()
        entry = self._do_append(conn)
        assert entry.signature_valid is None

    def test_fields_match_inputs(self) -> None:
        conn = _make_mock_conn()
        eid = uuid4()
        entry = self._do_append(conn, entity_id=eid, payload={"x": 42})
        assert entry.entity_type == "case"
        assert entry.entity_id == eid
        assert entry.actor == "engine"
        assert entry.payload == {"x": 42}

    def test_cursor_execute_called_once(self) -> None:
        conn = _make_mock_conn()
        self._do_append(conn)
        cur = conn.cursor.return_value.__enter__.return_value
        assert cur.execute.call_count == 1

    def test_sql_contains_insert(self) -> None:
        conn = _make_mock_conn()
        self._do_append(conn)
        cur = conn.cursor.return_value.__enter__.return_value
        sql = cur.execute.call_args[0][0]
        assert "INSERT INTO" in sql
        assert "audit_log" in sql


# ── AuditEventType round-trip ─────────────────────────────────────────────


class TestAuditEventTypeRoundTrip:
    """Every AuditEventType value must pass through append + retrieval intact."""

    @pytest.mark.parametrize(
        "event_type",
        list(AuditEventType),
        ids=[e.value for e in AuditEventType],
    )
    def test_event_type_survives_append(self, event_type: AuditEventType) -> None:
        conn = _make_mock_conn()
        entry = append_audit_entry(
            conn,
            entity_type="case",
            entity_id=FIXED_ENTITY_ID,
            event_type=event_type,
            actor="engine",
            payload={},
            signing_key=SIGNING_KEY,
        )
        assert entry.event_type == event_type

    @pytest.mark.parametrize(
        "event_type",
        list(AuditEventType),
        ids=[e.value for e in AuditEventType],
    )
    def test_event_type_in_signature_scope(self, event_type: AuditEventType) -> None:
        """Changing event_type must invalidate the signature (proving it's in scope)."""
        conn = _make_mock_conn()
        entry = append_audit_entry(
            conn,
            entity_type="case",
            entity_id=FIXED_ENTITY_ID,
            event_type=event_type,
            actor="engine",
            payload={},
            signing_key=SIGNING_KEY,
        )
        # Replace event_type with something different
        other_events = [e for e in AuditEventType if e != event_type]
        if not other_events:
            return  # only one event type, skip
        tampered = entry.model_copy(update={"event_type": other_events[0]})
        assert verify_signature(tampered, SIGNING_KEY) is False


# ── get_audit_trail ───────────────────────────────────────────────────────


class TestGetAuditTrail:
    def _row(
        self,
        *,
        eid: UUID | None = None,
        entity_type: str = "case",
        event_type: str = AuditEventType.CASE_OPENED,
        actor: str = "engine",
        payload: dict | None = None,
        sig: str = "a" * 64,
    ) -> tuple:
        """Build a DB row tuple as psycopg would return."""
        p = payload or {}
        ts = FIXED_TS
        eid = eid or FIXED_ENTITY_ID
        return (
            str(uuid4()),  # id
            entity_type,
            str(eid),
            event_type,
            actor,
            p,            # payload (psycopg3 returns dict directly for JSONB)
            sig,
            ts,
        )

    def test_returns_list_of_audit_entries(self) -> None:
        row = self._row()
        conn = _make_mock_conn(fetchall_return=[row])
        results = get_audit_trail(conn, verify_signatures=False)
        assert len(results) == 1
        assert isinstance(results[0], AuditEntry)

    def test_empty_result(self) -> None:
        conn = _make_mock_conn(fetchall_return=[])
        results = get_audit_trail(conn, verify_signatures=False)
        assert results == []

    def test_verify_signatures_false_leaves_signature_valid_none(self) -> None:
        row = self._row()
        conn = _make_mock_conn(fetchall_return=[row])
        results = get_audit_trail(conn, verify_signatures=False)
        assert results[0].signature_valid is None

    def test_verify_signatures_requires_signing_key(self) -> None:
        conn = _make_mock_conn(fetchall_return=[])
        with pytest.raises(ValueError, match="signing_key"):
            get_audit_trail(conn, verify_signatures=True, signing_key=None)

    def test_verify_signatures_true_populates_signature_valid(self) -> None:
        """With a real signature the field should be True or False (not None)."""
        conn_for_append = _make_mock_conn()
        entry = append_audit_entry(
            conn_for_append,
            entity_type="case",
            entity_id=FIXED_ENTITY_ID,
            event_type=AuditEventType.OBLIGATION_FIRED,
            actor="engine",
            payload={"x": 1},
            signing_key=SIGNING_KEY,
        )
        # Build a DB row from the appended entry
        row = (
            str(entry.id),
            entry.entity_type,
            str(entry.entity_id),
            entry.event_type,
            entry.actor,
            entry.payload,
            entry.hmac_signature,
            entry.created_at,
        )
        conn = _make_mock_conn(fetchall_return=[row])
        results = get_audit_trail(conn, verify_signatures=True, signing_key=SIGNING_KEY)
        assert results[0].signature_valid is True

    def test_entity_id_filter_added_to_sql(self) -> None:
        conn = _make_mock_conn(fetchall_return=[])
        eid = uuid4()
        get_audit_trail(conn, entity_id=eid, verify_signatures=False)
        cur = conn.cursor.return_value.__enter__.return_value
        sql, params = cur.execute.call_args[0]
        assert "entity_id" in sql
        assert str(eid) in params

    def test_entity_type_filter_added_to_sql(self) -> None:
        conn = _make_mock_conn(fetchall_return=[])
        get_audit_trail(conn, entity_type="fired_obligation", verify_signatures=False)
        cur = conn.cursor.return_value.__enter__.return_value
        sql, params = cur.execute.call_args[0]
        assert "entity_type" in sql
        assert "fired_obligation" in params

    def test_event_type_filter_added_to_sql(self) -> None:
        conn = _make_mock_conn(fetchall_return=[])
        get_audit_trail(
            conn,
            event_type=AuditEventType.OBLIGATION_FIRED,
            verify_signatures=False,
        )
        cur = conn.cursor.return_value.__enter__.return_value
        sql, _params = cur.execute.call_args[0]
        assert "event_type" in sql

    def test_since_filter_added_to_sql(self) -> None:
        conn = _make_mock_conn(fetchall_return=[])
        get_audit_trail(conn, since=FIXED_TS, verify_signatures=False)
        cur = conn.cursor.return_value.__enter__.return_value
        sql, params = cur.execute.call_args[0]
        assert "created_at" in sql
        assert FIXED_TS in params

    def test_payload_as_string_is_parsed(self) -> None:
        """psycopg may return JSONB as a string; get_audit_trail must parse it."""
        row = list(self._row())
        row[5] = '{"string_payload": true}'  # str instead of dict
        conn = _make_mock_conn(fetchall_return=[tuple(row)])
        results = get_audit_trail(conn, verify_signatures=False)
        assert results[0].payload == {"string_payload": True}

    def test_multiple_filters_all_applied(self) -> None:
        conn = _make_mock_conn(fetchall_return=[])
        eid = uuid4()
        get_audit_trail(
            conn,
            entity_id=eid,
            entity_type="case",
            event_type=AuditEventType.CASE_OPENED,
            verify_signatures=False,
        )
        cur = conn.cursor.return_value.__enter__.return_value
        sql, _params = cur.execute.call_args[0]
        assert sql.count("AND") >= 2
