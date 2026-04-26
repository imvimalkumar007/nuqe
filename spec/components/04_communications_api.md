# Component 04: Communications API

## Status
VERIFIED — all 10 tests passing (26 April 2026)

## Purpose
Returns all communications for a case in chronological order across
all channels. The unified timeline in the Case View depends entirely
on this endpoint returning the correct fields.

## Dependencies
- Database: communications, cases, customers tables
- Auth: all endpoints require valid JWT

## Endpoints

### GET /api/v1/communications
Query params: case_id (required uuid), limit (default 50), offset (default 0)
Response: { communications: Communication[], total: number }
Each Communication includes:
  id, case_id, customer_id, channel, direction, subject,
  body, author_type, author_id, ai_generated, ai_approved_by,
  ai_approved_at, sent_at, external_ref, created_at
Ordered by: sent_at ASC NULLS LAST
The ai_approved_at field is how the frontend determines if a draft
is still pending (null = pending, has value = approved)

### POST /api/v1/communications
Body: { case_id, channel, direction, subject?, body, author_type }
customer_id is resolved automatically from the case.
Response: 201 with created communication

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| COMMS-001 | GET /communications?case_id returns communications ordered by sent_at | PASS | 23 Apr 2026 |
| COMMS-002 | GET /communications includes ai_generated and ai_approved_at fields | PASS | 23 Apr 2026 |
| COMMS-003 | GET /communications includes author_type field | PASS | 23 Apr 2026 |
| COMMS-004 | POST /communications creates inbound communication and links to case | PASS | 23 Apr 2026 |
| COMMS-005 | AI draft communication with ai_approved_at null renders as pending | PASS | 23 Apr 2026 |
| COMMS-006 | Approved AI draft has ai_approved_by set | PASS | 23 Apr 2026 |
| COMMS-007 | GET /communications returns empty array for case with no comms | PASS | 23 Apr 2026 |
| COMMS-008 | Communications from all three channels appear in unified timeline | PASS | 23 Apr 2026 |
| COMMS-009 | POST outbound email communication triggers sendEmail for channel=email direction=outbound | PASS | 26 Apr 2026 |
| COMMS-010 | Outbound email uses org from_email when set; falls back to FROM_EMAIL env var | PASS | 26 Apr 2026 |
