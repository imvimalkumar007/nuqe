# Component 15: Webhooks

## Status
VERIFIED — all 11 tests passing (27 April 2026)

## Purpose
Receives inbound communications from external sources.
Three webhook handlers:
1. Quido (contact form/chat partner) — existing
2. Mailgun Inbound Routes — email omnichannel inbound
3. Resend — delivery status events

## Dependencies
- Database: communications, cases, customers, channels tables
- Communication Engine (component 07): classification
- Does NOT require auth JWT (uses shared secrets instead)

## Endpoints

### POST /api/v1/webhooks/quido
Headers: X-Quido-Secret must match QUIDO_WEBHOOK_SECRET env var
Body: { event_type, customer_email, channel, message_body, customer_name?,
        loan_id?, reason?, external_ref?, metadata? }
On valid secret: create communication, trigger classification, return 200
On invalid secret: return 401

### POST /api/v1/webhooks/email-inbound
Receives parsed inbound email from Mailgun Inbound Routes.
Mailgun POSTs multipart/form-data with: sender, recipient, subject,
body-plain, body-html, Message-Id, In-Reply-To, timestamp, token, signature.

Processing:
1. Verify Mailgun HMAC-SHA256 signature (skipped in dev if key not set)
2. Find channel by nuqe_inbound address matching recipient
3. Thread match: look up existing case via In-Reply-To → communications.message_id
4. Subject match: extract case_ref from subject line (e.g. NQ-2024-0001)
5. If no match: look up/create customer, open new case with channel_id
6. Store communication with message_id, in_reply_to
7. Run classification for new (non-reply) emails

Env vars: MAILGUN_WEBHOOK_SIGNING_KEY

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
| HOOK-007 | POST /webhooks/email-inbound routes to correct channel by nuqe_inbound address | PASS | 27 Apr 2026 |
| HOOK-008 | email-inbound matches In-Reply-To header to existing case (no new case opened) | PASS | 27 Apr 2026 |
| HOOK-009 | email-inbound matches subject case ref to existing case | PASS | 27 Apr 2026 |
| HOOK-010 | email-inbound with no match creates new case and runs classification | PASS | 27 Apr 2026 |
| HOOK-011 | POST /webhooks/resend email.delivered updates delivery_status on comm row | PASS | 27 Apr 2026 |
