# NUQE_BUILD_PLAN.md

> This is the master build plan for Nuqe. It defines every phase,
> every session, what gets built, what the exit criteria are, and
> what the system looks like when that phase is complete.
>
> A phase is not complete until every exit criterion is met.
> An exit criterion is not met until the relevant tests pass.
> Do not start the next phase until the current one is complete.

---

## How to Use This Plan

1. Find the current phase (the first one where not all exit criteria are met)
2. Open the spec file for the current session's component
3. Follow the Claude Code prompt inside that spec file
4. When all tests pass, mark the component VERIFIED in the spec
5. When all exit criteria for the phase are met, move to the next phase
6. Update this file after each session to reflect current state

---

## Build Phases Overview

| Phase | Name | Sessions | Goal | Status |
|---|---|---|---|---|
| 0 | Foundation | 1 | Spec system committed, test infra working | DONE |
| 1 | Core Data Layer | 3 | Database verified, Auth working, seed data correct | IN PROGRESS |
| 2 | Core API Layer | 3 | Cases, Communications, Deadlines APIs verified | NOT STARTED |
| 3 | Business Engines | 4 | Deadline, Compliance, Model Router, PII Tokeniser verified | NOT STARTED |
| 4 | Intelligence Layer | 2 | Knowledge Layer and Regulatory Monitor verified | NOT STARTED |
| 5 | Derived APIs | 2 | Metrics API and Settings API verified | NOT STARTED |
| 6 | Integration | 2 | Webhooks verified, all APIs connected to real data | NOT STARTED |
| 7 | Frontend Verification | 4 | All 4 frontend components verified with real data | NOT STARTED |
| 8 | Hardening | 3 | Security, observability, performance | NOT STARTED |
| 9 | CI/CD and Deployment | 2 | Pipeline live, deployed to Render | NOT STARTED |
| 10 | Demo Ready | 1 | All smoke tests passing, demo rehearsed | NOT STARTED |

Total sessions: approximately 27
Each session: 1 to 2 hours in Claude Code

---

## Phase 0: Foundation
**Goal:** Spec system is committed to GitHub. Test infrastructure is installed and working. The first diagnostic has been run.

### Session 0.1: Spec commit and test infrastructure
**What to do:** Paste the setup prompt (in NUQE_CONTEXT.md Section 8). Let Claude Code commit the spec files, install Jest and Playwright, and run the database diagnostic.
**Exit criteria:**
- [x] spec/ folder committed to GitHub
- [x] Jest installed in api/ with jest.config.cjs
- [x] Playwright installed in web/ with playwright.config.js
- [x] `npm test` runs in api/ without crashing (zero tests is fine)
- [x] Database diagnostic shows which tables exist and which are missing
- [x] Commit hash recorded below

**Commit hash:** e801c4f
**Date completed:** 22 April 2026

---

## Phase 1: Core Data Layer
**Goal:** The database is complete and verified. Authentication works. Seed data is provably correct.

### Session 1.1: Component 01 — Database Schema
**Spec file:** spec/components/01_database.md
**What gets built:** Missing tables created (tokeniser_additions, knowledge_documents). All constraints verified.
**Tests to pass:** DB-001 through DB-008 (8 tests)
**Exit criteria:**
- [x] All 15 required tables present
- [x] audit_log UPDATE/DELETE blocked by rules
- [x] case_ref auto-generates correctly
- [x] updated_at triggers fire
- [x] DB-001 through DB-008 all PASS
- [x] Component 01 status updated to VERIFIED
- [x] Changes committed

**Commit hash:** 3b397e9
**Date completed:** 23 April 2026

### Session 1.2: Component 02 — Auth System
**Spec file:** spec/components/02_auth.md
**What gets built:** users table migration, login/refresh/logout/me endpoints, JWT middleware, LoginPage, AuthContext, PrivateRoute.
**Tests to pass:** AUTH-001 through AUTH-010 (10 tests)
**Exit criteria:**
- [ ] POST /auth/login returns access token and sets cookie
- [ ] Refresh token rotation works
- [ ] All protected routes return 401 without token
- [ ] LoginPage renders and redirects on success
- [ ] AuthContext stores token in memory, never localStorage
- [ ] AUTH-001 through AUTH-010 all PASS
- [ ] Component 02 status updated to VERIFIED
- [ ] Changes committed

