# Nuqe Test Registry

> Every test in the system. Updated after every test run.
> Status: PASS, FAIL, NOT RUN, SKIPPED
> This file is the ground truth for build status.

Last updated: 14 May 2026
Total: 661
PASS: 604
FAIL: 0
NOT RUN: 56
SKIPPED: 5

Note: NOT RUN = nuqe_engine integration tests (require live Postgres via Docker; run with `pytest -m integration`).

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

## 21 Obligation Engine — Loader (nuqe_engine)

| ID | Description | Status | Notes |
|---|---|---|---|
| OBL-LOAD-001 | load_library returns only approved rows by default | PASS | 13 May 2026 |
| OBL-LOAD-002 | load_library can return all statuses when approved_only=False | PASS | 13 May 2026 |
| OBL-LOAD-003 | load_library loads expected count (141 approved) | PASS | 13 May 2026 |
| OBL-LOAD-004 | load_library obligation_id format matches XX-YYYY-NNN pattern | PASS | 13 May 2026 |
| OBL-LOAD-005 | load_library stashes _source_row_number on each row | PASS | 13 May 2026 |
| OBL-LOAD-006 | load_library raises LoaderError for missing file | PASS | 13 May 2026 |
| OBL-LOAD-007 | load_library raises LoaderError for bad sheet name | PASS | 13 May 2026 |
| OBL-LOAD-008 | load_all_statuses groups rows by review_status | PASS | 13 May 2026 |
| OBL-LOAD-009 | load_library review_status breakdown sums to total row count | PASS | 13 May 2026 |

---

## 22 Obligation Engine — Validator (nuqe_engine)

| ID | Description | Status | Notes |
|---|---|---|---|
| OBL-VAL-001 | All 141 approved rows validate with zero error-level defects | PASS | 13 May 2026 |
| OBL-VAL-002 | Valid row produces correctly typed sub-fields (TriggerCondition, Requirement, etc.) | PASS | 13 May 2026 |
| OBL-VAL-003 | Defect carries source spreadsheet row number | PASS | 13 May 2026 |
| OBL-VAL-004 | Malformed trigger_condition produces error defect on trigger_condition column | PASS | 13 May 2026 |
| OBL-VAL-005 | deadline_value present when deadline_unit=none raises error | PASS | 13 May 2026 |
| OBL-VAL-006 | deadline_value missing when deadline_unit=calendar_days raises error | PASS | 13 May 2026 |
| OBL-VAL-007 | deadline_value=0 when deadline_unit=business_days raises error | PASS | 13 May 2026 |
| OBL-VAL-008 | overlay_of pointing to nonexistent obligation_id raises error | PASS | 13 May 2026 |
| OBL-VAL-009 | overlay_of pointing to existing obligation_id is valid | PASS | 13 May 2026 |
| OBL-VAL-010 | framework not matching obligation_id prefix raises error | PASS | 13 May 2026 |
| OBL-VAL-011 | Single valid row produces ObligationRow in result.valid | PASS | 13 May 2026 |
| OBL-VAL-012 | Empty input returns empty valid and empty defects | PASS | 13 May 2026 |
| OBL-VAL-013 | Row with error defect excluded from valid list | PASS | 13 May 2026 |
| OBL-VAL-014 | test_every_approved_row_parses_in_full regression guard — all 141 rows parse cleanly | PASS | 13 May 2026 |

---

## 23 Obligation Engine — Trigger DSL (nuqe_engine)

