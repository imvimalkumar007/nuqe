# Component 06: Deadline Engine

## Status
BUILT — code exists, never verified with tests

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

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| DENG-001 | calculateDeadlines creates 3 rows for a UK case | NOT RUN | |
| DENG-002 | due_at = opened_at + threshold_days for each rule | NOT RUN | |
| DENG-003 | checkDeadlines sets alerted_at_48h when within 48 hours | NOT RUN | |
| DENG-004 | checkDeadlines sets alerted_at_24h when within 24 hours | NOT RUN | |
| DENG-005 | checkDeadlines sets breached=true when due_at passed | NOT RUN | |
| DENG-006 | checkDeadlines writes to audit_log on state change | NOT RUN | |
| DENG-007 | checkDeadlines does not re-alert already-alerted deadlines | NOT RUN | |
| DENG-008 | calculateDeadlines is idempotent when called twice | NOT RUN | |

## Claude Code Prompt
```
Read spec/components/06_deadline_engine.md carefully.
Read spec/components/05_deadlines_api.md for context on data shape.

Open api/src/engines/deadlineEngine.js and read the current
implementation. Do not change anything yet.

Check: does calculateDeadlines correctly query the ruleset table
using the case's ruleset_id? Does it handle the case where deadline
rows already exist? Does every state change in checkDeadlines write
to audit_log?

Fix any issues found. Then write tests DENG-001 through DENG-008
in api/src/engines/deadlineEngine.test.js.

Run the tests and fix any failures before finishing.
Update test status in this file and spec/test_registry.md.
```