**Date completed:** _______________

### Session 1.3: Seed data verification
**What to do:** Verify the demo seed data is complete and correct. Run the seed, check every table has the right rows, confirm deadline rows are calculated correctly.
**No spec file** — this is a verification session, not a build session.
**Checks to run:**
```
docker exec -it nuqe-api-1 node -e "
const {Pool} = require('pg');
const p = new Pool({connectionString: process.env.DATABASE_URL});
Promise.all([
  p.query('SELECT COUNT(*) FROM customers'),
  p.query('SELECT COUNT(*) FROM cases'),
  p.query('SELECT COUNT(*) FROM communications'),
  p.query('SELECT COUNT(*) FROM deadlines'),
  p.query('SELECT COUNT(*) FROM ai_actions'),
  p.query(\"SELECT case_ref, status FROM cases ORDER BY case_ref\"),
  p.query('SELECT deadline_type, due_at, breached FROM deadlines ORDER BY due_at')
]).then(([c,ca,co,d,ai,cases,dl]) => {
  console.log('customers:', c.rows[0].count);
  console.log('cases:', ca.rows[0].count);
  console.log('communications:', co.rows[0].count);
  console.log('deadlines:', d.rows[0].count);
  console.log('ai_actions:', ai.rows[0].count);
  console.log('cases:', JSON.stringify(cases.rows, null, 2));
  console.log('deadlines:', JSON.stringify(dl.rows, null, 2));
  p.end();
})
"
```
**Exit criteria:**
- [ ] 6 customers
- [ ] 8 cases with correct statuses
- [ ] 15 communications
- [ ] 18 deadlines with correct due_at values
- [ ] 4 ai_actions including 1 pending
- [ ] Marcus Tetteh and Sarah Okonkwo deadlines within 48 hours confirmed
- [ ] Seed script is idempotent (run twice, counts stay the same)

**Date completed:** _______________

---

## Phase 2: Core API Layer
**Goal:** The three core APIs are verified. The frontend can retrieve real data for any case.

### Session 2.1: Component 03 — Cases API (fix metric cards)
**Spec file:** spec/components/03_cases_api.md
**What gets fixed:** dashboard-summary endpoint returning 0 for all counts.
**What gets verified:** All cases API endpoints return correct data shapes.
**Tests to pass:** CASES-001 through CASES-010 (10 tests)
**Exit criteria:**
- [ ] Metric cards show: breach_risk=2, under_review=3, open=3, fos_referred=1
- [ ] GET /cases returns cases with customer_name joined
- [ ] GET /cases/:id returns full case with deadlines and customer
- [ ] CASES-001 through CASES-010 all PASS
- [ ] Component 03 status updated to VERIFIED
- [ ] Changes committed

**This is the first visible win: metric cards will show real numbers.**

**Date completed:** _______________

### Session 2.2: Component 04 — Communications API
**Spec file:** spec/components/04_communications_api.md
**What gets verified:** Communications endpoint returns correct fields including ai_generated and ai_approved_at.
**Tests to pass:** COMMS-001 through COMMS-008 (8 tests)
**Exit criteria:**
- [ ] GET /communications?caseId returns ordered timeline
- [ ] All required fields present in response
- [ ] Pending draft has ai_approved_at = null
- [ ] COMMS-001 through COMMS-008 all PASS
- [ ] Component 04 status updated to VERIFIED
- [ ] Changes committed

**Date completed:** _______________

