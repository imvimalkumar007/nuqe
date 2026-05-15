"""Pre-flight checks for F3.2."""
import psycopg

# Check RLS on cases as nuqe_app
conn = psycopg.connect("postgresql://nuqe_app:nuqe_secret@localhost:5432/nuqe", autocommit=True)
cur = conn.cursor()
cur.execute("SELECT count(*) FROM nuqe_engine.cases")
cases_count = cur.fetchone()[0]
print(f"cases count (nuqe_app, no org context): {cases_count}")
conn.close()

# Get pilot org_id as nuqe (migration role)
conn2 = psycopg.connect("postgresql://nuqe:nuqe_secret@localhost:5432/nuqe", autocommit=True)
cur2 = conn2.cursor()
cur2.execute("SELECT id, slug FROM nuqe_engine.organisations")
orgs = cur2.fetchall()
print(f"organisations: {orgs}")
conn2.close()