| ID | Description | Status | Notes |
|---|---|---|---|
| OBL-TRIG-001 | null sentinel evaluates to False | PASS | 13 May 2026 |
| OBL-TRIG-002 | false sentinel evaluates to False | PASS | 13 May 2026 |
| OBL-TRIG-003 | empty string evaluates to False | PASS | 13 May 2026 |
| OBL-TRIG-004 | whitespace-only string evaluates to False | PASS | 13 May 2026 |
| OBL-TRIG-005 | true literal evaluates to True | PASS | 13 May 2026 |
| OBL-TRIG-006 | string equality match | PASS | 13 May 2026 |
| OBL-TRIG-007 | string equality no match | PASS | 13 May 2026 |
| OBL-TRIG-008 | string inequality | PASS | 13 May 2026 |
| OBL-TRIG-009 | double-quoted string | PASS | 13 May 2026 |
| OBL-TRIG-010 | numeric equality | PASS | 13 May 2026 |
| OBL-TRIG-011 | numeric less than | PASS | 13 May 2026 |
| OBL-TRIG-012 | numeric less than or equal | PASS | 13 May 2026 |
| OBL-TRIG-013 | numeric greater than | PASS | 13 May 2026 |
| OBL-TRIG-014 | numeric greater than or equal | PASS | 13 May 2026 |
| OBL-TRIG-015 | numeric less than false | PASS | 13 May 2026 |
| OBL-TRIG-016 | dotted path two levels | PASS | 13 May 2026 |
| OBL-TRIG-017 | dotted path three levels | PASS | 13 May 2026 |
| OBL-TRIG-018 | missing path returns False for equality | PASS | 13 May 2026 |
| OBL-TRIG-019 | missing path returns True for inequality | PASS | 13 May 2026 |
| OBL-TRIG-020 | missing path with ordering raises ExpressionError | PASS | 13 May 2026 |
| OBL-TRIG-021 | IN with bracket list | PASS | 13 May 2026 |
| OBL-TRIG-022 | IN with paren list | PASS | 13 May 2026 |
| OBL-TRIG-023 | IN no match | PASS | 13 May 2026 |
| OBL-TRIG-024 | NOT IN | PASS | 13 May 2026 |
| OBL-TRIG-025 | NOT IN match returns False | PASS | 13 May 2026 |
| OBL-TRIG-026 | IN with null path returns False | PASS | 13 May 2026 |
| OBL-TRIG-027 | NOT IN with null path returns True | PASS | 13 May 2026 |
| OBL-TRIG-028 | AND both true | PASS | 13 May 2026 |
| OBL-TRIG-029 | AND one false | PASS | 13 May 2026 |
| OBL-TRIG-030 | OR first true | PASS | 13 May 2026 |
| OBL-TRIG-031 | OR second true | PASS | 13 May 2026 |
| OBL-TRIG-032 | OR both false | PASS | 13 May 2026 |
| OBL-TRIG-033 | NOT negates | PASS | 13 May 2026 |
| OBL-TRIG-034 | NOT false gives true | PASS | 13 May 2026 |
| OBL-TRIG-035 | complex AND/OR expression | PASS | 13 May 2026 |
| OBL-TRIG-036 | AND short-circuits on false | PASS | 13 May 2026 |
| OBL-TRIG-037 | OR short-circuits on true | PASS | 13 May 2026 |
| OBL-TRIG-038 | parentheses change precedence | PASS | 13 May 2026 |
| OBL-TRIG-039 | unterminated string raises ExpressionError | PASS | 13 May 2026 |
| OBL-TRIG-040 | unexpected character raises ExpressionError | PASS | 13 May 2026 |
| OBL-TRIG-041 | incomplete expression raises ExpressionError | PASS | 13 May 2026 |
| OBL-TRIG-042 | matching event fires obligation | PASS | 13 May 2026 |
| OBL-TRIG-043 | wrong event does not fire | PASS | 13 May 2026 |
| OBL-TRIG-044 | empty obligations returns empty | PASS | 13 May 2026 |
| OBL-TRIG-045 | conditions false does not fire | PASS | 13 May 2026 |
| OBL-TRIG-046 | conditions true with context fires | PASS | 13 May 2026 |
| OBL-TRIG-047 | exclusions true suppresses obligation | PASS | 13 May 2026 |
| OBL-TRIG-048 | exclusions false does not suppress | PASS | 13 May 2026 |
| OBL-TRIG-049 | exclusions null sentinel does not suppress | PASS | 13 May 2026 |
| OBL-TRIG-050 | multiple obligations fires correct subset | PASS | 13 May 2026 |
| OBL-TRIG-051 | all matching obligations fire | PASS | 13 May 2026 |
| OBL-TRIG-052 | fired obligation matched_at equals event occurred_at | PASS | 13 May 2026 |
| OBL-TRIG-053 | fired obligation trigger_event field set correctly | PASS | 13 May 2026 |
| OBL-TRIG-054 | bad conditions expression skipped with warning | PASS | 13 May 2026 |
| OBL-TRIG-055 | bad exclusions expression skipped with warning | PASS | 13 May 2026 |
| OBL-TRIG-056 | null == null is true | PASS | 13 May 2026 |
| OBL-TRIG-057 | null != string is true | PASS | 13 May 2026 |
| OBL-TRIG-058 | null == string is false | PASS | 13 May 2026 |
| OBL-TRIG-059 | float comparison | PASS | 13 May 2026 |
| OBL-TRIG-060 | float equality | PASS | 13 May 2026 |
| OBL-TRIG-061 | ISO date literal lexes as single token (not three number tokens) | PASS | 13 May 2026 — NEW |
| OBL-TRIG-062 | date literal equality true | PASS | 13 May 2026 — NEW |
| OBL-TRIG-063 | date literal equality false | PASS | 13 May 2026 — NEW |
| OBL-TRIG-064 | date literal less than true | PASS | 13 May 2026 — NEW |
| OBL-TRIG-065 | date literal less than false | PASS | 13 May 2026 — NEW |
| OBL-TRIG-066 | date literal >= true | PASS | 13 May 2026 — NEW |
| OBL-TRIG-067 | date literal >= false | PASS | 13 May 2026 — NEW |
| OBL-TRIG-068 | ISO string path value vs date literal coercion (true) | PASS | 13 May 2026 — NEW |
| OBL-TRIG-069 | ISO string path value vs date literal coercion (false) | PASS | 13 May 2026 — NEW |
| OBL-TRIG-070 | datetime path value coerced to date for comparison | PASS | 13 May 2026 — NEW |
| OBL-TRIG-071 | UK-DISP-018 condition fires for received_at='2025-06-15' | PASS | 13 May 2026 — NEW |
| OBL-TRIG-072 | UK-DISP-018 condition does NOT fire for received_at='2013-01-01' | PASS | 13 May 2026 — NEW |

---

## 24 Obligation Engine — Deadline (nuqe_engine)

| ID | Description | Status | Notes |
|---|---|---|---|
| OBL-DEAD-001 | calendar_days: 3 days from Wednesday | PASS | 13 May 2026 |
| OBL-DEAD-002 | business_days: 3 from Wednesday skips weekend | PASS | 13 May 2026 |
| OBL-DEAD-003 | business_days: 56 from 2026-01-02 accounts for no holidays before April | PASS | 13 May 2026 |
| OBL-DEAD-004 | hours: 8 from morning | PASS | 13 May 2026 |
| OBL-DEAD-005 | add_business_days(0) returns start unchanged | PASS | 13 May 2026 |
| OBL-DEAD-006 | add_business_days requires timezone-aware datetime | PASS | 13 May 2026 |
| OBL-DEAD-007 | add_business_days negative value raises | PASS | 13 May 2026 |
| OBL-DEAD-008 | Good Friday 2026 is skipped by business day calc | PASS | 13 May 2026 |
| OBL-DEAD-009 | Good Friday is recognised as bank holiday | PASS | 13 May 2026 |
| OBL-DEAD-010 | deadline_unit=none returns no due_at | PASS | 13 May 2026 |
| OBL-DEAD-011 | real business_days obligation computes correctly | PASS | 13 May 2026 |
| OBL-DEAD-012 | calculate_deadline for calendar_days | PASS | 13 May 2026 |
| OBL-DEAD-013 | calculate_deadline requires timezone-aware anchor | PASS | 13 May 2026 |
| OBL-DEAD-014 | calculate_deadline result is timezone-aware | PASS | 13 May 2026 |
| OBL-DEAD-015 | deadline_status is irrelevant when due_at is None | PASS | 13 May 2026 |
| OBL-DEAD-016 | deadline_status is met when satisfied before due | PASS | 13 May 2026 |
| OBL-DEAD-017 | deadline_status is met when satisfied exactly on due | PASS | 13 May 2026 |
| OBL-DEAD-018 | deadline_status is breached when satisfied one second after due | PASS | 13 May 2026 |
| OBL-DEAD-019 | deadline_status is pending when as_of equals due and not satisfied | PASS | 13 May 2026 |
| OBL-DEAD-020 | deadline_status is breached when as_of one second after due and not satisfied | PASS | 13 May 2026 |
| OBL-DEAD-021 | deadline_status is pending when due is in future | PASS | 13 May 2026 |

---

## 25 Obligation Engine — Requirement (nuqe_engine)