### Session 2.3: Component 05 — Deadlines API
**Spec file:** spec/components/05_deadlines_api.md
**What gets verified:** Deadlines endpoint returns correct rows with all required fields.
**Tests to pass:** DEAD-001 through DEAD-007 (7 tests)
**Exit criteria:**
- [ ] GET /deadlines?caseId returns 3 rows for UK cases
- [ ] due_at values are correct based on opened_at dates
- [ ] DEAD-001 through DEAD-007 all PASS
- [ ] Component 05 status updated to VERIFIED
- [ ] Changes committed

**Date completed:** _______________

---

## Phase 3: Business Engines
**Goal:** The four core engines are verified. Deadlines calculate correctly. AI calls are tokenised. Rules are applied correctly.

### Session 3.1: Component 06 — Deadline Engine
**Spec file:** spec/components/06_deadline_engine.md
**Tests to pass:** DENG-001 through DENG-008 (8 tests)
**Exit criteria:**
- [ ] calculateDeadlines creates correct rows for UK, India, EU rulesets
- [ ] checkDeadlines alerts at correct intervals
- [ ] Breach detection works correctly
- [ ] audit_log written on every state change
- [ ] DENG-001 through DENG-008 all PASS
- [ ] Component 06 status updated to VERIFIED

**Date completed:** _______________

### Session 3.2: Component 08 — Compliance Engine
**Spec file:** spec/components/08_compliance_engine.md
**Tests to pass:** COMP-001 through COMP-006 (6 tests)
**Exit criteria:**
- [ ] getActiveRuleset returns correct rules per jurisdiction
- [ ] Redis caching works (verified with mock)
- [ ] Cache invalidation works
- [ ] COMP-001 through COMP-006 all PASS
- [ ] Component 08 status updated to VERIFIED

**Date completed:** _______________

### Session 3.3: Component 10 — PII Tokeniser
**Spec file:** spec/components/10_pii_tokeniser.md
**Tests to pass:** PII-001 through PII-008 (8 tests)
**Note:** Layer 4 tests skipped until tokeniser_additions table exists (completed in Phase 1)
**Exit criteria:**
- [ ] All four layers detect correctly
- [ ] detokenise restores original values
- [ ] Low confidence flags returned correctly
- [ ] PII-001 through PII-007 all PASS (PII-008 if table exists)
- [ ] Component 10 status updated to VERIFIED

**Date completed:** _______________

### Session 3.4: Component 09 — Model Router
**Spec file:** spec/components/09_model_router.md
**Tests to pass:** ROUTER-001 through ROUTER-007 (7 tests)
**Note:** All external AI calls are mocked in tests
**Exit criteria:**
- [ ] Standardised response shape returned regardless of provider
- [ ] PII tokeniser called before and after
- [ ] A/B routing logic verified
- [ ] Fallback to env var works
- [ ] ROUTER-001 through ROUTER-007 all PASS
- [ ] Component 09 status updated to VERIFIED

**Date completed:** _______________

---

## Phase 4: Intelligence Layer
**Goal:** RAG knowledge retrieval works with correct as_at_date filtering. Regulatory monitor health checks work.

### Session 4.1: Component 11 — Knowledge Layer
**Spec file:** spec/components/11_knowledge_layer.md
**Tests to pass:** KNOW-001 through KNOW-007 (7 tests)
**Note:** KNOW-001 to KNOW-003 require pgvector. Confirm pgvector is enabled before this session.
**Exit criteria:**
- [ ] pgvector extension confirmed enabled
- [ ] retrieveContext filters by jurisdiction correctly
- [ ] as_at_date filtering excludes future and expired chunks
- [ ] enrichPrompt appends correct context block
- [ ] KNOW-001 through KNOW-007 all PASS (or KNOW-001 to KNOW-003 SKIPPED with reason if pgvector not available)
- [ ] Component 11 status updated to VERIFIED

**Date completed:** _______________

