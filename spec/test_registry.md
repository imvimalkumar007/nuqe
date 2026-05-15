# Nuqe Test Registry

> Every test in the system. Updated after every test run.
> Status: PASS, FAIL, NOT RUN, SKIPPED
> This file is the ground truth for build status.

Last updated: 15 May 2026
Total: 294
PASS: 276
FAIL: 0
NOT RUN: 0
SKIPPED: 18

---

## 01 Database Schema

| ID | Description | Status | Notes |
|---|---|---|---|
| DB-001 | All required tables exist in public schema | PASS | 22 Apr 2026 |
| DB-002 | customers table has all required columns | PASS | 22 Apr 2026 |
| DB-003 | cases table has all required columns and check constraints | PASS | 22 Apr 2026 |
| DB-004 | audit_log cannot be updated or deleted | PASS | 22 Apr 2026 |
| DB-005 | case_ref auto-generates in NQ-YYYY-NNNN format | PASS | 22 Apr 2026 |
| DB-006 | updated_at triggers fire on all mutable tables | PASS | 22 Apr 2026 |
| DB-007 | ruleset table is seeded with UK, India, and EU rules | PASS | 22 Apr 2026 |
| DB-008 | Foreign key constraints are enforced | PASS | 22 Apr 2026 |
| DB-009 | knowledge_chunks.embedding column exists as vector(1536) with HNSW index | PASS | 26 Apr 2026 |
| DB-010 | organisation_ai_config has UNIQUE constraint on organisation_id | PASS | 26 Apr 2026 |
| DB-011 | channels table exists with is_active, inbound_email, case_categories columns | PASS | 27 Apr 2026 |
| DB-012 | user_channel_assignments has UNIQUE(user_id, channel_id) and cascade deletes | PASS | 27 Apr 2026 |
| DB-013 | communications has message_id, in_reply_to, delivery_status, is_internal columns | PASS | 27 Apr 2026 |
| DB-014 | migration 013: channels has imap_host, smtp_host, connection_status columns; nuqe_inbound dropped | PASS | 27 Apr 2026 |

---

## 02 Auth System

| ID | Description | Status | Notes |
|---|---|---|---|
| AUTH-001 | POST /auth/login with valid credentials returns 200 and access token | PASS | 23 Apr 2026 |
| AUTH-002 | POST /auth/login with wrong password returns 401 | PASS | 23 Apr 2026 |
| AUTH-003 | POST /auth/login with unknown email returns 401 | PASS | 23 Apr 2026 |
| AUTH-004 | POST /auth/login with missing fields returns 400 | PASS | 23 Apr 2026 |
| AUTH-005 | POST /auth/refresh with valid cookie returns new access token | PASS | 23 Apr 2026 |
| AUTH-006 | POST /auth/refresh with no cookie returns 401 | PASS | 23 Apr 2026 |
| AUTH-007 | POST /auth/logout clears the refresh token cookie | PASS | 23 Apr 2026 |
| AUTH-008 | GET /auth/me with valid token returns user object | PASS | 23 Apr 2026 |
| AUTH-009 | GET /auth/me with no token returns 401 | PASS | 23 Apr 2026 |
| AUTH-010 | Protected route returns 401 when called without token | PASS | 23 Apr 2026 |

---

## 03 Cases API

| ID | Description | Status | Notes |
|---|---|---|---|
| CASES-001 | GET /cases returns 200 with cases array and total count | PASS | 23 Apr 2026 |
| CASES-002 | GET /cases?status=open returns only open cases | PASS | 23 Apr 2026 |
| CASES-003 | GET /cases/:id returns case with customer_name joined | PASS | 23 Apr 2026 |
| CASES-004 | GET /cases/:id returns 404 for unknown id | PASS | 23 Apr 2026 |
| CASES-005 | GET /metrics/dashboard-summary returns four numeric values | PASS | 23 Apr 2026 |
| CASES-006 | dashboard-summary breach_risk_count counts cases within 48h of FINAL_RESPONSE deadline | PASS | 23 Apr 2026 |
| CASES-007 | dashboard-summary under_review_count matches cases with status under_review | PASS | 23 Apr 2026 |
| CASES-008 | dashboard-summary open_count matches cases with status open | PASS | 23 Apr 2026 |
| CASES-009 | dashboard-summary fos_referred_count matches cases with status fos_referred | PASS | 23 Apr 2026 |
| CASES-010 | POST /cases creates case and triggers calculateDeadlines | PASS | 23 Apr 2026 |