| ID | Description | Status | Notes |
|---|---|---|---|
| OBL-REQ-001 | register_requirement returns correct action | PASS | 13 May 2026 |
| OBL-REQ-002 | register_requirement returns correct assertion | PASS | 13 May 2026 |
| OBL-REQ-003 | register_requirement returns action_parameters | PASS | 13 May 2026 |
| OBL-REQ-004 | register_requirement generates UUID when id not supplied | PASS | 13 May 2026 |
| OBL-REQ-005 | register_requirement uses supplied fired_obligation_id | PASS | 13 May 2026 |
| OBL-REQ-006 | register_requirement returns RequirementRegistration model | PASS | 13 May 2026 |
| OBL-REQ-007 | check_assertion satisfied returns True | PASS | 13 May 2026 |
| OBL-REQ-008 | check_assertion satisfied result has evaluated_at | PASS | 13 May 2026 |
| OBL-REQ-009 | check_assertion not satisfied returns False | PASS | 13 May 2026 |
| OBL-REQ-010 | check_assertion failed_clause is whole expression for single clause | PASS | 13 May 2026 |
| OBL-REQ-011 | check_assertion identifies failing conjunct in AND expression | PASS | 13 May 2026 |
| OBL-REQ-012 | check_assertion first conjunct fails | PASS | 13 May 2026 |
| OBL-REQ-013 | check_assertion natural language returns False with manual note | PASS | 13 May 2026 |
| OBL-REQ-014 | check_assertion result is AssertionResult model | PASS | 13 May 2026 |
| OBL-REQ-015 | real DISP-001 obligation registers and checks correctly | PASS | 13 May 2026 |

---

## 26 Obligation Engine — Evidence (nuqe_engine)

| ID | Description | Status | Notes |
|---|---|---|---|
| OBL-EV-001 | empty backend returns zero | PASS | 13 May 2026 |
| OBL-EV-002 | add and find matching record | PASS | 13 May 2026 |
| OBL-EV-003 | find no match returns zero | PASS | 13 May 2026 |
| OBL-EV-004 | find counts multiple matching records | PASS | 13 May 2026 |
| OBL-EV-005 | find only counts matching records not all | PASS | 13 May 2026 |
| OBL-EV-006 | find is location-scoped | PASS | 13 May 2026 |
| OBL-EV-007 | find with AND expression | PASS | 13 May 2026 |
| OBL-EV-008 | find injects case_id into context | PASS | 13 May 2026 |
| OBL-EV-009 | find with case_id mismatch returns zero | PASS | 13 May 2026 |
| OBL-EV-010 | check_evidence found returns True | PASS | 13 May 2026 |
| OBL-EV-011 | check_evidence not found returns False | PASS | 13 May 2026 |
| OBL-EV-012 | check_evidence result carries location | PASS | 13 May 2026 |
| OBL-EV-013 | check_evidence result carries selector | PASS | 13 May 2026 |
| OBL-EV-014 | check_evidence result is EvidenceResult model | PASS | 13 May 2026 |
| OBL-EV-015 | check_evidence malformed selector raises ExpressionError | PASS | 13 May 2026 |
| OBL-EV-016 | check_evidence empty selector returns False | PASS | 13 May 2026 |
| OBL-EV-017 | InMemoryEvidenceBackend satisfies EvidenceBackend protocol | PASS | 13 May 2026 |
| OBL-EV-018 | real evidence spec from library evaluates correctly | PASS | 13 May 2026 |

---

## 27 Obligation Engine — CLI (nuqe_engine)

| ID | Description | Status | Notes |
|---|---|---|---|
| OBL-CLI-001 | nuqe-engine --help exits 0 | PASS | 13 May 2026 — NEW |
| OBL-CLI-002 | nuqe-engine load --help exits 0 | PASS | 13 May 2026 — NEW |
| OBL-CLI-003 | nuqe-engine validate --help exits 0 | PASS | 13 May 2026 — NEW |
| OBL-CLI-004 | nuqe-engine sync --help exits 0 | PASS | 13 May 2026 — NEW |
| OBL-CLI-005 | nuqe-engine migrate --help exits 0 | PASS | 13 May 2026 — NEW |
| OBL-CLI-006 | nuqe-engine status --help exits 0 | PASS | 13 May 2026 — NEW |
| OBL-CLI-007 | load with real library reports valid rows and exits 0 | PASS | 13 May 2026 — NEW |
| OBL-CLI-008 | load --all flag loads more rows than approved-only | PASS | 13 May 2026 — NEW |
| OBL-CLI-009 | load with missing file exits non-zero | PASS | 13 May 2026 — NEW |
| OBL-CLI-010 | load with malformed xlsx exits non-zero | PASS | 13 May 2026 — NEW |
| OBL-CLI-011 | validate with real library finds no errors and exits 0 | PASS | 13 May 2026 — NEW |
| OBL-CLI-012 | validate with malformed file exits non-zero | PASS | 13 May 2026 — NEW |
| OBL-CLI-013 | status with unreachable database exits non-zero | PASS | 13 May 2026 — NEW |
| OBL-CLI-014 | -v verbose flag does not crash load command | PASS | 13 May 2026 — NEW |

---

## 28 Obligation Engine — Audit (integration, requires DB)

| ID | Description | Status | Notes |
|---|---|---|---|
| OBL-AUD-001 | append_audit_entry returns AuditEntry | NOT RUN | Requires live Postgres |
| OBL-AUD-002 | audit entry has auto-generated id | NOT RUN | Requires live Postgres |
| OBL-AUD-003 | audit entry has created_at timestamp | NOT RUN | Requires live Postgres |
| OBL-AUD-004 | audit entry has HMAC signature | NOT RUN | Requires live Postgres |
| OBL-AUD-005 | append and retrieve round-trip | NOT RUN | Requires live Postgres |
| OBL-AUD-006 | signature verifies for untampered entry | NOT RUN | Requires live Postgres |
| OBL-AUD-007 | signature fails for tampered payload | NOT RUN | Requires live Postgres |
| OBL-AUD-008 | verify_signature direct call | NOT RUN | Requires live Postgres |
| OBL-AUD-009 | verify_signature wrong key fails | NOT RUN | Requires live Postgres |
| OBL-AUD-010 | filter by entity_id | NOT RUN | Requires live Postgres |
| OBL-AUD-011 | filter by entity_type | NOT RUN | Requires live Postgres |
| OBL-AUD-012 | filter by event_type | NOT RUN | Requires live Postgres |
| OBL-AUD-013 | results ordered chronologically | NOT RUN | Requires live Postgres |
| OBL-AUD-014 | get_audit_trail without verify does not set signature_valid | NOT RUN | Requires live Postgres |
| OBL-AUD-015 | get_audit_trail verify requires signing_key | NOT RUN | Requires live Postgres |
| OBL-AUD-016 | UPDATE on audit_log raises DatabaseError | NOT RUN | Requires live Postgres |
| OBL-AUD-017 | DELETE on audit_log raises DatabaseError | NOT RUN | Requires live Postgres |

