# Component 19: Frontend Monitoring and Settings

## Status
VERIFIED — all 9 tests passing (26 April 2026)

## Purpose
Regulatory Monitoring: shows health of automated source monitoring,
pending review items, and recent regulatory changes.
Settings: configures the AI provider and tokeniser additions.

## Dependencies
- Settings API (component 14): settings endpoints
- Knowledge Layer (component 11): monitoring endpoints
- Auth (component 02): PrivateRoute wrapper

## Regulatory Monitoring Screen
Four panels:
1. Sources: health dots, jurisdiction badges, Check Now button
2. Pending Review: chunks awaiting human approval, count badge
3. Recent Changes: last 10 monitoring log entries
4. Health Summary: per-jurisdiction health cards

API calls:
- GET /api/v1/knowledge/sources (poll every 60 seconds)
- GET /api/v1/knowledge/monitoring-health
- GET /api/v1/knowledge/chunks?status=pending_review (poll every 30 seconds)
- GET /api/v1/knowledge/monitoring-log?limit=10
- POST /api/v1/knowledge/sources/:id/check (on Check Now click)

## Settings Screen
Three tabs: AI Configuration, Tokeniser Additions, Organisation Profile

Organisation Profile tab (added 26 April 2026):
- Jurisdiction toggles: UK/FCA, India/RBI, EU/EBA — enable/disable per org
- Firm name and FCA firm reference fields
- From-email field for outbound Resend sends
- Save button calls PATCH /api/v1/settings/org-profile

AI Configuration tab:
- Primary model provider and model selector
- API key input (masked)
- Challenger model config (optional)
- Tokenisation toggle
- Connection test button
- Save button

API calls:
- GET /api/v1/settings/ai-config (on mount)
- POST /api/v1/settings/ai-config (on Save)
- POST /api/v1/settings/ai-config/test (on Test Connection)

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| FE-MON-001 | Regulatory Monitoring screen loads without errors | PASS | 23 Apr 2026 |
| FE-MON-002 | Sources panel shows all five configured sources | PASS | 23 Apr 2026 |
| FE-MON-003 | Pending Review count badge updates after approval | PASS | 23 Apr 2026 |
| FE-SET-001 | Settings screen loads without errors | PASS | 23 Apr 2026 |
| FE-SET-002 | AI Configuration panel loads saved config | PASS | 23 Apr 2026 |
| FE-SET-003 | Connection Test button shows result message | PASS | 23 Apr 2026 |
| FE-SET-004 | Organisation Profile tab loads saved enabled_jurisdictions | PASS | 26 Apr 2026 |
| FE-SET-005 | Toggling a jurisdiction and saving persists the new value | PASS | 26 Apr 2026 |
| FE-SET-006 | From email field accepts and saves a valid email address | PASS | 26 Apr 2026 |

## Claude Code Prompt
```
Read spec/components/19_frontend_monitoring.md carefully.
Also read spec/components/14_settings_api.md.

NOTE: Work on this component only after component 14
(Settings API) has all tests passing.

Open web/src/components/RegulatoryMonitoringScreen.jsx and
web/src/components/SettingsScreen.jsx.

For each component check every API call against the spec.
Fix any endpoint mismatches or missing implementations.

Ensure empty states render gracefully when no data exists.

Write Playwright tests FE-MON-001 through FE-SET-003.
Update test status in this file and spec/test_registry.md.
```
