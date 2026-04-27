# Component 17: Frontend Case View

## Status
VERIFIED — all 12 tests passing (27 April 2026)

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
Unified thread ordered by COALESCE(sent_at, created_at) ASC. Each entry shows:
- Channel icon (email/chat/postal)
- Direction arrow (inbound/outbound)
- Author (Customer name or Staff name or "AI Draft")
- Timestamp
- Delivery status dot (sent/delivered/opened/bounced) for outbound email
- Message body (collapsed if > 340 chars)
- For pending AI drafts: greyed-out with Approve, Edit and Approve, Reject buttons
- Internal notes: amber background, 🔒 badge, never sent to customer

### Email Composer (Tiptap)
Replaces the plain textarea for email channel. Features:
- Reply / Internal note mode toggle
- To: display (read-only), CC, BCC token inputs
- Subject line input
- Tiptap rich text editor: Bold, Italic, Strikethrough, Bullet list,
  Numbered list, Blockquote, Divider, Undo, Redo
- AI draft button
- Send / Save note button

### AI Actions Panel
Lists pending ai_actions for this case.
Each action shows: type, AI output preview, action buttons.
PendingActionCard component handles the review interaction.

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| FE-CASE-001 | Clicking case row navigates to /cases/:id | PASS | 23 Apr 2026 |
| FE-CASE-002 | Case header shows case_ref and customer name | PASS | 23 Apr 2026 |
| FE-CASE-003 | DISP deadline panel shows three milestones | PASS | 23 Apr 2026 |
| FE-CASE-004 | Communication timeline shows 5 seeded communications | PASS | 23 Apr 2026 |
| FE-CASE-005 | Pending AI draft renders with Pending review badge | PASS | 23 Apr 2026 |
| FE-CASE-006 | Approve button calls PATCH /ai-actions/:id/approve | PASS | 23 Apr 2026 |
| FE-CASE-007 | Edit and Approve pre-fills compose textarea | PASS | 23 Apr 2026 |
| FE-CASE-008 | Reject button calls PATCH /ai-actions/:id/reject | PASS | 23 Apr 2026 |
| FE-CASE-009 | Email composer shows Tiptap toolbar with Bold, Italic, Bullet list buttons | PASS | 27 Apr 2026 |
| FE-CASE-010 | CC and BCC token inputs appear and accept comma-separated addresses | PASS | 27 Apr 2026 |
| FE-CASE-011 | Internal note mode toggle renders amber background; saves with is_internal=true | PASS | 27 Apr 2026 |
| FE-CASE-012 | Delivery status dot shown on outbound email comm (green=opened, blue=delivered) | PASS | 27 Apr 2026 |

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
