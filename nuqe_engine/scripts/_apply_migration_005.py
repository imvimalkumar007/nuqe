"""Apply migration 005 as the nuqe (migration) role."""
import os
import psycopg
from pathlib import Path

migration_url = os.environ.get(
    "MIGRATION_DATABASE_URL",
    "postgresql://nuqe:nuqe_secret@localhost:5432/nuqe",
)

migration_file = Path(__file__).parent.parent / "migrations" / "005_organisation_libraries.sql"
sql = migration_file.read_text()

conn = psycopg.connect(migration_url, autocommit=True)
try:
    conn.execute(sql)
    print("Migration 005 applied successfully.")
except Exception as exc:
    print(f"Migration 005 failed: {exc}")
    raise
finally:
    conn.close()
