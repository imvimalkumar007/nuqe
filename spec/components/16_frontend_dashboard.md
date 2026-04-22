# Component 16: Frontend Dashboard

## Status
PARTIAL — cases table renders correctly, metric cards broken,
Knowledge and Settings sections missing from sidebar.
Confirmed from screenshot 22 April 2026.

## Purpose
Main entry screen. Shows all active cases with DISP deadline tracking,
breach risk indicators, and the four metric cards at the top.

## Dependencies
- Cases API (component 03): useCases hook
- Metrics API (component 13): useMetrics hook (currently broken)
- Auth (component 02): PrivateRoute wrapper

## Confirmed Working (from screenshot)
- All 8 seed cases visible in table
- Case ref, customer name, category, channel, status, deadline bars
- Bottom bar with case count and ruleset reference
- FCA Authorised badge
- Filter chips (All, Breach risk, Under review, FOS referred)

## Confirmed Broken (from screenshot)
- All four metric cards showing 0
- Knowledge section missing from sidebar
- Settings section missing from sidebar
- Firm name hardcoded as "Meridian Digital Finance Ltd"

## Sidebar Sections (complete list)
The sidebar must have these sections in this order:
1. CASEWORK: Complaints (active), All cases, FOS referrals
2. COMMUNICATIONS: Inbox, Live chat, Postal queue
3. COMPLIANCE: Consumer Duty, Audit trail, Reg updates, Reg monitoring
4. ANALYTICS: Performance
5. KNOWLEDGE: Regulatory, Product, Gaps         (MISSING)
6. SETTINGS: AI Configuration, Tokeniser        (MISSING)

## Metric Cards
The four cards call GET /api/v1/metrics/dashboard-summary.
Response shape: { breach_risk_count, under_review_count, open_count, fos_referred_count }
Each must be a number. Currently all returning 0.

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| FE-DASH-001 | Dashboard loads without console errors | NOT RUN | |
| FE-DASH-002 | All 8 seed cases visible in table | NOT RUN | Confirmed working |
| FE-DASH-003 | Breach risk metric card shows correct count (2) | NOT RUN | Confirmed broken |
| FE-DASH-004 | Under review metric card shows correct count (3) | NOT RUN | Confirmed broken |
| FE-DASH-005 | Open metric card shows correct count (3) | NOT RUN | Confirmed broken |
| FE-DASH-006 | FOS referred metric card shows correct count (1) | NOT RUN | Confirmed broken |
| FE-DASH-007 | Knowledge section with 3 items visible in sidebar | NOT RUN | Confirmed missing |
| FE-DASH-008 | Settings section with 2 items visible in sidebar | NOT RUN | Confirmed missing |

## Claude Code Prompt
```
Read spec/components/16_frontend_dashboard.md carefully.

There are three specific things to fix:

Fix 1: Metric cards showing 0.
Open web/src/hooks/useMetrics.js or wherever the metric card
data is fetched. Check the exact API endpoint being called.
Confirm it is GET /api/v1/metrics/dashboard-summary.
Check the response destructuring matches {breach_risk_count,
under_review_count, open_count, fos_referred_count}.
Fix any mismatch.

Fix 2: Missing sidebar sections.
Open web/src/App.jsx or the sidebar component.
Add Knowledge section (Regulatory /knowledge/regulatory,
Product /knowledge/product, Gaps /knowledge/gaps).
Add Settings section (AI Configuration /settings/ai-config,
Tokeniser /settings/tokeniser).
Add placeholder route components for each new route.

Fix 3: Hardcoded firm name.
Find "Meridian Digital Finance Ltd" in the codebase.
Replace with import.meta.env.VITE_FIRM_NAME ?? 'Nuqe Demo'.
Add VITE_FIRM_NAME to .env.example.

After all three fixes, write Playwright smoke tests
FE-DASH-001 through FE-DASH-008.
Run them. Fix failures.
Update test status in this file and spec/test_registry.md.
```
