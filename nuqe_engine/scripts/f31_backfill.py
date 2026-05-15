"""
F3.1 backfill script — seed pilot organisation and assign all existing rows.

Run as: .venv/Scripts/python scripts/f31_backfill.py

Uses MIGRATION_DATABASE_URL (superuser) to write data. Verifies zero NULL
org_id counts before committing.  Prints the pilot_org_id on success.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Allow running from repo root without installing the package
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import psycopg  # noqa: E402


TABLES_WITH_ORG_ID = [
    "nuqe_engine.cases",
    "nuqe_engine.fired_obligations",
    "nuqe_engine.audit_log",
    "nuqe_engine.notifications",
    "nuqe_engine.obligations",
]

PILOT_ORG = {
    "name": "Pilot Organisation",
    "slug": "pilot",
    "status": "active",
    "created_by": "f31_backfill",
}


def main() -> None:
    db_url = os.environ.get(
        "MIGRATION_DATABASE_URL",
        os.environ.get(
            "DATABASE_URL",
            "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine",
        ),
    )

    print(f"Connecting to {db_url!r} …")

    with psycopg.connect(db_url) as conn:
        conn.autocommit = False

        with conn.cursor() as cur:
            # Check if pilot org already exists
            cur.execute(
                "SELECT id FROM nuqe_engine.organisations WHERE slug = %s",
                ("pilot",),
            )
            existing = cur.fetchone()

            if existing:
                pilot_org_id = existing[0]
                print(f"Pilot org already exists: {pilot_org_id}")
            else:
                # Insert pilot org
                cur.execute(
                    """
                    INSERT INTO nuqe_engine.organisations
                        (name, slug, status, created_by)
                    VALUES (%(name)s, %(slug)s, %(status)s, %(created_by)s)
                    RETURNING id
                    """,
                    PILOT_ORG,
                )
                row = cur.fetchone()
                assert row is not None
                pilot_org_id = row[0]
                print(f"Inserted pilot org: {pilot_org_id}")

            # Set session_replication_role = replica to bypass all row-level
            # triggers (including audit_log immutability). Superuser only.
            cur.execute("SET session_replication_role = replica")

            # Update all tables where org_id is NULL
            for table in TABLES_WITH_ORG_ID:
                cur.execute(
                    f"UPDATE {table} SET org_id = %s WHERE org_id IS NULL",  # noqa: S608
                    (pilot_org_id,),
                )
                updated = cur.rowcount
                print(f"  {table}: updated {updated} rows")

            # Restore triggers
            cur.execute("SET session_replication_role = DEFAULT")

            # Verify: zero NULL counts everywhere
            print("Verifying NULL counts …")
            for table in TABLES_WITH_ORG_ID:
                cur.execute(
                    f"SELECT count(*) FROM {table} WHERE org_id IS NULL",  # noqa: S608
                )
                null_count = cur.fetchone()[0]  # type: ignore[index]
                if null_count != 0:
                    conn.rollback()
                    print(f"ERROR: {table} still has {null_count} NULL org_id rows — rolled back")
                    sys.exit(1)
                print(f"  {table}: 0 NULL rows — OK")

        conn.commit()
        print(f"\nCommitted. pilot_org_id = {pilot_org_id}")


if __name__ == "__main__":
    main()
