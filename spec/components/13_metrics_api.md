# Component 13: Metrics API

## Status
BROKEN — dashboard-summary endpoint returns 0 for all counts.
Confirmed with 8 cases and 18 deadlines in database (22 April 2026).

## Purpose
Powers the four metric cards on the Complaints Dashboard and the
Analytics Dashboard charts. All counts must reflect real-time
database state.

## Dependencies
- Database: cases, deadlines, ai_actions tables
- Auth: all endpoints require valid JWT

## Endpoints

### GET /api/v1/metrics/dashboard-summary
CONFIRMED BROKEN
Response: {
  breach_risk_count: number,  (expected: 2, actual: 0)
  under_review_count: number, (expected: 3, actual: 0)
  open_count: number,         (expected: 3, actual: 0)
  fos_referred_count: number  (expected: 1, actual: 0)
}

Correct SQL for breach_risk_count:
SELECT COUNT(DISTINCT c.id) FROM cases c
JOIN deadlines d ON d.case_id = c.id
WHERE c.status IN ('open', 'under_review')
AND d.deadline_type = 'FINAL_RESPONSE'
AND d.due_at <= NOW() + INTERVAL '48 hours'
AND d.breached = false
AND d.met_at IS NULL

### GET /api/v1/metrics/ai-accuracy
Query params: dateFrom, dateTo (ISO strings, default last 30 days)
Response: {
  overall_approval_rate: number (percentage),
  edit_rate: number,
  rejection_rate: number,
  approval_rate_by_action_type: { [actionType]: number },
  classification_accuracy: { [category]: number },
  volume_by_day: { date: string, count: number }[],
  tokeniser_additions_this_month: number
}

### GET /api/v1/metrics/model-comparison
Same date params as ai-accuracy.
Response: same shape as ai-accuracy but grouped by ai_provider and ai_model.
Includes ab_split: 'primary' | 'challenger' per result.

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| MET-001 | GET /metrics/dashboard-summary returns 200 | NOT RUN | |
| MET-002 | breach_risk_count = 2 with seed data | NOT RUN | Expected 2, getting 0 |
| MET-003 | under_review_count = 3 with seed data | NOT RUN | Expected 3, getting 0 |
| MET-004 | open_count = 3 with seed data | NOT RUN | Expected 3, getting 0 |
| MET-005 | fos_referred_count = 1 with seed data | NOT RUN | Expected 1, getting 0 |
| MET-006 | GET /metrics/ai-accuracy returns structured response | NOT RUN | |
| MET-007 | ai-accuracy handles empty ai_actions gracefully | NOT RUN | |
| MET-008 | GET /metrics/model-comparison returns per-model breakdown | NOT RUN | |

## Claude Code Prompt
```
Read spec/components/13_metrics_api.md carefully.

This component is confirmed broken. The dashboard-summary endpoint
returns 0 for all four counts despite 8 cases and 18 deadlines
existing in the database.

Step 1: Find the broken endpoint.
Search for dashboard-summary in the entire api/src directory.
If it does not exist, create it. If it exists, show me the
current SQL query it uses.

Step 2: Run diagnostic SQL directly.
docker exec -it nuqe-api-1 node -e "
const {Pool} = require('pg');
const p = new Pool({connectionString: process.env.DATABASE_URL});
Promise.all([
  p.query(\"SELECT COUNT(*) FROM cases WHERE status = 'open'\"),
  p.query(\"SELECT COUNT(*) FROM cases WHERE status = 'under_review'\"),
  p.query(\"SELECT COUNT(*) FROM cases WHERE status = 'fos_referred'\"),
  p.query(\"SELECT COUNT(DISTINCT c.id) FROM cases c JOIN deadlines d ON d.case_id = c.id WHERE c.status IN ('open','under_review') AND d.deadline_type = 'FINAL_RESPONSE' AND d.due_at <= NOW() + INTERVAL '48 hours' AND d.breached = false AND d.met_at IS NULL\")
]).then(([open,review,fos,breach]) => {
  console.log('open:', open.rows[0].count);
  console.log('under_review:', review.rows[0].count);
  console.log('fos_referred:', fos.rows[0].count);
  console.log('breach_risk:', breach.rows[0].count);
  p.end();
})
"

Step 3: Fix the endpoint using the exact SQL from this spec.

Step 4: Also check what endpoint ComplaintsDashboard.jsx calls
for the metric cards. Confirm the frontend is calling
/api/v1/metrics/dashboard-summary and the response shape matches.

Step 5: Write and run tests MET-001 through MET-008.
All must pass before finishing.

Update test status in this file and spec/test_registry.md.
```
