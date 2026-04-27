# Component 15: Webhooks

## Status
VERIFIED — 8 passing, 4 skipped (27 April 2026)

## Purpose
Receives inbound communications from external sources.
Three webhook handlers:
1. Quido contact form — `/contact` endpoint, Bearer auth, camelCase payload
2. Quido legacy — `/quido` endpoint, X-Quido-Secret header, snake_case payload (kept for compatibility)
3. Resend — delivery status events

## Dependencies
- Database: communications, cases, customers, channels tables
- Communication Engine (component 07): classification
- Does NOT require auth JWT (uses shared secrets instead)

## Endpoints

### POST /api/v1/webhooks/contact
Headers: Authorization: Bearer <QUIDO_WEBHOOK_SECRET>
Body (Quido camelCase format):
  { externalId, createdAt?, channel, source?, status?, priority?,
    customerName?, customerEmail, customerPhone?, loanId?,
    customerType?, subject?, body, _quido? }
Channel mapping: web_contact_form → email, live_chat → chat, post → postal
Processing: upsert customer, create communication, run AI classification
On valid token: 200 { communication_id, case_id }
On invalid token: 401

### POST /api/v1/webhooks/quido
Headers: X-Quido-Secret must match QUIDO_WEBHOOK_SECRET env var
Body: { event_type, customer_email, channel, message_body, customer_name?,
        loan_id?, reason?, external_ref?, metadata? }
Kept for backward compatibility with legacy Quido integrations.

### POST /api/v1/webhooks/resend
Receives delivery status events from Resend (email.delivered, email.opened,
email.bounced, email.complained).
Matches comm by X-Nuqe-Comm-Id custom header or resend_id.
Updates communications.delivery_status.

Env vars: RESEND_WEBHOOK_SECRET (Svix signature verification)

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| HOOK-001 | POST /webhooks/quido with valid secret returns 200 | PASS | 23 Apr 2026 |
| HOOK-002 | POST /webhooks/quido with wrong secret returns 401 | PASS | 23 Apr 2026 |
| HOOK-003 | Valid webhook creates communications row | PASS | 23 Apr 2026 |
| HOOK-004 | Valid webhook triggers classification ai_action | PASS | 23 Apr 2026 |
| HOOK-005 | Valid complaint webhook opens new case | PASS | 23 Apr 2026 |
| HOOK-006 | Response includes case_id when case is opened | PASS | 23 Apr 2026 |
| HOOK-007 | POST /webhooks/email-inbound routes to correct channel by nuqe_inbound address | SKIPPED | Route removed — replaced by IMAP polling |
| HOOK-008 | email-inbound matches In-Reply-To header to existing case (no new case opened) | SKIPPED | Route removed — replaced by IMAP polling |
| HOOK-009 | email-inbound matches subject case ref to existing case | SKIPPED | Route removed — replaced by IMAP polling |
| HOOK-010 | email-inbound with no match creates new case and runs classification | SKIPPED | Route removed — replaced by IMAP polling |
| HOOK-011 | POST /webhooks/resend email.delivered updates delivery_status on comm row | PASS | 27 Apr 2026 |
| HOOK-012 | POST /webhooks/contact with valid Bearer token and Quido payload returns 200 | PASS | 27 Apr 2026 |
