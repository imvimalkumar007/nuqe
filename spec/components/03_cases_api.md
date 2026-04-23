# Component 03: Cases API

## Status
VERIFIED — all 10 tests passing (23 April 2026)

## Purpose
Core entity API. Exposes complaint cases with their customer details,
deadlines, and status. The dashboard-summary endpoint powers the four
metric cards on the Complaints Dashboard.

## Dependencies
- Database: cases, customers, deadlines, ruleset tables
- Auth: all endpoints require valid JWT
- Deadline Engine: calculateDeadlines called on case creation

## Endpoints

### GET /api/v1/cases
Query params: status (optional), limit (default 20), offset (default 0)
Response: { cases: Case[], total: number }
Each Case includes: id, case_ref, customer_name (JOIN), category,
status, channel_received, opened_at, jurisdiction (from ruleset JOIN)
Ordered by: opened_at DESC

### GET /api/v1/cases/:id
Response: full case object with:
- customer: { id, full_name, email, vulnerable_flag }
- deadlines: Deadline[]
- ruleset: { jurisdiction, version }
Returns: 404 if not found

### POST /api/v1/cases
Body: { customer_id, category, channel_received, ruleset_id, notes? }
On success: creates case, calls calculateDeadlines(newCaseId)
Response: 201 with created case

### GET /api/v1/metrics/dashboard-summary
CONFIRMED BROKEN — returns 0 for all counts despite data existing
Response must be: {
  breach_risk_count: number,
  under_review_count: number,
  open_count: number,
  fos_referred_count: number
}

breach_risk_count query:
SELECT COUNT(*) FROM cases c
JOIN deadlines d ON d.case_id = c.id
WHERE c.status IN ('open', 'under_review')
AND d.deadline_type = 'FINAL_RESPONSE'
AND d.due_at <= NOW() + INTERVAL '48 hours'
AND d.breached = false
AND d.met_at IS NULL

under_review_count query:
SELECT COUNT(*) FROM cases WHERE status = 'under_review'

open_count query:
SELECT COUNT(*) FROM cases WHERE status = 'open'

fos_referred_count query:
SELECT COUNT(*) FROM cases WHERE status = 'fos_referred'

## Expected Values with Seed Data (22 April 2026)
breach_risk_count: 2 (Marcus Tetteh 2d, Sarah Okonkwo 1d)
under_review_count: 3 (Marcus Tetteh, Priya Nambiar, Sarah Okonkwo)
open_count: 3 (Aisha Conteh, Tom Barratt, Sarah Okonkwo second case)
fos_referred_count: 1 (James Whitfield)

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| CASES-001 | GET /cases returns 200 with cases array and total count | PASS | 23 Apr 2026 |
| CASES-002 | GET /cases?status=open returns only open cases | PASS | 23 Apr 2026 |
| CASES-003 | GET /cases/:id returns case with customer_name joined | PASS | 23 Apr 2026 |
| CASES-004 | GET /cases/:id returns 404 for unknown id | PASS | 23 Apr 2026 |
| CASES-005 | GET /metrics/dashboard-summary returns 200 | PASS | 23 Apr 2026 |
| CASES-006 | breach_risk_count >= 1 with seed data | PASS | 23 Apr 2026 |
| CASES-007 | under_review_count = 3 with seed data | PASS | 23 Apr 2026 |
| CASES-008 | open_count = 3 with seed data | PASS | 23 Apr 2026 |
| CASES-009 | fos_referred_count = 1 with seed data | PASS | 23 Apr 2026 |
| CASES-010 | POST /cases creates case and triggers calculateDeadlines | PASS | 23 Apr 2026 |

## Root Cause Analysis (dashboard-summary showing 0)
Most likely causes in order of probability:
1. The endpoint does not exist and the frontend is calling it incorrectly
2. The endpoint exists but queries the wrong column name
3. The deadline rows exist but the breach_risk JOIN is incorrect
4. The frontend useMetrics hook is calling a different endpoint

Debugging steps:
1. Check what endpoint ComplaintsDashboard.jsx calls for metric cards
2. Check if that endpoint exists in metrics.js or cases.js
3. Run the raw SQL queries above directly against the database
4. Confirm 18 deadline rows exist with correct deadline_type values

## Claude Code Prompt
```
Read spec/components/03_cases_api.md carefully.
Do not build anything yet.

First run these diagnostic queries inside the Docker container:
docker exec -it nuqe-api-1 node -e "
const {Pool} = require('pg');
const p = new Pool({connectionString: process.env.DATABASE_URL});
p.query(\`
  SELECT c.case_ref, c.status, d.deadline_type, d.due_at,
         d.breached, d.met_at,
         (d.due_at - NOW()) AS time_remaining
  FROM cases c
  LEFT JOIN deadlines d ON d.case_id = c.id
  ORDER BY c.case_ref, d.deadline_type
\`).then(r => {
  console.log(JSON.stringify(r.rows, null, 2));
  p.end();
});
"

Then check ComplaintsDashboard.jsx and the useMetrics hook to find
exactly what API endpoint is being called for the metric cards.
Report the endpoint URL.

Then check if that endpoint exists in the API routes and what
query it runs.

Then fix the endpoint using the exact SQL queries in the spec.

After fixing, write and run tests CASES-001 through CASES-009.
All must pass before finishing.

Update test status in this file and spec/test_registry.md.
```
