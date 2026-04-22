# Component 18: Frontend Analytics

## Status
PARTIAL — screen built with mock data, not wired to real endpoints

## Purpose
Shows AI accuracy metrics and model comparison charts.
Compliance managers use this to track whether AI recommendations
are being accepted, edited, or rejected over time.

## Dependencies
- Metrics API (component 13): real data endpoints
- Auth (component 02): PrivateRoute wrapper

## Key Sections

### AI Accuracy Tab
Four metric cards: Approval rate, Edit rate, Rejection rate, Volume
Bar chart: approval rate by action type
Bar chart: classification accuracy by category
Line chart: volume over time

### Model Comparison Tab
Side-by-side cards for primary vs challenger model
Shows same metrics per model
Only visible if challenger model is configured
If no challenger: show message "Configure a challenger model in Settings"

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| FE-ANA-001 | Analytics screen loads without console errors | NOT RUN | |
| FE-ANA-002 | AI Accuracy tab visible and active by default | NOT RUN | |
| FE-ANA-003 | Approval rate shown as a percentage | NOT RUN | |
| FE-ANA-004 | Empty state shown when no AI actions exist | NOT RUN | |
| FE-ANA-005 | Date range selector triggers re-fetch | NOT RUN | |
| FE-ANA-006 | Model Comparison tab hidden when no challenger configured | NOT RUN | |

## Claude Code Prompt
```
Read spec/components/18_frontend_analytics.md carefully.
Also read spec/components/13_metrics_api.md.

NOTE: Work on this component only after component 13
(Metrics API) has all tests passing.

Open web/src/components/AnalyticsDashboard.jsx.
Check what API endpoints it calls and whether they match
the real endpoints in the Metrics API spec.

Fix any endpoint mismatches. Handle empty data gracefully.
Add the Model Comparison tab visibility logic.

Write Playwright tests FE-ANA-001 through FE-ANA-006.
Update test status in this file and spec/test_registry.md.
```
