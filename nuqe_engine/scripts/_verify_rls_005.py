"""Verify RLS is binding on organisation_libraries for nuqe_app."""
import psycopg

conn = psycopg.connect("postgresql://nuqe_app:nuqe_secret@localhost:5432/nuqe", autocommit=True)
cur = conn.cursor()
cur.execute("SELECT count(*) FROM nuqe_engine.organisation_libraries")
count = cur.fetchone()[0]
print(f"organisation_libraries count (nuqe_app, no org context): {count}")
assert count == 0, f"Expected 0, got {count} — RLS may not be binding!"
print("RLS OK: returned 0 as expected.")
conn.close()