---

## 04 Communications API

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
| COMMS-009 | POST outbound email triggers sendEmail for channel=email direction=outbound | PASS | 26 Apr 2026 |
| COMMS-010 | Outbound email uses org from_email when set; falls back to FROM_EMAIL env var | PASS | 26 Apr 2026 |
| COMMS-011 | POST with is_internal=true stores direction=internal, never triggers sendEmail | PASS | 27 Apr 2026 |
| COMMS-012 | POST with cc/bcc arrays passes them to sendEmail and stores on the comm row | PASS | 27 Apr 2026 |
| COMMS-013 | Outbound email comm gets message_id; inbound reply matched via in_reply_to | PASS | 27 Apr 2026 |

---

## 05 Deadlines API

| ID | Description | Status | Notes |
|---|---|---|---|
| DEAD-001 | GET /deadlines?case_id returns all deadlines for the case | PASS | 23 Apr 2026 |
| DEAD-002 | Deadline rows include all required fields | PASS | 23 Apr 2026 |
| DEAD-003 | UK case has three deadline rows: ACKNOWLEDGE, FINAL_RESPONSE, FOS_REFERRAL | PASS | 23 Apr 2026 |
| DEAD-004 | Breach risk case has FINAL_RESPONSE due_at within 48 hours of now | PASS | 23 Apr 2026 |
| DEAD-005 | FOS referred case (James Whitfield) has no pending deadlines | PASS | 23 Apr 2026 |
| DEAD-006 | GET without case_id returns 400 | PASS | 23 Apr 2026 |
| DEAD-007 | calculateDeadlines does not create duplicate rows if called twice | PASS | 23 Apr 2026 |

---

## 06 Deadline Engine

| ID | Description | Status | Notes |
|---|---|---|---|
| DENG-001 | calculateDeadlines creates 3 rows for a UK case | PASS | 23 Apr 2026 |
| DENG-002 | calculateDeadlines sets due_at correctly as opened_at plus threshold_days | PASS | 23 Apr 2026 |
| DENG-003 | checkDeadlines sets alerted_at_48h when deadline is within 48 hours | PASS | 23 Apr 2026 |
| DENG-004 | checkDeadlines sets alerted_at_24h when deadline is within 24 hours | PASS | 23 Apr 2026 |
| DENG-005 | checkDeadlines marks breached=true when due_at has passed with no met_at | PASS | 23 Apr 2026 |
| DENG-006 | checkDeadlines writes to audit_log on every state change | PASS | 23 Apr 2026 |
| DENG-007 | checkDeadlines does not re-alert already-alerted deadlines | PASS | 23 Apr 2026 |
| DENG-008 | calculateDeadlines is idempotent when called twice on same case | PASS | 23 Apr 2026 |

---

## 07 Communication Engine

| ID | Description | Status | Notes |
|---|---|---|---|
| CENG-001 | ingestCommunication creates communications row | PASS | 23 Apr 2026 |
| CENG-002 | classifyCommunication writes to ai_actions with status pending | PASS | 23 Apr 2026 |
| CENG-003 | classifyCommunication opens new case if complaint detected | PASS | 23 Apr 2026 |
| CENG-004 | classifyCommunication detects implicit complaint | PASS | 23 Apr 2026 |
| CENG-005 | draftResponse writes draft to ai_actions with status pending | PASS | 23 Apr 2026 |
| CENG-006 | draftResponse does not write to communications table | PASS | 23 Apr 2026 |
| CENG-007 | Approving a response draft writes to communications table | PASS | 23 Apr 2026 |
| CENG-008 | All AI outputs write to audit_log | PASS | 23 Apr 2026 |

---

## 08 Compliance Engine