---

## 29 Obligation Engine — Sync (integration, requires DB)

| ID | Description | Status | Notes |
|---|---|---|---|
| OBL-SYNC-001 | migrations apply to fresh database | NOT RUN | Requires live Postgres |
| OBL-SYNC-002 | migrations are idempotent | NOT RUN | Requires live Postgres |
| OBL-SYNC-003 | sync_to_database inserts all library rows | NOT RUN | Requires live Postgres |
| OBL-SYNC-004 | sync_to_database is idempotent on second run | NOT RUN | Requires live Postgres |
| OBL-SYNC-005 | sync raises on version/content conflict | NOT RUN | Requires live Postgres |
| OBL-SYNC-006 | audit_log rejects UPDATE | NOT RUN | Requires live Postgres |
| OBL-SYNC-007 | audit_log rejects DELETE | NOT RUN | Requires live Postgres |

---

## 30 Obligation Engine — Integration (requires DB, pytest -m integration)

| ID | Description | Status | Notes |
|---|---|---|---|
| OBL-INT-001 | refresh_library syncs all 141 approved obligations | NOT RUN | Requires live Postgres |
| OBL-INT-002 | refresh_library is idempotent (second run: 0 inserted, 141 unchanged) | NOT RUN | Requires live Postgres |
| OBL-INT-003 | process_event fires UK-DISP-001 and UK-DISP-009 on COMPLAINT_RECEIVED | NOT RUN | Requires live Postgres |
| OBL-INT-004 | process_event returns deadlines; UK-DISP-009 deadline = +56 calendar days | NOT RUN | Requires live Postgres |
| OBL-INT-005 | process_event creates one requirement per fired obligation | NOT RUN | Requires live Postgres |
| OBL-INT-006 | process_event creates OBLIGATION_FIRED audit entries | NOT RUN | Requires live Postgres |
| OBL-INT-007 | all audit entries from process_event have valid HMAC signatures | NOT RUN | Requires live Postgres |
| OBL-INT-008 | re-processing same event is a no-op (idempotent) | NOT RUN | Requires live Postgres |
| OBL-INT-009 | due_obligations returns one ObligationStatus per fired obligation | NOT RUN | Requires live Postgres |
| OBL-INT-010 | UK-DISP-009 has deadline_status=pending one day after event | NOT RUN | Requires live Postgres |
| OBL-INT-011 | audit_trail returns all entries for case in chronological order | NOT RUN | Requires live Postgres |
| OBL-INT-012 | audit_trail retrieval: all signatures valid | NOT RUN | Requires live Postgres |
| OBL-INT-013 | DEADLINE_SET audit entries match count of timed deadlines | NOT RUN | Requires live Postgres |

---

## 31 F2 Agent — Tokeniser (nuqe_agent)

| ID | Description | Status | Notes |
|---|---|---|---|
| AGT-TOK-001 | email address is tokenised | PASS | 14 May 2026 |
| AGT-TOK-002 | same email twice produces same token | PASS | 14 May 2026 |
| AGT-TOK-003 | UK postcode tokenised as personal_identifier | PASS | 14 May 2026 |
| AGT-TOK-004 | postcode without space tokenised | PASS | 14 May 2026 |
| AGT-TOK-005 | NI number tokenised as special_category | PASS | 14 May 2026 |
| AGT-TOK-006 | DISP reference not tokenised | PASS | 14 May 2026 |
| AGT-TOK-007 | FCA handbook reference not tokenised | PASS | 14 May 2026 |
| AGT-TOK-008 | Financial Ombudsman Service not tokenised | PASS | 14 May 2026 |
| AGT-TOK-009 | ISO date not tokenised | PASS | 14 May 2026 |
| AGT-TOK-010 | account number tokenised | PASS | 14 May 2026 |
| AGT-TOK-011 | multiple account numbers get sequential tokens | PASS | 14 May 2026 |
| AGT-TOK-012 | dictionary keyword takes priority over regex | PASS | 14 May 2026 |
| AGT-TOK-013 | shared baseline keyword applies to all firms | PASS | 14 May 2026 |
| AGT-TOK-014 | detokenise round-trip restores original | PASS | 14 May 2026 |
| AGT-TOK-015 | detokenise unknown token raises UnknownTokenError | PASS | 14 May 2026 |
| AGT-TOK-016 | detokenise no tokens returns unchanged | PASS | 14 May 2026 |
| AGT-TOK-017 | cross-firm dictionary isolation | PASS | 14 May 2026 |
| AGT-TOK-018 | tokenisation event created per unique value | PASS | 14 May 2026 |
| AGT-TOK-019 | repeated value does not create duplicate event | PASS | 14 May 2026 |
| AGT-TOK-020 | event carries correct case and firm IDs | PASS | 14 May 2026 |
| AGT-TOK-021 | empty text returns unchanged | PASS | 14 May 2026 |
| AGT-TOK-022 | no PII text unchanged | PASS | 14 May 2026 |
| AGT-TOK-023 | sort code tokenised | PASS | 14 May 2026 |
| AGT-TOK-024 | pattern dictionary entry applied | PASS | 14 May 2026 |

---

## 32 F2 Agent — Dictionary (nuqe_agent)

