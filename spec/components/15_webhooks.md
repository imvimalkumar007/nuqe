# Component 15: Webhooks

## Status
BUILT — code exists, never verified with tests

## Purpose
Receives inbound communications from Quido (the first pilot client).
Validates the webhook secret, creates communication records, and
triggers classification via the communication engine.

## Dependencies
- Database: communications, cases, customers tables
- Communication Engine (component 07): for classification
- Does NOT require auth JWT (uses webhook secret instead)

## Endpoints

### POST /api/v1/webhooks/quido
Headers: X-Quido-Secret must match QUIDO_WEBHOOK_SECRET env var
Body: {
  event_type: 'contact_form' | 'live_chat' | 'portal_message',
  customer_id: string,
  loan_ref: string,
  message_body: string,
  subject?: string,
  channel: 'email' | 'chat' | 'postal'
}
On valid secret: create communication, trigger classification, return 200
On invalid secret: return 401
On invalid body: return 400

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| HOOK-001 | POST /webhooks/quido with valid secret returns 200 | NOT RUN | |
| HOOK-002 | POST /webhooks/quido with wrong secret returns 401 | NOT RUN | |
| HOOK-003 | Valid webhook creates communications row | NOT RUN | |
| HOOK-004 | Valid webhook triggers classification ai_action | NOT RUN | |
| HOOK-005 | Valid complaint webhook opens new case | NOT RUN | |
| HOOK-006 | Response includes case_id when case is opened | NOT RUN | |

## Claude Code Prompt
```
Read spec/components/15_webhooks.md carefully.

Open api/src/routes/webhooks.js and read it fully.

Check:
1. Is the X-Quido-Secret header validated correctly?
2. Does the handler call communicationEngine.ingestCommunication?
3. Is the route excluded from auth middleware?

Write tests HOOK-001 through HOOK-006 using Jest and supertest.
Mock the communication engine to avoid real AI calls.

Run all tests. Fix failures.
Update test status in this file and spec/test_registry.md.
```
