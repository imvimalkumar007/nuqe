# Component 05: Deadlines API

## Status
PARTIAL — endpoint likely exists, not verified against real data

## Purpose
Returns regulatory deadlines for a case. Powers the DISP deadline
panel in the Case View. Critical for the breach risk calculation.

## Dependencies
- Database: deadlines, cases, ruleset tables
- Auth: all endpoints require valid JWT
- Deadline Engine: must have run calculateDeadlines for seeded cases

## Endpoints

### GET /api/v1/deadlines
Query params: caseId (required uuid)
Response: { deadlines: Deadline[] }
Each Deadline MUST include:
  id, case_id, ruleset_id, deadline_type, due_at,
  alerted_at_5d, alerted_at_48h, alerted_at_24h,
  met_at, breached, breached_at
Ordered by: due_at ASC

## Expected Deadlines with Seed Data
Each UK case should have 3 deadline rows:
- ACKNOWLEDGE (3 days from opened_at)
- FINAL_RESPONSE (56 days from opened_at)
- FOS_REFERRAL (56 days from opened_at)

Total: 8 cases x ~3 deadlines = ~18-24 rows
Confirmed: 18 rows exist in database

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| DEAD-001 | GET /deadlines?caseId returns all deadlines for the case | NOT RUN | |
| DEAD-002 | Deadline rows include all required fields | NOT RUN | |
| DEAD-003 | UK case has three deadline rows | NOT RUN | |
| DEAD-004 | Breach risk case has FINAL_RESPONSE due_at within 48 hours | NOT RUN | |
| DEAD-005 | FOS referred case (James Whitfield) has no pending deadlines | NOT RUN | |
| DEAD-006 | GET without caseId returns 400 | NOT RUN | |
| DEAD-007 | calculateDeadlines does not create duplicate rows | NOT RUN | |

## Claude Code Prompt
```
Read spec/components/05_deadlines_api.md carefully.

First check the deadlines in the database:
docker exec -it nuqe-api-1 node -e "
const {Pool} = require('pg');
const p = new Pool({connectionString: process.env.DATABASE_URL});
p.query('SELECT c.case_ref, d.deadline_type, d.due_at, d.breached, d.met_at FROM deadlines d JOIN cases c ON c.id = d.case_id ORDER BY c.case_ref, d.deadline_type').then(r => {console.log(JSON.stringify(r.rows,null,2)); p.end()});
"

Confirm the deadline rows have the correct due_at values based on
each case's opened_at date. Report any discrepancies.

Then call GET /api/v1/deadlines?caseId=[id] and check the response
matches the spec exactly.

Write and run tests DEAD-001 through DEAD-007.
Update test status in this file and spec/test_registry.md.
```
