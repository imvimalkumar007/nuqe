# Component 17: Frontend Case View

## Status
PARTIAL — component built, never tested with real data

## Purpose
Shows a single complaint case in full detail. Unified communication
timeline across all channels. DISP deadline panel with milestone
tracking. Pending AI actions in greyed-out state awaiting review.

## Dependencies
- Cases API (component 03): useCase hook
- Communications API (component 04): useCommunications hook
- Deadlines API (component 05): useDeadlines hook
- AI Actions API: useAiActions hook
- Auth (component 02): PrivateRoute wrapper

## Key Panels

### Case Header
Shows: case_ref, customer full_name, category badge,
jurisdiction badge (UK/FCA), status badge, back arrow

### DISP Deadline Panel
Shows three milestones with traffic light status:
- ACKNOWLEDGE (3 days): green/amber/red based on days remaining
- FINAL_RESPONSE (56 days): shows exact days remaining
- FOS_REFERRAL (56 days): greyed out until applicable

### Communication Timeline
Unified thread ordered by sent_at ASC. Each entry shows:
- Channel icon (email/chat/postal)
- Direction arrow (inbound/outbound)
- Author (Customer name or Staff name or "AI Draft")
- Timestamp
- Message body (collapsed if > 200 chars)
- For pending AI drafts: greyed-out with Approve, Edit and Approve, Reject buttons

### AI Actions Panel
Lists pending ai_actions for this case.
Each action shows: type, AI output preview, action buttons.
PendingActionCard component handles the review interaction.

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| FE-CASE-001 | Clicking case row navigates to /cases/:id | NOT RUN | |
| FE-CASE-002 | Case header shows case_ref and customer name | NOT RUN | |
| FE-CASE-003 | DISP deadline panel shows three milestones | NOT RUN | |
| FE-CASE-004 | Communication timeline shows seeded communications | NOT RUN | |
| FE-CASE-005 | Pending AI draft renders in greyed-out state | NOT RUN | |
| FE-CASE-006 | Approve button calls PATCH /ai-actions/:id/review | NOT RUN | |
| FE-CASE-007 | Edit and Approve opens inline editor | NOT RUN | |
| FE-CASE-008 | Reject dismisses the pending action | NOT RUN | |

## Claude Code Prompt
```
Read spec/components/17_frontend_case_view.md carefully.
Also read spec/components/04_communications_api.md and
spec/components/05_deadlines_api.md.

Navigate to http://localhost:5173/complaints and click on
the case for Sarah Okonkwo (NQ-2026-0001).

Open the browser developer tools. Check:
1. Console for errors
2. Network tab for failing API calls

Report every error and every failing request with the full URL,
status code, and response body.

Then fix each failure in order. Check that:
- GET /api/v1/cases/:id returns customer_name in the response
- GET /api/v1/communications?caseId=:id returns all required fields
- GET /api/v1/deadlines?caseId=:id returns the three deadline rows
- Pending AI draft has ai_approved_at = null

After fixing, write Playwright tests FE-CASE-001 through FE-CASE-008.
Update test status in this file and spec/test_registry.md.
```