| ID | Description | Status | Notes |
|---|---|---|---|
| COMP-001 | getActiveRuleset returns correct rows for UK jurisdiction | PASS | 23 Apr 2026 |
| COMP-002 | getActiveRuleset returns correct rows for India jurisdiction | PASS | 23 Apr 2026 |
| COMP-003 | getActiveRuleset returns correct rows for EU jurisdiction | PASS | 23 Apr 2026 |
| COMP-004 | getActiveRuleset result is cached in Redis | PASS | 23 Apr 2026 |
| COMP-005 | Cache is invalidated when invalidateRulesetCache is called | PASS | 23 Apr 2026 |
| COMP-006 | assessRulesetImpact creates pending ai_action for each affected case | PASS | 23 Apr 2026 |

---

## 09 Model Router

| ID | Description | Status | Notes |
|---|---|---|---|
| ROUTER-001 | Routes to Claude when provider is claude | PASS | 23 Apr 2026 |
| ROUTER-002 | Returns standardised response object with all required fields | PASS | 23 Apr 2026 |
| ROUTER-003 | Calls piiTokeniser.tokenise before sending — PII absent from prompt | PASS | 23 Apr 2026 |
| ROUTER-004 | Calls piiTokeniser.detokenise on response — PII restored in content | PASS | 23 Apr 2026 |
| ROUTER-005 | A/B routing sends to challenger when challenger_percentage = 100 | PASS | 23 Apr 2026 |
| ROUTER-006 | Falls back to ANTHROPIC_API_KEY env var when no org config | PASS | 23 Apr 2026 |
| ROUTER-007 | Org config is cached — DB not re-queried on second call | PASS | 23 Apr 2026 |

---

## 10 PII Tokeniser

| ID | Description | Status | Notes |
|---|---|---|---|
| PII-001 | Layer 1 detects and replaces email addresses | PASS | 23 Apr 2026 |
| PII-002 | Layer 1 detects and replaces UK phone numbers | PASS | 23 Apr 2026 |
| PII-003 | Layer 1 detects and replaces loan reference numbers NQ-YYYY-NNNN | PASS | 23 Apr 2026 |
| PII-004 | Layer 2 detects StepChange as DEBTORG token | PASS | 23 Apr 2026 |
| PII-005 | Layer 2 detects mental health as VULNERABILITY token | PASS | 23 Apr 2026 |
| PII-006 | Layer 3 detects person names not caught by Layer 1 | PASS | 23 Apr 2026 |
| PII-007 | detokenise correctly restores all original values | PASS | 23 Apr 2026 |
| PII-008 | Low confidence detections are flagged in return value | PASS | 23 Apr 2026 |

---

## 11 Knowledge Layer

| ID | Description | Status | Notes |
|---|---|---|---|
| KNOW-001 | retrieveContext returns chunks for UK jurisdiction | PASS | 23 Apr 2026 |
| KNOW-002 | as_at_date filter excludes chunks not yet effective | PASS | 23 Apr 2026 |
| KNOW-003 | as_at_date filter excludes chunks that have expired | PASS | 23 Apr 2026 |
| KNOW-004 | enrichPrompt appends regulatory context block to prompt | PASS | 23 Apr 2026 |
| KNOW-005 | logRetrieval writes chunk IDs to audit_log | PASS | 23 Apr 2026 |
| KNOW-006 | Verified chunks labelled as "Verified regulatory guidance" | PASS | 23 Apr 2026 |
| KNOW-007 | Auto-ingested chunks labelled as "Pending review" | PASS | 23 Apr 2026 |

---

## 12 Regulatory Monitor

| ID | Description | Status | Notes |
|---|---|---|---|
| RMON-001 | getMonitoringHealth returns health object for each source | PASS | 23 Apr 2026 |
| RMON-002 | Health status is ok when source checked within frequency | PASS | 23 Apr 2026 |
| RMON-003 | Health status is amber when overdue up to 2x frequency | PASS | 23 Apr 2026 |
| RMON-004 | Health status is red when overdue more than 2x frequency | PASS | 23 Apr 2026 |
| RMON-005 | propagateKnowledgeUpdate marks similar chunks as superseded | PASS | 23 Apr 2026; pg_trgm fallback |
| RMON-006 | propagateKnowledgeUpdate creates pending ai_action for affected cases | PASS | 23 Apr 2026 |