### Session 4.2: Component 12 — Regulatory Monitor
**Spec file:** spec/components/12_regulatory_monitor.md
**Tests to pass:** RMON-001 through RMON-006 (6 tests)
**Exit criteria:**
- [ ] getMonitoringHealth returns correct status per source
- [ ] Health status transitions (ok/amber/red) work correctly
- [ ] propagateKnowledgeUpdate supersedes correct chunks
- [ ] RMON-001 through RMON-006 all PASS (RMON-005 may be SKIPPED if pgvector unavailable)
- [ ] Component 12 status updated to VERIFIED

**Date completed:** _______________

---

## Phase 5: Derived APIs
**Goal:** Metrics API returns real numbers. Settings API saves and retrieves configuration correctly.

### Session 5.1: Component 13 — Metrics API
**Spec file:** spec/components/13_metrics_api.md
**This is the broken component confirmed from screenshot.**
**Expected result after this session:**
- Breach risk card: 2
- Under review card: 3
- Open card: 3
- FOS referred card: 1
**Tests to pass:** MET-001 through MET-008 (8 tests)
**Exit criteria:**
- [ ] All four dashboard summary counts correct
- [ ] ai-accuracy endpoint returns real data
- [ ] model-comparison returns correct structure
- [ ] MET-001 through MET-008 all PASS
- [ ] Component 13 status updated to VERIFIED

**Date completed:** _______________

### Session 5.2: Component 14 — Settings API
**Spec file:** spec/components/14_settings_api.md
**Tests to pass:** SET-001 through SET-007 (7 tests)
**Exit criteria:**
- [ ] GET /settings/ai-config returns masked keys
- [ ] POST /settings/ai-config encrypts and saves
- [ ] Connection test returns response_time_ms
- [ ] SET-001 through SET-007 all PASS
- [ ] Component 14 status updated to VERIFIED

**Date completed:** _______________

---

## Phase 6: Integration
**Goal:** Webhooks work. Communication engine creates pending actions. All APIs are connected end to end.

### Session 6.1: Component 15 — Webhooks
**Spec file:** spec/components/15_webhooks.md
**Tests to pass:** HOOK-001 through HOOK-006 (6 tests)
**Exit criteria:**
- [ ] Webhook secret validation works
- [ ] Communication created on valid webhook
- [ ] Classification triggered on complaint
- [ ] HOOK-001 through HOOK-006 all PASS
- [ ] Component 15 status updated to VERIFIED

**Date completed:** _______________

### Session 6.2: Component 07 — Communication Engine
**Spec file:** spec/components/07_communication_engine.md
**Tests to pass:** CENG-001 through CENG-008 (8 tests)
**Note:** All AI calls mocked. Human review gate must be enforced.
**Exit criteria:**
- [ ] ingestCommunication creates communications row
- [ ] classifyCommunication writes pending ai_action
- [ ] draftResponse writes pending ai_action (NOT communications row)
- [ ] Approving response_draft creates communications row
- [ ] CENG-001 through CENG-008 all PASS
- [ ] Component 07 status updated to VERIFIED

**Date completed:** _______________

---

## Phase 7: Frontend Verification
**Goal:** All four frontend components render real data with no console errors.

### Session 7.1: Component 16 — Frontend Dashboard
**Spec file:** spec/components/16_frontend_dashboard.md
**Three specific fixes required:**
1. Metric cards showing 0 (fix by verifying component 13 first)
2. Knowledge section missing from sidebar
3. Settings section missing from sidebar
**Tests to pass:** FE-DASH-001 through FE-DASH-008 (8 tests)
**Exit criteria:**
- [ ] All four metric cards showing correct numbers
- [ ] Knowledge section with 3 items in sidebar
- [ ] Settings section with 2 items in sidebar
- [ ] Firm name reads from environment variable
- [ ] FE-DASH-001 through FE-DASH-008 all PASS
- [ ] Component 16 status updated to VERIFIED

**This is the second visible win: the dashboard looks fully operational.**

**Date completed:** _______________

