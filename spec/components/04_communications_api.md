# Component 04: Communications API

## Status
PARTIAL — endpoint exists, response shape and field completeness unverified

## Purpose
Returns all communications for a case in chronological order across
all channels. The unified timeline in the Case View depends entirely
on this endpoint returning the correct fields.

## Dependencies
- Database: communications, cases, customers tables
- Auth: all endpoints require valid JWT

## Endpoints

### GET /api/v1/communications
Query params: caseId (required uuid), limit (default 50), offset (default 0)
Response: { communications: Communication[], total: number }
Each Communication MUST include:
  id, case_id, customer_id, channel, direction, subject,
  body, author_type, author_id, ai_generated, ai_approved_by,
  ai_approved_at, sent_at, external_ref
Ordered by: sent_at ASC
The ai_approved_at field is how the frontend determines if a draft
is still pending (null = pending, has value = approved)

### POST /api/v1/communications
Body: { case_id, channel, direction, subject?, body, author_type }
Response: 201 with created communication

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| COMMS-001 | GET /communications?caseId returns ordered by sent_at ASC | NOT RUN | |
| COMMS-002 | Response includes ai_generated and ai_approved_at fields | NOT RUN | |
| COMMS-003 | Response includes author_type field | NOT RUN | |
| COMMS-004 | Pending AI draft has ai_approved_at = null | NOT RUN | |
| COMMS-005 | Approved AI draft has ai_approved_at set and ai_approved_by set | NOT RUN | |
| COMMS-006 | GET without caseId returns 400 | NOT RUN | |
| COMMS-007 | Returns empty array for case with no communications | NOT RUN | |
| COMMS-008 | Communications from email, chat, and postal appear correctly | NOT RUN | |

## Claude Code Prompt
```
Read spec/components/04_communications_api.md carefully.

First run this query to check what communications exist in the database:
docker exec -it nuqe-api-1 node -e "
const {Pool} = require('pg');
const p = new Pool({connectionString: process.env.DATABASE_URL});
p.query('SELECT id, case_id, channel, direction, author_type, ai_generated, ai_approved_at, sent_at FROM communications ORDER BY sent_at').then(r => {console.log(JSON.stringify(r.rows,null,2)); p.end()});
"

Then call GET /api/v1/communications?caseId=[first_case_id] and
check the response includes all required fields listed in the spec.

Fix any missing fields. All JOINs and field selections must match
the spec exactly.

Write and run tests COMMS-001 through COMMS-008.
Update test status in this file and spec/test_registry.md.
```
