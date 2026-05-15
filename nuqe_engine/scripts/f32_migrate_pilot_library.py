"""
F3.2: Migrate pilot library file into organisation_libraries table.

Reads LIBRARY_PATH from env, parses via load_library, and inserts a row
into nuqe_engine.organisation_libraries for the pilot org with is_active=TRUE.

Idempotent: if version 'f2-migrated-v1' already exists for this org, skips.

Requires MIGRATION_DATABASE_URL (nuqe role) to bypass RLS for the insert.
"""

from __future__ import annotations

import hashlib
import os
import sys
from io import BytesIO
from pathlib import Path

import psycopg

# ── Configuration ─────────────────────────────────────────────────────────

MIGRATION_DATABASE_URL = os.environ.get(
    "MIGRATION_DATABASE_URL",
    "postgresql://nuqe:nuqe_secret@localhost:5432/nuqe",
)
LIBRARY_PATH_STR = os.environ.get("LIBRARY_PATH", "")
PILOT_ORG_SLUG = "pilot"
LIBRARY_VERSION = "f2-migrated-v1"
UPLOADED_BY = "f3_2_migration"


def main() -> None:
    conn = psycopg.connect(MIGRATION_DATABASE_URL, autocommit=False)
    try:
        with conn.cursor() as cur:
            # Get pilot org_id
            cur.execute(
                "SELECT id FROM nuqe_engine.organisations WHERE slug = %s",
                (PILOT_ORG_SLUG,),
            )
            row = cur.fetchone()
            if row is None:
                print(f"ERROR: No organisation with slug='{PILOT_ORG_SLUG}' found.", file=sys.stderr)
                sys.exit(1)
            pilot_org_id = row[0]
            print(f"Pilot org_id: {pilot_org_id}")

            # Check idempotency
            cur.execute(
                """
                SELECT id, content_hash FROM nuqe_engine.organisation_libraries
                WHERE org_id = %s AND version = %s
                """,
                (str(pilot_org_id), LIBRARY_VERSION),
            )
            existing = cur.fetchone()
            if existing is not None:
                print(
                    f"Version '{LIBRARY_VERSION}' already exists for org {pilot_org_id} "
                    f"(id={existing[0]}, hash={existing[1]}). Skipping."
                )
                conn.rollback()
                return

        # ── Need library file ─────────────────────────────────────────────

        if not LIBRARY_PATH_STR:
            print(
                "WARNING: LIBRARY_PATH is not set. Cannot migrate library file.\n"
                "The organisation_libraries table will remain empty until a library\n"
                "is uploaded via POST /library/upload.",
            )
            conn.rollback()
            return

        lib_path = Path(LIBRARY_PATH_STR)
        if not lib_path.exists():
            print(
                f"WARNING: LIBRARY_PATH={lib_path!r} does not exist. Cannot migrate.\n"
                "The organisation_libraries table will remain empty until a library\n"
                "is uploaded via POST /library/upload.",
            )
            conn.rollback()
            return

        # Read bytes and hash
        xlsx_bytes = lib_path.read_bytes()
        content_hash = hashlib.sha256(xlsx_bytes).hexdigest()
        print(f"Library file: {lib_path}, {len(xlsx_bytes)} bytes, SHA-256: {content_hash[:16]}...")

        # Parse via loader to get row/approved counts
        # Import here to avoid loading the whole engine at module import time
        from nuqe_engine.loader import load_library as _load_library_path

        # Total rows (all statuses)
        all_rows = _load_library_path(lib_path, approved_only=False)
        row_count = len(all_rows)

        # Approved rows
        approved_rows = _load_library_path(lib_path, approved_only=True)
        approved_count = len(approved_rows)

        print(f"Parsed: {row_count} total rows, {approved_count} approved")

        # INSERT
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO nuqe_engine.organisation_libraries
                    (org_id, version, xlsx_bytes, content_hash, row_count,
                     approved_count, uploaded_by, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE)
                """,
                (
                    str(pilot_org_id),
                    LIBRARY_VERSION,
                    xlsx_bytes,
                    content_hash,
                    row_count,
                    approved_count,
                    UPLOADED_BY,
                ),
            )

        conn.commit()
        print(
            f"SUCCESS: Inserted organisation_libraries row for org {pilot_org_id}, "
            f"version='{LIBRARY_VERSION}', is_active=TRUE"
        )

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
