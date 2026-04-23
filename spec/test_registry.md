# Nuqe Test Registry

> Every test in the system. Updated after every test run.
> Status: PASS, FAIL, NOT RUN, SKIPPED
> This file is the ground truth for build status.

Last updated: 23 April 2026
Total: 142
PASS: 122
FAIL: 0
NOT RUN: 20

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
| FE-CASE-001 | Clicking case row navigates to /cases/:id | NOT RUN | |
| FE-CASE-002 | Case header shows case_ref, customer name, status | NOT RUN | |
| FE-CASE-003 | DISP deadline panel shows three milestones with due dates | NOT RUN | |
| FE-CASE-004 | Communication timeline shows all seeded communications | NOT RUN | |
| FE-CASE-005 | Pending AI draft renders in greyed-out state | NOT RUN | |
| FE-CASE-006 | Approve button calls PATCH /ai-actions/:id/review | NOT RUN | |
| FE-CASE-007 | Edit and Approve opens inline editor | NOT RUN | |
| FE-CASE-008 | Reject button dismisses the pending action | NOT RUN | |

---

## 18 Frontend Analytics

| ID | Description | Status | Notes |
|---|---|---|---|
| FE-ANA-001 | Analytics screen loads without console errors | NOT RUN | |
| FE-ANA-002 | AI Accuracy tab shows four metric cards | NOT RUN | |
| FE-ANA-003 | Approval rate chart renders with real data | NOT RUN | |
| FE-ANA-004 | Model Comparison tab shows side-by-side cards | NOT RUN | |
| FE-ANA-005 | Date range selector triggers re-fetch | NOT RUN | |
| FE-ANA-006 | Empty state shown gracefully when no AI actions exist | NOT RUN | |

---

## 19 Frontend Monitoring and Settings

| ID | Description | Status | Notes |
|---|---|---|---|
| FE-MON-001 | Regulatory Monitoring screen loads without errors | NOT RUN | |
| FE-MON-002 | Sources panel shows all five configured sources | NOT RUN | |
| FE-MON-003 | Pending Review panel shows count badge | NOT RUN | |
| FE-SET-001 | Settings screen loads without errors | NOT RUN | |
| FE-SET-002 | AI Configuration panel shows saved config | NOT RUN | |
| FE-SET-003 | Connection test button shows result | NOT RUN | |

---

## How to Update This File

After every test run, update the Status column for each test:
- PASS: test ran and passed
- FAIL: test ran and failed (add notes on what failed)
- NOT RUN: not yet executed
- SKIPPED: deliberately skipped with reason in notes

Update the summary counts at the top of the file.
Update the component index in ARCHITECTURE.md.