---

## 13 Metrics API

| ID | Description | Status | Notes |
|---|---|---|---|
| MET-001 | GET /metrics/dashboard-summary returns 200 | PASS | 23 Apr 2026 |
| MET-002 | breach_risk_count is correct given seed data | PASS | 23 Apr 2026 |
| MET-003 | under_review_count is correct given seed data | PASS | 23 Apr 2026 |
| MET-004 | open_count is correct given seed data | PASS | 23 Apr 2026 |
| MET-005 | fos_referred_count is correct given seed data | PASS | 23 Apr 2026 |
| MET-006 | GET /metrics/ai-accuracy returns structured response | PASS | 23 Apr 2026 |
| MET-007 | ai-accuracy handles empty date range gracefully | PASS | 23 Apr 2026 |
| MET-008 | GET /metrics/model-comparison returns per-model breakdown | PASS | 23 Apr 2026 |

---

## 14 Settings API

| ID | Description | Status | Notes |
|---|---|---|---|
| SET-001 | GET /settings/ai-config returns 200 with config object | PASS | 23 Apr 2026 |
| SET-002 | GET /settings/ai-config masks API key showing only last 4 chars | PASS | 23 Apr 2026 |
| SET-003 | GET /settings/ai-config returns default empty config if none exists | PASS | 23 Apr 2026 |
| SET-004 | POST /settings/ai-config saves config and encrypts API key | PASS | 23 Apr 2026 |
| SET-005 | POST /settings/ai-config writes to audit_log | PASS | 23 Apr 2026 |
| SET-006 | POST /settings/ai-config/test returns success and response_time_ms | PASS | 23 Apr 2026 |
| SET-007 | POST /settings/ai-config/test returns failure message on bad credentials | PASS | 23 Apr 2026 |
| SET-008 | GET /settings/org-profile returns enabled_jurisdictions and profile fields | PASS | 26 Apr 2026 |
| SET-009 | PATCH /settings/org-profile saves all four fields via UPSERT | PASS | 26 Apr 2026 |
| SET-010 | PATCH /settings/org-profile returns 400 when enabled_jurisdictions is empty | PASS | 26 Apr 2026 |

---

## 15 Webhooks

| ID | Description | Status | Notes |
|---|---|---|---|
| HOOK-001 | POST /webhooks/quido with valid secret returns 200 | PASS | 23 Apr 2026 |
| HOOK-002 | POST /webhooks/quido with wrong secret returns 401 | PASS | 23 Apr 2026 |
| HOOK-003 | Webhook creates communications row | PASS | 23 Apr 2026 |
| HOOK-004 | Webhook triggers classification for complaint reason | PASS | 23 Apr 2026 |
| HOOK-005 | Webhook opens new case when complaint detected | PASS | 23 Apr 2026 |
| HOOK-006 | Webhook returns case_id when case is opened | PASS | 23 Apr 2026 |
| HOOK-007 | POST /webhooks/email-inbound routes to correct channel by nuqe_inbound address | SKIPPED | Mailgun inbound route removed 27 Apr 2026; replaced by IMAP polling in imapService.js |
| HOOK-008 | email-inbound matches In-Reply-To header to existing case (no new case opened) | SKIPPED | Mailgun inbound route removed 27 Apr 2026; IMAP polling handles thread matching |
| HOOK-009 | email-inbound matches subject case ref to existing case | SKIPPED | Mailgun inbound route removed 27 Apr 2026; IMAP polling handles subject case ref match |
| HOOK-010 | email-inbound with no match creates new case and runs classification | SKIPPED | Mailgun inbound route removed 27 Apr 2026; IMAP polling handles new-case creation |
| HOOK-011 | POST /webhooks/resend email.delivered updates delivery_status on comm row | PASS | 27 Apr 2026 |
| HOOK-012 | POST /webhooks/contact with valid Bearer token and Quido camelCase payload returns 200 | PASS | 27 Apr 2026 |

---

## 16 Frontend Dashboard

