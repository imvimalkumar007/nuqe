"""Check DB state for F3.2 pre-migration."""
import psycopg

conn = psycopg.connect("postgresql://nuqe:nuqe_secret@localhost:5432/nuqe", autocommit=True)
cur = conn.cursor()

# Check obligations
cur.execute("SELECT COUNT(*) FROM nuqe_engine.obligations WHERE review_status='approved'")
approved = cur.fetchone()[0]
print(f"Approved obligations in DB: {approved}")

# Check if organisation_libraries has anything
cur.execute("SELECT COUNT(*) FROM nuqe_engine.organisation_libraries")
lib_count = cur.fetchone()[0]
print(f"organisation_libraries rows: {lib_count}")

# Check organisations
cur.execute("SELECT id, slug FROM nuqe_engine.organisations")
orgs = cur.fetchall()
print(f"Organisations: {orgs}")

# Check if LIBRARY_PATH is in env
import os
lib_path = os.environ.get("LIBRARY_PATH", "")
print(f"LIBRARY_PATH env: {lib_path!r}")

from pathlib import Path
if lib_path:
    p = Path(lib_path)
    print(f"LIBRARY_PATH exists: {p.exists()}")

conn.close()