| ID | Description | Status | Notes |
|---|---|---|---|
| AGT-DICT-001 | FCA is reserved | PASS | 14 May 2026 |
| AGT-DICT-002 | fca (lowercase) is reserved | PASS | 14 May 2026 |
| AGT-DICT-003 | FOS is reserved | PASS | 14 May 2026 |
| AGT-DICT-004 | DISP is reserved | PASS | 14 May 2026 |
| AGT-DICT-005 | Financial Ombudsman is reserved | PASS | 14 May 2026 |
| AGT-DICT-006 | ordinary word not reserved | PASS | 14 May 2026 |
| AGT-DICT-007 | empty string not reserved | PASS | 14 May 2026 |
| AGT-DICT-008 | partial match not reserved (FCAUK) | PASS | 14 May 2026 |
| AGT-DICT-009 | add_keyword returns DictionaryEntry with status=active | PASS | 14 May 2026 |
| AGT-DICT-010 | add_keyword empty keyword raises ValueError | PASS | 14 May 2026 |
| AGT-DICT-011 | add reserved keyword raises ValueError | PASS | 14 May 2026 |
| AGT-DICT-012 | add invalid regex pattern raises ValueError | PASS | 14 May 2026 |
| AGT-DICT-013 | add duplicate is idempotent (no INSERT) | PASS | 14 May 2026 |
| AGT-DICT-014 | add valid pattern succeeds | PASS | 14 May 2026 |
| AGT-DICT-015 | remove_keyword success | PASS | 14 May 2026 |
| AGT-DICT-016 | remove_keyword not found raises LookupError | PASS | 14 May 2026 |
| AGT-DICT-017 | list_active firm_id=None returns shared baseline only | PASS | 14 May 2026 |
| AGT-DICT-018 | list_active with firm returns firm + shared | PASS | 14 May 2026 |
| AGT-DICT-019 | reclassify creates new entry and deprecates old | PASS | 14 May 2026 |
| AGT-DICT-020 | reclassify not found raises LookupError | PASS | 14 May 2026 |
| AGT-DICT-021 | find_by_keyword returns None when missing | PASS | 14 May 2026 |
| AGT-DICT-022 | find_by_keyword returns entry | PASS | 14 May 2026 |
| AGT-DICT-023 | _row_to_entry with string UUIDs | PASS | 14 May 2026 |
| AGT-DICT-024 | _row_to_entry with null firm | PASS | 14 May 2026 |
| AGT-DICT-025 | CLI dictionary list — no entries | PASS | 14 May 2026 |
| AGT-DICT-026 | CLI dictionary list — with entries | PASS | 14 May 2026 |
| AGT-DICT-027 | CLI dictionary add — success | PASS | 14 May 2026 |
| AGT-DICT-028 | CLI dictionary add — invalid category | PASS | 14 May 2026 |
| AGT-DICT-029 | CLI dictionary add — reserved word error | PASS | 14 May 2026 |
| AGT-DICT-030 | CLI dictionary remove — success | PASS | 14 May 2026 |
| AGT-DICT-031 | CLI dictionary remove — not found | PASS | 14 May 2026 |
| AGT-DICT-032 | CLI dictionary reclassify — success | PASS | 14 May 2026 |
| AGT-DICT-033 | CLI dictionary reclassify — invalid category | PASS | 14 May 2026 |
| AGT-DICT-034 | CLI dictionary list with --firm-id | PASS | 14 May 2026 |
| AGT-DICT-INT-001 | add_keyword creates active entry (live DB) | NOT RUN | Requires live Postgres |
| AGT-DICT-INT-002 | add_keyword idempotent on duplicate (live DB) | NOT RUN | Requires live Postgres |
| AGT-DICT-INT-003 | add reserved word raises (live DB) | NOT RUN | Requires live Postgres |
| AGT-DICT-INT-004 | add invalid regex raises (live DB) | NOT RUN | Requires live Postgres |
| AGT-DICT-INT-005 | remove deprecates entry; deprecated_at set (live DB) | NOT RUN | Requires live Postgres |
| AGT-DICT-INT-006 | list_active returns firm + shared entries (live DB) | NOT RUN | Requires live Postgres |
| AGT-DICT-INT-007 | list_active excludes other firm entries (live DB) | NOT RUN | Requires live Postgres |
| AGT-DICT-INT-008 | list_active(None) returns shared baseline only (live DB) | NOT RUN | Requires live Postgres |
| AGT-DICT-INT-009 | reclassify creates new and deprecates old (live DB) | NOT RUN | Requires live Postgres |

---

## 33 F2 Agent — Drafter / Prompts / Seed (nuqe_agent)

| ID | Description | Status | Notes |
|---|---|---|---|
| AGT-DFT-001 | render_prompt substitutes known variable | PASS | 14 May 2026 |
| AGT-DFT-002 | render_prompt leaves missing variables as placeholders | PASS | 14 May 2026 |
| AGT-DFT-003 | render_prompt empty context returns template unchanged | PASS | 14 May 2026 |
| AGT-DFT-004 | render_prompt coerces numeric values to string | PASS | 14 May 2026 |
| AGT-DFT-005 | PromptManager.get_active returns PromptTemplate | PASS | 14 May 2026 |
| AGT-DFT-006 | PromptManager.get_active raises NoActivePromptError when missing | PASS | 14 May 2026 |
| AGT-DFT-007 | NoActivePromptError carries obligation_id and obligation_version | PASS | 14 May 2026 |
| AGT-DFT-008 | PromptManager.list_for_obligation returns all versions | PASS | 14 May 2026 |
| AGT-DFT-009 | seed_uk_disp_001_prompt returns "created" when new | PASS | 14 May 2026 |
| AGT-DFT-010 | seed_uk_disp_001_prompt returns "exists" when duplicate | PASS | 14 May 2026 |
| AGT-DFT-011 | UK_DISP_001_TEMPLATE contains DISP 1.6.2R and required placeholders | PASS | 14 May 2026 |
| AGT-DFT-012 | UK_DISP_001_SYSTEM mentions compliance and DISP | PASS | 14 May 2026 |
| AGT-DFT-013 | _check_assertion None assertion always passes | PASS | 14 May 2026 |
| AGT-DFT-014 | _check_assertion substring passes | PASS | 14 May 2026 |
| AGT-DFT-015 | _check_assertion substring case-insensitive | PASS | 14 May 2026 |
| AGT-DFT-016 | _check_assertion substring fails | PASS | 14 May 2026 |
| AGT-DFT-017 | _check_assertion regex: prefix passes | PASS | 14 May 2026 |
| AGT-DFT-018 | _check_assertion regex: prefix fails | PASS | 14 May 2026 |
| AGT-DFT-019 | _check_assertion invalid regex fails gracefully | PASS | 14 May 2026 |
| AGT-DFT-020 | MockAnthropicClient returns fixed response text | PASS | 14 May 2026 |
| AGT-DFT-021 | MockAnthropicClient auto-response includes tokens from prompt | PASS | 14 May 2026 |
| AGT-DFT-022 | MockAnthropicClient echoes model name | PASS | 14 May 2026 |
| AGT-DFT-023 | Drafter.draft returns Draft object | PASS | 14 May 2026 |
| AGT-DFT-024 | Draft status=draft when no assertion | PASS | 14 May 2026 |
| AGT-DFT-025 | Draft status=rejected when assertion fails | PASS | 14 May 2026 |
| AGT-DFT-026 | Draft status=draft when assertion passes | PASS | 14 May 2026 |
| AGT-DFT-027 | Drafter persists draft row to DB | PASS | 14 May 2026 |
| AGT-DFT-028 | Drafter raises NoActivePromptError when no prompt | PASS | 14 May 2026 |
| AGT-DFT-029 | Draft llm_usage captured with input/output tokens | PASS | 14 May 2026 |
| AGT-DFT-030 | Draft IDs are unique across calls | PASS | 14 May 2026 |
| AGT-DFT-031 | Audit event constants defined | PASS | 14 May 2026 |
| AGT-DFT-INT-001 | Full pipeline with MockAnthropicClient (live DB) | NOT RUN | Requires live Postgres |