| ID | Description | Status | Notes |
|---|---|---|---|
| FE-DASH-001 | Dashboard loads without console errors | PASS | 23 Apr 2026 |
| FE-DASH-002 | All 8 seed cases visible in table | PASS | 23 Apr 2026 |
| FE-DASH-003 | Breach risk metric card shows correct count (2) | PASS | 23 Apr 2026 |
| FE-DASH-004 | Under review metric card shows correct count (3) | PASS | 23 Apr 2026 |
| FE-DASH-005 | Open metric card shows correct count (3) | PASS | 23 Apr 2026 |
| FE-DASH-006 | FOS referred metric card shows correct count (1) | PASS | 23 Apr 2026 |
| FE-DASH-007 | Knowledge section with 3 items visible in sidebar | PASS | 23 Apr 2026 |
| FE-DASH-008 | Settings section with 2 items visible in sidebar | PASS | 23 Apr 2026 |

---

## 17 Frontend Case View

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

---

## 18 Frontend Analytics

| ID | Description | Status | Notes |
|---|---|---|---|
| FE-ANA-001 | Analytics screen loads without console errors | PASS | 23 Apr 2026 |
| FE-ANA-002 | AI Accuracy tab visible and active by default | PASS | 23 Apr 2026 |
| FE-ANA-003 | Approval rate shown as a percentage | PASS | 23 Apr 2026 |
| FE-ANA-004 | Empty state shown when AI accuracy API returns no data | PASS | 23 Apr 2026 |
| FE-ANA-005 | Date range selector triggers re-fetch | PASS | 23 Apr 2026 |
| FE-ANA-006 | Model Comparison tab hidden when no challenger configured | PASS | 23 Apr 2026 |

---

## 19 Frontend Monitoring and Settings

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

---

## 20 Channels and User Assignments

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

---

## 21 nuqe_engine — Obligation Engine Unit Tests (Python/pytest)

> 350 Python unit tests covering the obligation engine core. Separate pytest suite in nuqe_engine/.

| ID | Description | Status | Notes |
|---|---|---|---|
| ENG-001 | audit.py unit coverage ≥80% | PASS | 14 May 2026 — test_audit_unit.py, 54 tests, 100% coverage |
| ENG-002 | cli.py unit coverage ≥80% | PASS | 14 May 2026 — test_cli_unit.py, 17 tests, 99% coverage |
| ENG-003 | validator.py cross-field coverage ≥80% | PASS | 14 May 2026 — test_validator_crossfield.py, 17 tests, 93% coverage |
| ENG-004 | jsparser.py coverage ≥80% | PASS | 14 May 2026 — test_jsparser_unit.py, 99% coverage |
| ENG-005 | Integration DB TRUNCATE…CASCADE safe (no FK violations) | PASS | 14 May 2026 — conftest.py refactored |
| ENG-006 | test_status_without_db_exits_nonzero runs in <100ms | PASS | 14 May 2026 — psycopg.connect patched |
| ENG-007 | Total nuqe_engine unit test coverage ≥80% | PASS | 14 May 2026 — 350 unit tests, 97% coverage |

## 22 nuqe_engine — F2.1 FastAPI Application Shell (Python/pytest)

> 45 Python unit tests covering the nuqe_api REST API layer. No DB dependency.

