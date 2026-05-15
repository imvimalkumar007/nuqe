"""
Audit log RLS isolation test (F3.2).

Verifies that audit entries written under one org cannot be read back when
the DB session is set to a different org's context. Requires a live DB.
"""

from __future__ import annotations

import os
from uuid import UUID, uuid4

import psycopg
import pytest

from nuqe_engine.audit import AuditEventType, append_audit_entry, get_audit_trail
from nuqe_engine.engine import Engine

_PILOT_ORG_ID = UUID(os.environ.get("PILOT_ORG_ID", "a9f318f7-d5be-4235-974e-b3864cc487c1"))
_OTHER_ORG_ID = UUID("00000000-0000-0000-0000-000000000002")


def _signing_key() -> bytes:
    key = os.environ.get("AUDIT_SIGNING_KEY", "test-key-for-isolation")
    return key.encode() if isinstance(key, str) else key


@pytest.mark.integration
def test_audit_entry_not_visible_across_org_boundary() -> None:
    """
    Write an audit entry under the pilot org; read it back under a different
    org context — the row must not be returned.

    This test verifies that the RLS policy on nuqe_engine.audit_log isolates
    entries by org_id. If RLS is not configured correctly, the second org would
    be able to read the first org's entries and the assertion would fail.
    """
    engine = Engine.from_env()
    key = _signing_key()
    # Use a unique entity_id so this test is isolated from other runs
    entity_id = uuid4()

    # Step 1: write an audit entry under the pilot org
    with engine.connect(_PILOT_ORG_ID) as conn:
        append_audit_entry(
            conn,
            entity_type="test_isolation",
            entity_id=entity_id,
            event_type=AuditEventType.CASE_OPENED,
            actor="test",
            payload={"isolation_marker": str(entity_id)},
            signing_key=key,
        )

    # Step 2: read it back under the same org — must be found
    with engine.connect(_PILOT_ORG_ID) as conn:
        entries_same_org = get_audit_trail(
            conn,
            entity_id=entity_id,
            entity_type="test_isolation",
            verify_signatures=True,
            signing_key=key,
        )
    assert len(entries_same_org) == 1, (
        f"Expected 1 audit entry for pilot org, got {len(entries_same_org)}"
    )
    assert entries_same_org[0].payload["isolation_marker"] == str(entity_id)
    assert entries_same_org[0].signature_valid is True

    # Step 3: read under a different org — must NOT be found (RLS isolation)
    # Use a direct psycopg connection to set a different org context.
    database_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine",
    )
    with psycopg.connect(database_url) as conn:
        conn.execute("BEGIN")
        conn.execute("SET LOCAL app.current_org_id = %s", (str(_OTHER_ORG_ID),))
        entries_other_org = get_audit_trail(
            conn,
            entity_id=entity_id,
            entity_type="test_isolation",
            verify_signatures=False,
            signing_key=key,
        )
        conn.rollback()

    assert len(entries_other_org) == 0, (
        f"RLS BREACH: org {_OTHER_ORG_ID} can read {len(entries_other_org)} "
        f"audit entries belonging to org {_PILOT_ORG_ID}"
    )


@pytest.mark.integration
def test_audit_entry_signature_valid_after_roundtrip() -> None:
    """
    Append an audit entry and verify the HMAC signature survives a DB roundtrip.
    """
    engine = Engine.from_env()
    key = _signing_key()
    entity_id = uuid4()

    with engine.connect(_PILOT_ORG_ID) as conn:
        append_audit_entry(
            conn,
            entity_type="test_isolation",
            entity_id=entity_id,
            event_type=AuditEventType.CASE_OPENED,
            actor="test",
            payload={"roundtrip_marker": str(entity_id)},
            signing_key=key,
        )

    with engine.connect(_PILOT_ORG_ID) as conn:
        entries = get_audit_trail(
            conn,
            entity_id=entity_id,
            entity_type="test_isolation",
            verify_signatures=True,
            signing_key=key,
        )

    assert len(entries) == 1
    assert entries[0].signature_valid is True