### Session 7.2: Component 17 — Frontend Case View
**Spec file:** spec/components/17_frontend_case_view.md
**Tests to pass:** FE-CASE-001 through FE-CASE-008 (8 tests)
**Exit criteria:**
- [ ] Case header shows all required fields
- [ ] DISP deadline panel shows three milestones with real dates
- [ ] Communication timeline shows seeded communications
- [ ] Pending AI draft renders in greyed-out state
- [ ] Approve/Reject buttons call correct endpoints
- [ ] FE-CASE-001 through FE-CASE-008 all PASS
- [ ] Component 17 status updated to VERIFIED

**Date completed:** _______________

### Session 7.3: Component 18 — Frontend Analytics
**Spec file:** spec/components/18_frontend_analytics.md
**Note:** Requires component 13 (Metrics API) to be VERIFIED first.
**Tests to pass:** FE-ANA-001 through FE-ANA-006 (6 tests)
**Exit criteria:**
- [ ] Analytics screen loads with real data
- [ ] Empty state handled gracefully
- [ ] Model comparison tab hidden when no challenger configured
- [ ] FE-ANA-001 through FE-ANA-006 all PASS
- [ ] Component 18 status updated to VERIFIED

**Date completed:** _______________

### Session 7.4: Component 19 — Frontend Monitoring and Settings
**Spec file:** spec/components/19_frontend_monitoring.md
**Note:** Requires component 14 (Settings API) to be VERIFIED first.
**Tests to pass:** FE-MON-001 through FE-SET-003 (6 tests)
**Exit criteria:**
- [ ] Regulatory monitoring screen shows all 5 sources
- [ ] Settings screen loads and saves AI configuration
- [ ] Connection test shows result
- [ ] FE-MON-001 through FE-SET-003 all PASS
- [ ] Component 19 status updated to VERIFIED

**Date completed:** _______________

---

## Phase 8: Hardening
**Goal:** The system is secure, observable, and resilient. Ready to show to real prospects.

### Session 8.1: Security
**What to build:**
- Helmet.js security headers
- Rate limiting (standard 200/min, auth 10/min, webhook 60/min)
- CORS restricted to known origin
- Zod input validation on all POST and PATCH routes
- SQL injection audit across entire codebase
- JWT expiry confirmed (1hr access, 7d refresh)
**Exit criteria:**
- [ ] All 6 security-related High gaps in NUQE_TECHNICAL_DEBT.md resolved
- [ ] Security gaps marked resolved with date

**Date completed:** _______________

### Session 8.2: Observability
**What to build:**
- Pino structured logging replacing all console.log calls
- Request logging middleware
- Graceful shutdown (SIGTERM/SIGINT)
- Enhanced /health endpoint with db and redis response times
- Sentry error tracking (optional, requires SENTRY_DSN)
**Exit criteria:**
- [ ] All console.log calls replaced with pino logger
- [ ] Graceful shutdown tested: docker stop triggers clean exit
- [ ] /health returns db_status and redis_status with response times
- [ ] Observability gaps in NUQE_TECHNICAL_DEBT.md resolved

**Date completed:** _______________

### Session 8.3: Performance
**What to build:**
- Redis caching for getActiveRuleset (10 min TTL)
- In-memory cache for organisation_ai_config (5 min TTL)
- BullMQ retry config (3 attempts, exponential backoff)
- Connection pool confirmed at max 20
- BullMQ dead letter queue logging
**Exit criteria:**
- [ ] getActiveRuleset cache confirmed with Redis KEYS command
- [ ] BullMQ workers have retry config
- [ ] Performance gaps in NUQE_TECHNICAL_DEBT.md resolved

**Date completed:** _______________

---

## Phase 9: CI/CD and Deployment
**Goal:** Every push to GitHub is automatically tested. The app is deployed to Render.

### Session 9.1: CI/CD Pipeline
**What to build:**
- .github/workflows/ci.yml: lint, test, build jobs
- .github/workflows/deploy.yml: deploy to Render on main push
- ESLint config for api/ and web/
- TEST_DATABASE_URL added to .env.example
**Exit criteria:**
- [ ] CI pipeline runs green on a test push
- [ ] Coverage report uploaded as artifact
- [ ] Build artifact confirmed
- [ ] README.md has CI status badge