| ID | Description | Status | Notes |
|---|---|---|---|
| API-001 | GET /health returns 200 when engine healthy | PASS | 14 May 2026 |
| API-002 | GET /health returns 503 when DB unreachable | PASS | 14 May 2026 |
| API-003 | GET /health requires no auth header | PASS | 14 May 2026 |
| API-004 | GET /health body has db_reachable, approved_count, library_synced_at | PASS | 14 May 2026 |
| API-005 | GET /health library_synced_at=None serialises as null | PASS | 14 May 2026 |
| API-006 | GET /health shape consistent | PASS | 14 May 2026 |
| API-007 | POST /events no auth header → 403 AUTH_MISSING | PASS | 14 May 2026 |
| API-008 | POST /events no auth error_code=AUTH_MISSING | PASS | 14 May 2026 |
| API-009 | GET /health unauthenticated → not 403 | PASS | 14 May 2026 |
| API-010 | POST /events wrong token → 401 AUTH_INVALID | PASS | 14 May 2026 |
| API-011 | POST /events wrong token error_code=AUTH_INVALID | PASS | 14 May 2026 |
| API-012 | POST /events empty token → 401 or 403 | PASS | 14 May 2026 |
| API-013 | POST /events correct token → 200 | PASS | 14 May 2026 |
| API-014 | hmac.compare_digest called for token comparison | PASS | 14 May 2026 |
| API-015 | POST /events valid payload → 200 | PASS | 14 May 2026 |
| API-016 | POST /events calls engine.process_event with parsed Event | PASS | 14 May 2026 |
| API-017 | POST /events response has fired_obligations, deadlines, requirements, audit_entries | PASS | 14 May 2026 |
| API-018 | POST /events X-Request-ID present in response | PASS | 14 May 2026 |
| API-019 | POST /events X-Request-ID echoed if sent | PASS | 14 May 2026 |
| API-020 | POST /events generated request_id is valid UUID | PASS | 14 May 2026 |
| API-021 | POST /events missing event field → 422 | PASS | 14 May 2026 |
| API-022 | POST /events invalid event type → 422 | PASS | 14 May 2026 |
| API-023 | POST /events missing case_id → 422 | PASS | 14 May 2026 |
| API-024 | POST /events engine raises → 500 | PASS | 14 May 2026 |
| API-025 | POST /events engine error body has error_code=ENGINE_ERROR | PASS | 14 May 2026 |
| API-026 | POST /events engine error body has request_id | PASS | 14 May 2026 |
| API-027 | X-Request-ID client value echoed back | PASS | 14 May 2026 |
| API-028 | X-Request-ID UUID generated when no header | PASS | 14 May 2026 |
| API-029 | Different requests get different X-Request-IDs | PASS | 14 May 2026 |
| API-030 | X-Request-ID present on health response | PASS | 14 May 2026 |
| API-031 | X-Request-ID present on error response | PASS | 14 May 2026 |
| API-032 | X-Request-ID in 500 error body matches header | PASS | 14 May 2026 |
| API-033 | GET /cases/{id}/obligations unknown case → 404 | PASS | 14 May 2026 |
| API-034 | GET /cases/{id}/obligations 404 body has error_code=CASE_NOT_FOUND | PASS | 14 May 2026 |
| API-035 | GET /cases/{id}/obligations known case → 200 | PASS | 14 May 2026 |
| API-036 | GET /cases/{id}/obligations empty list returned | PASS | 14 May 2026 |
| API-037 | GET /cases/{id}/obligations calls engine.due_obligations with case_id | PASS | 14 May 2026 |
| API-038 | GET /cases/{id}/obligations?as_of=... as_of forwarded to engine | PASS | 14 May 2026 |
| API-039 | GET /cases/{id}/obligations no auth → 403 | PASS | 14 May 2026 |
| API-040 | GET /cases/{id}/audit unknown case → 404 | PASS | 14 May 2026 |
| API-041 | GET /cases/{id}/audit known case → 200 | PASS | 14 May 2026 |
| API-042 | GET /cases/{id}/audit response has entries and has_more | PASS | 14 May 2026 |
| API-043 | GET /cases/{id}/audit invalid event_type → 422 | PASS | 14 May 2026 |
| API-044 | GET /cases/{id}/audit valid event_type → 200 | PASS | 14 May 2026 |
| API-045 | GET /cases/{id}/audit no auth → 403 | PASS | 14 May 2026 |

---

## 23 nuqe_engine — F3.1 Multi-tenant RLS (Python/pytest)

> Adversarial isolation tests proving RLS policies bind and fail-closed. Require live Postgres with nuqe_app and nuqe_admin roles.

