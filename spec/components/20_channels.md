# Component 20: Channels and User Assignments

## Status
VERIFIED — all 9 tests passing (27 April 2026)

## Purpose
Named case queues per organisation. Each channel holds the client's own IMAP/SMTP
credentials so Nuqe can read inbound email and send outbound email on the client's
behalf — using the client's own domain and addresses throughout.

## Dependencies
- Database: channels, user_channel_assignments tables (migrations 011, 013)
- Auth (component 02): requireAuth middleware
- Users (migration 008): user_channel_assignments FK
- crypto.js: AES-256-GCM encrypt/decrypt/mask for IMAP and SMTP passwords
- imapService.js: 60-second IMAP polling reads from channels with IMAP config
- smtpService.js: outbound via channel SMTP, Resend fallback

## Key Design Decisions

- **Provider-agnostic** — Nuqe never owns a sending domain. Every email goes
  through the client's own IMAP/SMTP mailbox, so it appears to come from the
  client's own address (e.g. complaints@acme.com).
- **nuqe_inbound removed** — the original `nuqe_inbound` forwarding address
  approach (Mailgun, inbound.nuqe.io) was abandoned. Migration 013 drops the column.
- **Credential encryption** — IMAP/SMTP passwords are stored AES-256-GCM encrypted
  using the `channel-creds-salt` domain (separate from settings.js's salt).
  GET responses always mask passwords with `••••••••`.
- **IMAP polling** over IMAP IDLE — Render free dynos spin down after 15 min
  inactivity; IDLE connections would be dropped. 60-second polling is robust.
- **Thread matching** — outbound emails carry an RFC Message-ID; inbound replies
  are matched via In-Reply-To; fallback to NQ-YYYY-NNNN pattern in subject.
- **OAuth2 placeholder** — `oauth_provider` and `oauth_token` columns exist for
  future Google Workspace / Microsoft 365 OAuth2 (deferred).
- Many-to-many: one user can handle multiple channels; one channel has multiple staff.
- `can_write = false` on an assignment = read-only access (supervisor view).
- `cases.channel_id` FK links cases to channels (nullable for backward compat).

## Endpoints

### GET /api/v1/channels
Response: `{ channels: Channel[] }` including member_count per channel.
IMAP/SMTP passwords masked as `••••••••`.

### GET /api/v1/channels/:id
Response: Channel with members[] array (user_id, email, full_name, can_write).
IMAP/SMTP passwords masked.

### POST /api/v1/channels
Body: `{ name, display_name, inbound_email?, case_categories?,`
      `imap_host?, imap_port?, imap_username?, imap_password?, imap_tls?,`
      `smtp_host?, smtp_port?, smtp_username?, smtp_password?, smtp_from?, smtp_tls? }`
name must be lowercase slug (a-z0-9_-). Returns 409 if name already exists.
Passwords encrypted before storage; masked on response.

### PATCH /api/v1/channels/:id
Body: any subset of the above fields plus `is_active`.
Partial update — COALESCE on all columns so only supplied fields change.

### POST /api/v1/channels/:id/test
Body: `{ type: 'imap'|'smtp', host, port?, username, password, tls? }`
Tests connectivity without saving. On success updates `connection_status = 'connected'`.
On failure updates `connection_status = 'error'` with `connection_error` message.

### GET /api/v1/channels/:id/members
Response: `{ members: Member[] }`

### POST /api/v1/channels/:id/members
Body: `{ user_id, can_write? }`
Upserts — safe to call repeatedly.

### DELETE /api/v1/channels/:id/members/:userId
Removes assignment.

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| CH-001 | GET /channels returns empty array when no channels exist | PASS | 27 Apr 2026 |
| CH-002 | POST /channels creates channel; name/display_name returned; no nuqe_inbound | PASS | 27 Apr 2026 |
| CH-003 | POST /channels returns 409 when name already exists for org | PASS | 27 Apr 2026 |
| CH-004 | POST /channels/:id/members assigns user with can_write=true | PASS | 27 Apr 2026 |
| CH-005 | GET /channels/:id includes members array with user email and full_name | PASS | 27 Apr 2026 |
| CH-006 | PATCH /channels/:id can deactivate channel (is_active=false) | PASS | 27 Apr 2026 |
| CH-007 | DELETE /channels/:id/members/:userId removes assignment | PASS | 27 Apr 2026 |
| CH-008 | POST /channels/:id/test validates connectivity and updates connection_status | PASS | 27 Apr 2026 |
| CH-009 | GET /channels masks imap_password and smtp_password with •••••••• | PASS | 27 Apr 2026 |
