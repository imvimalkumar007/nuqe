# Component 20: Channels and User Assignments

## Status
VERIFIED — all 7 tests passing (27 April 2026)

## Purpose
Named case queues per organisation. Each channel maps to an inbound email
address and a set of case categories. Staff are assigned to channels;
the case list filters to their assigned channels by default.

## Dependencies
- Database: channels, user_channel_assignments tables (migration 011)
- Auth (component 02): requireAuth middleware
- Users (migration 008): user_channel_assignments FK

## Key Design Decisions

- `nuqe_inbound` address format: `{channel_name}-{org_id[:8]}@inbound.nuqe.io`
  Generated at channel creation, unique across all orgs.
- `inbound_email` is the client's own address (display only, not used for routing).
- Many-to-many: one user can handle multiple channels; one channel has multiple staff.
- `can_write = false` on an assignment = read-only access (supervisor view).
- `cases.channel_id` FK links cases to channels (nullable for backward compat).

## Endpoints

### GET /api/v1/channels
Response: { channels: Channel[] } including member_count per channel.

### GET /api/v1/channels/:id
Response: Channel with members[] array (user_id, email, full_name, can_write).

### POST /api/v1/channels
Body: { name, display_name, inbound_email?, case_categories? }
name must be lowercase slug (a-z0-9_-). Returns 409 if name already exists.
Generates nuqe_inbound automatically.

### PATCH /api/v1/channels/:id
Body: any subset of { name, display_name, inbound_email, case_categories, is_active }

### GET /api/v1/channels/:id/members
Response: { members: Member[] }

### POST /api/v1/channels/:id/members
Body: { user_id, can_write? }
Upserts — safe to call repeatedly.

### DELETE /api/v1/channels/:id/members/:userId
Removes assignment.

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| CH-001 | GET /channels returns empty array when no channels exist | PASS | 27 Apr 2026 |
| CH-002 | POST /channels creates channel with generated nuqe_inbound address | PASS | 27 Apr 2026 |
| CH-003 | POST /channels returns 409 when name already exists for org | PASS | 27 Apr 2026 |
| CH-004 | POST /channels/:id/members assigns user with can_write=true | PASS | 27 Apr 2026 |
| CH-005 | GET /channels/:id includes members array with user email and full_name | PASS | 27 Apr 2026 |
| CH-006 | PATCH /channels/:id can deactivate channel (is_active=false) | PASS | 27 Apr 2026 |
| CH-007 | DELETE /channels/:id/members/:userId removes assignment | PASS | 27 Apr 2026 |