| ID | Description | Status | Notes |
|---|---|---|---|
| RLS-001 | Unset org context blocks all reads (5 tables) | PASS | 15 May 2026 — test_rls_isolation.py, nuqe_app + no SET |
| RLS-002 | Set org context returns only that org's rows | PASS | 15 May 2026 — two-org setup via nuqe superuser |
| RLS-003 | Cross-org INSERT is blocked (WITH CHECK) | PASS | 15 May 2026 — psycopg.errors.InsufficientPrivilege raised |
| RLS-004 | Cross-org UPDATE affects zero rows | PASS | 15 May 2026 — rowcount assertion |
| RLS-005 | Cross-org DELETE affects zero rows | PASS | 15 May 2026 — rowcount assertion |
| RLS-006 | nuqe_admin bypasses RLS and sees all rows | PASS | 15 May 2026 — BYPASSRLS confirmed |
| RLS-007 | SET LOCAL does not leak org context across transactions | PASS | 15 May 2026 — same connection, two transactions |
| RLS-008 | Engine.connect(org_id) sets session var correctly | PASS | 15 May 2026 — test_engine_connect.py integration |
| RLS-009 | Engine.connect(org_id) closes connection on clean exit | PASS | 15 May 2026 — test_engine_connect.py integration |
| RLS-010 | Engine.connect(org_id) rolls back and closes on exception | PASS | 15 May 2026 — test_engine_connect.py integration |

---

## 24 nuqe_engine — F3.2 Multi-tenant Engine (Python/pytest)

> Tests for per-org library storage, X-Org-Id header dependency,
> Engine.connect(org_id) signature, and library upload/activate endpoints.

| ID | Description | Status | Notes |
|---|---|---|---|
| F32-001 | Engine.connect(org_id) yields usable connection | SKIPPED | Integration — DB required |
| F32-002 | Engine.connect(org_id) closes connection on exit | SKIPPED | Integration — DB required |
| F32-003 | Engine.connect(org_id) closes on exception | SKIPPED | Integration — DB required |
| F32-004 | Engine.connect(org_id) sets SET LOCAL app.current_org_id | SKIPPED | Integration — DB required |
| F32-005 | Engine.connect(org_id) rolls back on exception | SKIPPED | Integration — DB required |
| F32-006 | Engine.signing_key returns bytes | PASS | 15 May 2026 — test_engine_connect.py |
| F32-007 | Engine.signing_key is read-only | PASS | 15 May 2026 — test_engine_connect.py |
| F32-008 | POST /events requires X-Org-Id header | PASS | 15 May 2026 — test_events.py |
| F32-009 | POST /events passes org_id to engine.process_event | PASS | 15 May 2026 — test_events.py |
| F32-010 | GET /cases/{id}/obligations passes org_id to engine | PASS | 15 May 2026 — test_cases_read.py |
| F32-011 | GET /cases/{id}/audit passes org_id to engine.connect | PASS | 15 May 2026 — test_cases_audit.py |
| F32-012 | POST /cases/ingest passes org_id to engine.connect | PASS | 15 May 2026 — test_cases_ingest.py |
| F32-013 | GET /library/status returns 404 when no active library | PASS | 15 May 2026 — test_library.py |
| F32-014 | GET /library/status returns version/row_count/approved_count/synced_at | PASS | 15 May 2026 — test_library.py |
| F32-015 | POST /library/upload returns 200 with library_id and metadata | PASS | 15 May 2026 — test_library.py |
| F32-016 | POST /library/{id}/activate returns 200 with library_id and activated_at | PASS | 15 May 2026 — test_library.py |
| F32-017 | scan_deadlines uses direct psycopg connect (admin bypass) | PASS | 15 May 2026 — test_scheduler.py |
| F32-018 | scan_deadlines passes org_id to engine.due_obligations per case | PASS | 15 May 2026 — test_scheduler.py |
| F32-019 | Audit entry written under org A not visible under org B (RLS isolation) | SKIPPED | Integration — DB required |
| F32-020 | Audit entry HMAC signature valid after DB roundtrip | SKIPPED | Integration — DB required |
| F32-021 | load_library_from_bytes parses xlsx bytes same as file path | PASS | 15 May 2026 — covered by loader tests |
| F32-022 | Engine.connect(org_id) — all non-integration tests passing (414 tests) | PASS | 15 May 2026 — 91.25% coverage |

---

## How to Update This File

After every test run, update the Status column for each test:
- PASS: test ran and passed
- FAIL: test ran and failed (add notes on what failed)
- NOT RUN: not yet executed
- SKIPPED: deliberately skipped with reason in notes

Update the summary counts at the top of the file.
Update the component index in ARCHITECTURE.md.
