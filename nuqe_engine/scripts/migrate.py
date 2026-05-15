"""
migrations runner.

Applies all SQL migrations in migrations/ in numbered order.
Tracks applied migrations in a schema_migrations table so re-running is a no-op.

Usage:
    python -m scripts.migrate            # reads DATABASE_URL from env / .env
    nuqe-engine migrate                  # via CLI entry point (wired in cli.py)
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import psycopg

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).parent.parent / "migrations"

_CREATE_TRACKING_TABLE = """
CREATE SCHEMA IF NOT EXISTS nuqe_engine;

CREATE TABLE IF NOT EXISTS nuqe_engine.schema_migrations (
    filename    TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


def _pending_migrations(conn: psycopg.Connection) -> list[Path]:
    """Return migration files not yet recorded in schema_migrations, in order."""
    applied: set[str] = set()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT filename FROM nuqe_engine.schema_migrations ORDER BY filename"
        )
        applied = {row[0] for row in cur.fetchall()}

    all_files = sorted(
        f for f in MIGRATIONS_DIR.glob("*.sql") if f.is_file()
    )
    return [f for f in all_files if f.name not in applied]


def run_migrations(database_url: str) -> int:
    """
    Apply all pending migrations. Returns the count of migrations applied.

    Raises on connection failure or SQL error.
    """
    with psycopg.connect(database_url, autocommit=True) as conn:
        # Ensure tracking table exists (idempotent DDL)
        with conn.cursor() as cur:
            cur.execute(_CREATE_TRACKING_TABLE)

        pending = _pending_migrations(conn)
        if not pending:
            logger.info("No pending migrations.")
            return 0

        applied = 0
        for migration_file in pending:
            logger.info("Applying %s ...", migration_file.name)
            sql = migration_file.read_text(encoding="utf-8")
            with conn.cursor() as cur:
                cur.execute(sql)
                cur.execute(
                    "INSERT INTO nuqe_engine.schema_migrations (filename) VALUES (%s)",
                    (migration_file.name,),
                )
            logger.info("Applied %s", migration_file.name)
            applied += 1

        return applied


def main() -> None:
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass  # python-dotenv is optional; rely on environment variables directly

    database_url = os.environ.get(
        "DATABASE_URL", "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine"
    )
    if not database_url:
        raise SystemExit("DATABASE_URL environment variable is not set.")

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    count = run_migrations(database_url)
    if count:
        print(f"Applied {count} migration(s).")
    else:
        print("Nothing to apply — database is up to date.")


if __name__ == "__main__":
    main()
