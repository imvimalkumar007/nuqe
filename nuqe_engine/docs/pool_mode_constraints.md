# Pool Mode Constraints

## Current state (F2)

pgbouncer is NOT currently deployed. F2 uses direct psycopg connections —
`psycopg.connect()` or `psycopg.AsyncConnection.connect()` called per request/context.
There is no connection pooler between the application and Postgres.

This is acceptable for the current pilot scale. pgbouncer (or another pooler) may be
introduced in F4 or later when concurrent connection counts become a concern.

---

## If pgbouncer is added in future: CRITICAL constraint

### STATEMENT MODE IS FORBIDDEN

pgbouncer `pool_mode = statement` **must never be used** with nuqe_engine.

Reason: F3.2 introduces PostgreSQL row-level security (RLS) with per-request org context
set via `SET LOCAL`. `SET LOCAL` is transaction-scoped — it is reset at transaction end.
In statement mode, pgbouncer recycles the connection after every statement, which means
`SET LOCAL` is lost mid-transaction and RLS context leaks between requests.

This is a data-isolation security bug, not just a performance issue.

### Permitted modes

| Mode | Safe? | Notes |
|------|-------|-------|
| `session` | Yes | Connection held for the lifetime of a client session; `SET LOCAL` behaves correctly |
| `transaction` | Yes | Connection held for the duration of a transaction; `SET LOCAL` is reset at COMMIT/ROLLBACK, which is correct behaviour |
| `statement` | **NO** | Forbidden. SET LOCAL is lost; RLS org context leaks. |

### How to verify pool mode

If pgbouncer is deployed, verify the mode before any F3.2+ deployment:

```sql
-- Connect to the admin port (default 6432) and run:
SHOW pool_mode;
```

Or inspect the pgbouncer configuration file directly:

```ini
# pgbouncer.ini
[pgbouncer]
pool_mode = transaction   -- must be "transaction" or "session", never "statement"
```

On Render or managed pgbouncer services, the pool mode is set in the service
configuration UI or environment variables — confirm before enabling.

---

## Related

- F3.2 spec: RLS org context via `SET LOCAL nuqe.org_id = '<uuid>'`
- Gap 22: Multi-tenancy app-level filtering → RLS (closes F3.1)
- If pgbouncer is added and statement mode is discovered: block the deploy, fix pool_mode, redeploy.
