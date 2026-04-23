# Component 06: Deadline Engine

## Status
VERIFIED — all 8 tests passing (23 April 2026)

## Purpose
Calculates regulatory deadlines for each case based on the active
jurisdiction ruleset. Monitors all open deadlines and fires alerts
at 5 days, 48 hours, and 24 hours before breach. Marks deadlines
as breached when due_at passes with no met_at value.

## Dependencies
- Database: deadlines, cases, ruleset tables
- BullMQ/Redis: deadline-monitor job runs every 15 minutes

## Key Functions

### calculateDeadlines(caseId)
- Reads case.opened_at and case.ruleset_id
- Queries ruleset for all active rules matching the jurisdiction
- For each rule, inserts a deadline row: due_at = opened_at + threshold_days
- Must be idempotent (no duplicate rows if called twice)

### checkDeadlines()
- Queries all deadlines where met_at IS NULL and breached = false
- For each deadline, computes time remaining
- If <= 5 days: set alerted_at_5d if not already set
- If <= 48 hours: set alerted_at_48h if not already set
- If <= 24 hours: set alerted_at_24h if not already set
- If due_at < NOW(): set breached = true, breached_at = NOW()
- Every state change writes to audit_log

## Notes
- audit_log timestamp column is `ts` (not `created_at`)
- UK: 3 rules (ACKNOWLEDGE 3d, FINAL_RESPONSE 56d, FOS_REFERRAL 56d) — calendar days
- India: 3 rules (ACKNOWLEDGE 5bd, FINAL_RESPONSE 30d, OMBUDSMAN_REFERRAL 30d)
- EU: 4 rules (ACKNOWLEDGE 5bd, FINAL_RESPONSE 15bd, FINAL_RESPONSE_EXT 35bd, ADR_REFERRAL 35bd)

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| DENG-001 | calculateDeadlines creates 3 rows for a UK case | PASS | 23 Apr 2026 |
| DENG-002 | due_at = opened_at + threshold_days for each rule | PASS | 23 Apr 2026 |
| DENG-003 | checkDeadlines sets alerted_at_48h when within 48 hours | PASS | 23 Apr 2026 |
| DENG-004 | checkDeadlines sets alerted_at_24h when within 24 hours | PASS | 23 Apr 2026 |
| DENG-005 | checkDeadlines sets breached=true when due_at has passed | PASS | 23 Apr 2026 |
| DENG-006 | checkDeadlines writes to audit_log on state change | PASS | 23 Apr 2026 |
| DENG-007 | checkDeadlines does not re-alert already-alerted deadlines | PASS | 23 Apr 2026 |
| DENG-008 | calculateDeadlines is idempotent when called twice | PASS | 23 Apr 2026 |