**Date completed:** _______________

### Session 9.2: Render Deployment
**What to do:**
- Go to render.com, New, Blueprint, select nuqe repo
- Enter environment variables when prompted
- After deploy: run migrations and seed via Render shell
- Verify health endpoint responds at Render URL
**Exit criteria:**
- [ ] All four Render services running
- [ ] https://nuqe-api.onrender.com/health returns status ok
- [ ] https://nuqe-web.onrender.com loads the login page
- [ ] Migrations run successfully on Render database
- [ ] Demo seed populated on Render

**Date completed:** _______________

---

## Phase 10: Demo Ready
**Goal:** The complete demo flow works end to end. Every smoke test passes. The demo has been rehearsed.

### Session 10.1: Full smoke test and demo rehearsal
**What to do:**
Run the complete Playwright smoke test suite against the deployed Render instance:
1. Login with admin@nuqe.io
2. Complaints dashboard shows 8 cases with correct metric cards
3. Click breach risk case, view timeline and pending AI draft
4. Approve the AI draft, confirm it moves to timeline
5. Check analytics dashboard shows data
6. Check regulatory monitoring screen shows 5 sources
7. Check settings screen loads AI configuration

**Exit criteria:**
- [ ] All Playwright smoke tests pass against Render instance
- [ ] All 142 tests in test_registry.md are either PASS or SKIPPED with reason
- [ ] Zero HIGH priority gaps remaining in NUQE_TECHNICAL_DEBT.md
- [ ] NUQE_CONTEXT.md updated with deployed URL and demo credentials
- [ ] Demo rehearsed end to end without errors

**Date completed:** _______________

---

## Summary: What Done Looks Like at Each Phase

| After phase | What you can do |
|---|---|
| Phase 0 | Open any spec file and know exactly what to build next |
| Phase 1 | Trust the database and seed data are correct |
| Phase 2 | Call any core API and trust the response |
| Phase 3 | Trust deadlines calculate correctly and AI calls are safe |
| Phase 4 | RAG knowledge retrieval works historically correctly |
| Phase 5 | Metric cards and settings screen work with real data |
| Phase 6 | End-to-end flow from Quido webhook to case creation works |
| Phase 7 | Walk through the entire demo in a browser with real data |
| Phase 8 | Show the demo to a prospect without security concerns |
| Phase 9 | Push code and it deploys automatically |
| Phase 10 | Have a customer discovery conversation backed by a working product |

---

## Test Count by Phase

| Phase | Tests added | Running total |
|---|---|---|
| Phase 0 | 0 | 0 |
| Phase 1 | 18 (DB-001:8 + AUTH-001:10) | 18 |
| Phase 2 | 25 (CASES:10 + COMMS:8 + DEAD:7) | 43 |
| Phase 3 | 29 (DENG:8 + COMP:6 + PII:8 + ROUTER:7) | 72 |
| Phase 4 | 13 (KNOW:7 + RMON:6) | 85 |
| Phase 5 | 15 (MET:8 + SET:7) | 100 |
| Phase 6 | 14 (HOOK:6 + CENG:8) | 114 |
| Phase 7 | 28 (FE-DASH:8 + FE-CASE:8 + FE-ANA:6 + FE-MON/SET:6) | 142 |
| Phase 8 | Security/observability checks (not unit tests) | 142 |
| Phase 9 | CI pipeline counts as infrastructure | 142 |
| Phase 10 | Smoke tests (Playwright, already counted in Phase 7) | 142 |

---

## Changelog

| Date | What changed |
|---|---|
| 22 April 2026 | Initial build plan created. 10 phases, 27 sessions, 142 tests. Based on confirmed demo screenshot and full system state assessment. |
| 23 April 2026 | Phase 0 complete (e801c4f). Session 1.1 complete: migrations 006+007 added, 8 DB tests all PASS (3b397e9). Phase 1 IN PROGRESS. |