---

## 34 F2 Agent — API / CLI (nuqe_agent)

| ID | Description | Status | Notes |
|---|---|---|---|
| AGT-API-001 | _row_to_draft converts DB row to Draft | PASS | 14 May 2026 |
| AGT-API-002 | _row_to_draft parses llm_usage from JSON string | PASS | 14 May 2026 |
| AGT-API-003 | _row_to_draft accepts llm_usage already as dict | PASS | 14 May 2026 |
| AGT-API-004 | _row_to_draft falls back to {} for invalid llm_usage | PASS | 14 May 2026 |
| AGT-API-005 | _row_to_draft makes naive created_at tz-aware | PASS | 14 May 2026 |
| AGT-API-006 | Agent constructor stores default_firm_id | PASS | 14 May 2026 |
| AGT-API-007 | Agent constructor allows no firm_id | PASS | 14 May 2026 |
| AGT-API-008 | Agent.get_draft returns Draft for known ID | PASS | 14 May 2026 |
| AGT-API-009 | Agent.get_draft raises LookupError when not found | PASS | 14 May 2026 |
| AGT-API-010 | Agent.list_drafts returns list of Draft | PASS | 14 May 2026 |
| AGT-API-011 | Agent.list_drafts returns empty list | PASS | 14 May 2026 |
| AGT-API-012 | Agent.list_drafts with case_id and status filters issues query | PASS | 14 May 2026 |
| AGT-API-013 | Agent.draft_for_obligation raises ValueError when no firm_id | PASS | 14 May 2026 |
| AGT-API-014 | Agent.draft_for_obligation raises LookupError when obligation not found | PASS | 14 May 2026 |
| AGT-API-015 | Agent.add_dictionary_keyword delegates to DictionaryManager | PASS | 14 May 2026 |
| AGT-API-016 | Agent.add_dictionary_keyword uses default_firm_id | PASS | 14 May 2026 |
| AGT-API-017 | Agent.remove_dictionary_keyword delegates without error | PASS | 14 May 2026 |
| AGT-API-018 | Agent.list_dictionary returns empty list | PASS | 14 May 2026 |
| AGT-API-019 | CLI draft show — not found exits non-zero | PASS | 14 May 2026 |
| AGT-API-020 | CLI draft show — success prints final text | PASS | 14 May 2026 |
| AGT-API-021 | CLI draft list — no results prints message | PASS | 14 May 2026 |
| AGT-API-022 | CLI draft generate — invalid UUID exits non-zero | PASS | 14 May 2026 |
| AGT-API-023 | CLI draft show — invalid UUID exits non-zero | PASS | 14 May 2026 |

---

## 35 F2 Agent — E2E Integration (nuqe_agent, requires live DB)

| ID | Description | Status | Notes |
|---|---|---|---|
| AGT-E2E-001 | Full pipeline: complaint text → tokenise → mock LLM → detokenise → persist | NOT RUN | Requires live Postgres with migrations applied |
| AGT-E2E-002 | Assertion failure sets draft status to rejected | NOT RUN | Requires live Postgres |
| AGT-E2E-003 | Firm-specific dictionary keyword tokenised in prompt and restored in final text | NOT RUN | Requires live Postgres |
| AGT-E2E-004 | Agent.list_drafts returns empty list for new case | NOT RUN | Requires live Postgres |
| AGT-E2E-005 | Agent.get_draft round-trip: persist via Drafter, retrieve via Agent | NOT RUN | Requires live Postgres |
| AGT-E2E-006 | Agent.add_dictionary_keyword / list / remove round-trip | NOT RUN | Requires live Postgres |
| AGT-E2E-007 | Real LLM smoke: full pipeline with Anthropic API; tokens not in final text | SKIPPED | Set NUQE_E2E_REAL_LLM=1 and ANTHROPIC_API_KEY to enable |

---

## 36 Obligation Engine — Audit Unit (nuqe_engine, no DB)

> Added 14 May 2026 — F2 Prompt 0. Covers audit.py to 100% with mocked psycopg.

