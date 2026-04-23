# Component 05: Deadlines API

## Status
VERIFIED — all 7 tests passing (23 April 2026)

## Purpose
Returns regulatory deadlines for a case. Powers the DISP deadline
panel in the Case View. Critical for the breach risk calculation.

## Dependencies
- Database: deadlines, cases, ruleset tables
- Auth: all endpoints require valid JWT
- Deadline Engine: must have run calculateDeadlines for seeded cases

## Endpoints

### GET /api/v1/deadlines
Query params: case_id (required uuid)
Response: { deadlines: Deadline[] }
Each Deadline includes:
  id, case_id, ruleset_id, deadline_type, due_at,
  alerted_at_5d, alerted_at_48h, alerted_at_24h,
  met_at, breached, breached_at, breach_reason,
  created_at, updated_at
Ordered by: due_at ASC

## Expected Deadlines with Seed Data
Each UK case should have 3 deadline rows:
- ACKNOWLEDGE (3 days from opened_at)
- FINAL_RESPONSE (56 days from opened_at)
- FOS_REFERRAL (56 days from opened_at)

NQ-2026-0004 (James Whitfield, fos_referred) — 0 deadlines
NQ-2026-0008 (Marcus Tetteh second case, closed_not_upheld) — 0 deadlines
Remaining 6 cases × 3 = 18 deadline rows total

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| DEAD-001 | GET /deadlines?case_id returns all deadlines for the case | PASS | 23 Apr 2026 |
| DEAD-002 | Deadline rows include all required fields | PASS | 23 Apr 2026 |
| DEAD-003 | UK case has three deadline rows | PASS | 23 Apr 2026 |
| DEAD-004 | Breach risk case has FINAL_RESPONSE due_at within 48 hours | PASS | 23 Apr 2026 |
| DEAD-005 | FOS referred case (James Whitfield) has no pending deadlines | PASS | 23 Apr 2026 |
| DEAD-006 | GET without case_id returns 400 | PASS | 23 Apr 2026 |
| DEAD-007 | calculateDeadlines does not create duplicate rows | PASS | 23 Apr 2026 |