| ID | Description | Status | Notes |
|---|---|---|---|
| OBL-AUD-U-001 | _canonical_message returns bytes | PASS | 14 May 2026 |
| OBL-AUD-U-002 | _canonical_message output is valid JSON | PASS | 14 May 2026 |
| OBL-AUD-U-003 | _canonical_message keys are sorted for determinism | PASS | 14 May 2026 |
| OBL-AUD-U-004 | _canonical_message is deterministic for same inputs | PASS | 14 May 2026 |
| OBL-AUD-U-005 | _canonical_message different payloads produce different messages | PASS | 14 May 2026 |
| OBL-AUD-U-006 | _sign returns 64-char hex string | PASS | 14 May 2026 |
| OBL-AUD-U-007 | _sign matches expected HMAC-SHA256 | PASS | 14 May 2026 |
| OBL-AUD-U-008 | _sign different keys produce different signatures | PASS | 14 May 2026 |
| OBL-AUD-U-009 | _sign different messages produce different signatures | PASS | 14 May 2026 |
| OBL-AUD-U-010 | verify_signature returns True for valid signature | PASS | 14 May 2026 |
| OBL-AUD-U-011 | verify_signature returns False for wrong key | PASS | 14 May 2026 |
| OBL-AUD-U-012 | verify_signature returns False for tampered payload | PASS | 14 May 2026 |
| OBL-AUD-U-013 | verify_signature returns False for tampered actor | PASS | 14 May 2026 |
| OBL-AUD-U-014 | verify_signature returns False for tampered event_type | PASS | 14 May 2026 |
| OBL-AUD-U-015 | append_audit_entry returns AuditEntry | PASS | 14 May 2026 |
| OBL-AUD-U-016 | append_audit_entry entry has UUID id | PASS | 14 May 2026 |
| OBL-AUD-U-017 | append_audit_entry entry has tz-aware created_at | PASS | 14 May 2026 |
| OBL-AUD-U-018 | append_audit_entry HMAC signature is 64 chars | PASS | 14 May 2026 |
| OBL-AUD-U-019 | append_audit_entry signature verifies immediately | PASS | 14 May 2026 |
| OBL-AUD-U-020 | append_audit_entry signature_valid is None on append | PASS | 14 May 2026 |
| OBL-AUD-U-021 | append_audit_entry fields match inputs | PASS | 14 May 2026 |
| OBL-AUD-U-022 | append_audit_entry cursor execute called once | PASS | 14 May 2026 |
| OBL-AUD-U-023 | append_audit_entry SQL contains INSERT | PASS | 14 May 2026 |
| OBL-AUD-U-024 | event_type obligation_fired survives append round-trip | PASS | 14 May 2026 |
| OBL-AUD-U-025 | event_type deadline_set survives append round-trip | PASS | 14 May 2026 |
| OBL-AUD-U-026 | event_type deadline_met survives append round-trip | PASS | 14 May 2026 |
| OBL-AUD-U-027 | event_type deadline_breached survives append round-trip | PASS | 14 May 2026 |
| OBL-AUD-U-028 | event_type evidence_found survives append round-trip | PASS | 14 May 2026 |
| OBL-AUD-U-029 | event_type evidence_missing survives append round-trip | PASS | 14 May 2026 |
| OBL-AUD-U-030 | event_type requirement_registered survives append round-trip | PASS | 14 May 2026 |
| OBL-AUD-U-031 | event_type requirement_satisfied survives append round-trip | PASS | 14 May 2026 |
| OBL-AUD-U-032 | event_type library_synced survives append round-trip | PASS | 14 May 2026 |
| OBL-AUD-U-033 | event_type case_opened survives append round-trip | PASS | 14 May 2026 |
| OBL-AUD-U-034 | event_type case_closed survives append round-trip | PASS | 14 May 2026 |
| OBL-AUD-U-035 | event_type obligation_fired in signature scope | PASS | 14 May 2026 |
| OBL-AUD-U-036 | event_type deadline_set in signature scope | PASS | 14 May 2026 |
| OBL-AUD-U-037 | event_type deadline_met in signature scope | PASS | 14 May 2026 |
| OBL-AUD-U-038 | event_type deadline_breached in signature scope | PASS | 14 May 2026 |
| OBL-AUD-U-039 | event_type evidence_found in signature scope | PASS | 14 May 2026 |
| OBL-AUD-U-040 | event_type evidence_missing in signature scope | PASS | 14 May 2026 |
| OBL-AUD-U-041 | event_type requirement_registered in signature scope | PASS | 14 May 2026 |
| OBL-AUD-U-042 | event_type requirement_satisfied in signature scope | PASS | 14 May 2026 |
| OBL-AUD-U-043 | event_type library_synced in signature scope | PASS | 14 May 2026 |
| OBL-AUD-U-044 | event_type case_opened in signature scope | PASS | 14 May 2026 |
| OBL-AUD-U-045 | event_type case_closed in signature scope | PASS | 14 May 2026 |
| OBL-AUD-U-046 | get_audit_trail returns list of AuditEntry | PASS | 14 May 2026 |
| OBL-AUD-U-047 | get_audit_trail empty result | PASS | 14 May 2026 |
| OBL-AUD-U-048 | get_audit_trail verify_signatures=False leaves signature_valid None | PASS | 14 May 2026 |
| OBL-AUD-U-049 | get_audit_trail verify_signatures=True requires signing_key | PASS | 14 May 2026 |
| OBL-AUD-U-050 | get_audit_trail verify_signatures=True populates signature_valid | PASS | 14 May 2026 |
| OBL-AUD-U-051 | get_audit_trail entity_id filter added to SQL | PASS | 14 May 2026 |
| OBL-AUD-U-052 | get_audit_trail entity_type filter added to SQL | PASS | 14 May 2026 |
| OBL-AUD-U-053 | get_audit_trail event_type filter added to SQL | PASS | 14 May 2026 |
| OBL-AUD-U-054 | get_audit_trail since filter added to SQL | PASS | 14 May 2026 |
| OBL-AUD-U-055 | get_audit_trail payload as string is parsed | PASS | 14 May 2026 |
| OBL-AUD-U-056 | get_audit_trail multiple filters all applied | PASS | 14 May 2026 |

---

## 37 Obligation Engine — jsparser Unit (nuqe_engine, no DB)

> Added 14 May 2026 — F2 Prompt 0. Covers jsparser.py to 99%.

| ID | Description | Status | Notes |
|---|---|---|---|
| OBL-JSP-001 | ParseError has position attribute | PASS | 14 May 2026 |
| OBL-JSP-002 | ParseError has source attribute | PASS | 14 May 2026 |
| OBL-JSP-003 | ParseError message contains position hint | PASS | 14 May 2026 |
| OBL-JSP-004 | ParseError context window appears in message | PASS | 14 May 2026 |
| OBL-JSP-005 | single-quoted unterminated string raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-006 | double-quoted unterminated string raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-007 | unterminated string in array raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-008 | unterminated escape sequence raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-009 | missing closing brace raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-010 | missing closing bracket raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-011 | extra closing brace triggers trailing content error | PASS | 14 May 2026 |
| OBL-JSP-012 | extra closing bracket raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-013 | trailing content after object raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-014 | trailing content after array raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-015 | trailing content after number raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-016 | missing key after opening brace raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-017 | missing colon after key raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-018 | missing comma or brace between key-value pairs raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-019 | missing comma between array elements raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-020 | unexpected character in array raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-021 | bare minus is invalid number — raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-022 | negative integer is valid | PASS | 14 May 2026 |
| OBL-JSP-023 | float is valid | PASS | 14 May 2026 |
| OBL-JSP-024 | negative float is valid | PASS | 14 May 2026 |
| OBL-JSP-025 | unexpected at-sign raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-026 | unexpected hash raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-027 | EOF as value raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-028 | parse_array on object input raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-029 | parse_object on array input raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-030 | parse_array on string input raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-031 | parse_object on number input raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-032 | empty string raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-033 | whitespace-only string raises ParseError | PASS | 14 May 2026 |
| OBL-JSP-034 | None handled by empty check | PASS | 14 May 2026 |
| OBL-JSP-035 | empty object {} parses to empty dict | PASS | 14 May 2026 |
| OBL-JSP-036 | empty array [] parses to empty list | PASS | 14 May 2026 |
| OBL-JSP-037 | nested object parses correctly | PASS | 14 May 2026 |
| OBL-JSP-038 | trailing comma in object tolerated | PASS | 14 May 2026 |
| OBL-JSP-039 | trailing comma in array tolerated | PASS | 14 May 2026 |
| OBL-JSP-040 | boolean true keyword parsed | PASS | 14 May 2026 |
| OBL-JSP-041 | boolean false keyword parsed | PASS | 14 May 2026 |
| OBL-JSP-042 | null keyword parsed | PASS | 14 May 2026 |
| OBL-JSP-043 | bare word value parsed as string | PASS | 14 May 2026 |
| OBL-JSP-044 | escape sequences in string parsed correctly | PASS | 14 May 2026 |
| OBL-JSP-045 | double-quoted string parsed | PASS | 14 May 2026 |
| OBL-JSP-046 | quoted key parsed | PASS | 14 May 2026 |

---

## 38 Obligation Engine — Validator Crossfield Unit (nuqe_engine, no DB)

> Added 14 May 2026 — F2 Prompt 0. Covers uncovered validator.py branches; synthetic rows only.

| ID | Description | Status | Notes |
|---|---|---|---|
| OBL-VALX-001 | _parse_requirement: parse error produces error defect | PASS | 14 May 2026 |
| OBL-VALX-002 | _parse_requirement: schema error (wrong fields) produces error defect | PASS | 14 May 2026 |
| OBL-VALX-003 | _parse_evidence_required: parse error produces defect | PASS | 14 May 2026 |
| OBL-VALX-004 | _parse_evidence_required: non-dict item produces defect | PASS | 14 May 2026 |
| OBL-VALX-005 | _parse_evidence_required: schema error produces defect | PASS | 14 May 2026 |
| OBL-VALX-006 | _parse_exceptions: parse error produces defect | PASS | 14 May 2026 |
| OBL-VALX-007 | _parse_exceptions: non-dict item produces defect | PASS | 14 May 2026 |
| OBL-VALX-008 | _parse_exceptions: schema error produces defect | PASS | 14 May 2026 |
| OBL-VALX-009 | _parse_list_column: malformed product_types produces defect | PASS | 14 May 2026 |
| OBL-VALX-010 | _parse_list_column: malformed customer_segments produces defect | PASS | 14 May 2026 |
| OBL-VALX-011 | supersedes missing ID produces error defect | PASS | 14 May 2026 |
| OBL-VALX-012 | supersedes valid when target in same batch | PASS | 14 May 2026 |
| OBL-VALX-013 | effective_to < effective_from produces error defect | PASS | 14 May 2026 |
| OBL-VALX-014 | effective_to == effective_from is valid | PASS | 14 May 2026 |
| OBL-VALX-015 | effective_to None is valid | PASS | 14 May 2026 |
| OBL-VALX-016 | row with no error defects ends up in valid | PASS | 14 May 2026 |
| OBL-VALX-017 | row excluded from valid on error but not on warning | PASS | 14 May 2026 |

---

## 39 Obligation Engine — CLI Unit (nuqe_engine, no DB)

> Added 14 May 2026 — F2 Prompt 0. Covers cli.py to 99% using Click CliRunner with patched psycopg.

| ID | Description | Status | Notes |
|---|---|---|---|
| OBL-CLI-U-001 | migrate: success prints "Applied 3 migration(s)" | PASS | 14 May 2026 |
| OBL-CLI-U-002 | migrate: already up-to-date prints "up to date" | PASS | 14 May 2026 |
| OBL-CLI-U-003 | migrate: failure exits non-zero | PASS | 14 May 2026 |
| OBL-CLI-U-004 | load: missing file exits non-zero | PASS | 14 May 2026 |
| OBL-CLI-U-005 | load: malformed xlsx exits non-zero | PASS | 14 May 2026 |
| OBL-CLI-U-006 | load: real library shows "Valid:" and exits 0 | PASS | 14 May 2026 |
| OBL-CLI-U-007 | load: injected error defects prints ERROR block exits non-zero | PASS | 14 May 2026 |
| OBL-CLI-U-008 | load: injected warning defects prints WARNING block exits 0 | PASS | 14 May 2026 |
| OBL-CLI-U-009 | validate: real library exits 0 and shows "Valid:" | PASS | 14 May 2026 |
| OBL-CLI-U-010 | validate: malformed file exits non-zero | PASS | 14 May 2026 |
| OBL-CLI-U-011 | validate: injected errors exits non-zero with ERROR in output | PASS | 14 May 2026 |
| OBL-CLI-U-012 | validate: injected warning exits 0 with WARN in output | PASS | 14 May 2026 |
| OBL-CLI-U-013 | sync: real library calls psycopg.connect | PASS | 14 May 2026 |
| OBL-CLI-U-014 | sync: validation errors abort before connect | PASS | 14 May 2026 |
| OBL-CLI-U-015 | sync: psycopg.connect raises exits non-zero | PASS | 14 May 2026 |
| OBL-CLI-U-016 | sync: warnings after successful sync reported | PASS | 14 May 2026 |
| OBL-CLI-U-017 | status: DB failure exits non-zero in <100 ms | PASS | 14 May 2026 |
| OBL-CLI-U-018 | status: zero rows prints hint to sync | PASS | 14 May 2026 |
| OBL-CLI-U-019 | status: fetchone returns None treated as no obligations | PASS | 14 May 2026 |
| OBL-CLI-U-020 | status: obligations present shows count and year | PASS | 14 May 2026 |
| OBL-CLI-U-021 | status: last_synced=None shows "never" | PASS | 14 May 2026 |
| OBL-CLI-U-022 | status: DB failure message mentions connection | PASS | 14 May 2026 |

---

## 40 Obligation Engine — Integration Stability (nuqe_engine, requires DB)

> Added 14 May 2026 — F2 Prompt 0. Regression guard for FK-safe TRUNCATE … CASCADE cleanup between tests.

| ID | Description | Status | Notes |
|---|---|---|---|
| OBL-STAB-001 | first operation inserts one case; count == 1 | NOT RUN | Requires live Postgres |
| OBL-STAB-002 | second operation starts with zero cases; no leakage from test 1 | NOT RUN | Requires live Postgres |
| OBL-STAB-003 | third operation also starts clean; pattern holds across three consecutive tests | NOT RUN | Requires live Postgres |

---

## How to Update This File

After every test run, update the Status column for each test:
- PASS: test ran and passed
- FAIL: test ran and failed (add notes on what failed)
- NOT RUN: not yet executed
- SKIPPED: deliberately skipped with reason in notes

Update the summary counts at the top of the file.
Update the component index in ARCHITECTURE.md.
