# Nuqe Architecture Specification

> This is the master specification for the Nuqe system. Every component,
> dependency, and test is defined here. This file is the single source of
> truth for any Claude Code session, any developer, or any audit.
>
> To start a new build session: read this file, check the test registry
> summary below, open the component file for the next failing or not-run
> component, and follow the Claude Code prompt inside it.

---

## System Overview

Nuqe is a compliance-native communication and case management platform
for regulated digital lenders. It governs the entire written communication
lifecycle: complaints, queries, arrears correspondence, collections,
affordability discussions, default notices, and data subject access requests.

Three pillars:
1. Useful analytics
2. Automation with human review boundaries
3. Adaptive compliance layer (UK/FCA, India/RBI, EU/EBA)

---

## Test Registry Summary

Last updated: 27 April 2026
Total tests defined: 186
Passing: 182
Failing: 0
Not run: 0
Skipped: 4

Full registry: spec/test_registry.md

---

## Component Index

| # | Component | File | Status | Tests passing |
|---|---|---|---|---|
| 01 | Database Schema | spec/components/01_database.md | VERIFIED | 14/14 |
| 02 | Auth System | spec/components/02_auth.md | VERIFIED | 10/10 |
| 03 | Cases API | spec/components/03_cases_api.md | VERIFIED | 10/10 |
| 04 | Communications API | spec/components/04_communications_api.md | VERIFIED | 13/13 |
| 05 | Deadlines API | spec/components/05_deadlines_api.md | VERIFIED | 7/7 |
| 06 | Deadline Engine | spec/components/06_deadline_engine.md | VERIFIED | 8/8 |
| 07 | Communication Engine | spec/components/07_communication_engine.md | VERIFIED | 8/8 |
| 08 | Compliance Engine | spec/components/08_compliance_engine.md | VERIFIED | 6/6 |
| 09 | Model Router | spec/components/09_model_router.md | VERIFIED | 7/7 |
| 10 | PII Tokeniser | spec/components/10_pii_tokeniser.md | VERIFIED | 8/8 |
| 11 | Knowledge Layer | spec/components/11_knowledge_layer.md | VERIFIED | 7/7 |
| 12 | Regulatory Monitor | spec/components/12_regulatory_monitor.md | VERIFIED | 6/6 |
| 13 | Metrics API | spec/components/13_metrics_api.md | VERIFIED | 8/8 |
| 14 | Settings API | spec/components/14_settings_api.md | VERIFIED | 10/10 |
| 15 | Webhooks | spec/components/15_webhooks.md | VERIFIED | 11/11 |
| 16 | Frontend: Dashboard | spec/components/16_frontend_dashboard.md | VERIFIED | 8/8 |
| 17 | Frontend: Case View | spec/components/17_frontend_case_view.md | VERIFIED | 12/12 |
| 18 | Frontend: Analytics | spec/components/18_frontend_analytics.md | VERIFIED | 6/6 |
| 19 | Frontend: Monitoring | spec/components/19_frontend_monitoring.md | VERIFIED | 9/9 |
| 20 | Channels | spec/components/20_channels.md | VERIFIED | 9/9 |

**Status key:**
- NOT BUILT: code does not exist
- BUILT: code exists, never verified with tests
- PARTIAL: code exists, some features work, some broken
- BROKEN: code exists, known failures confirmed
- VERIFIED: code exists and all tests pass

---

## Build Order

Always build and verify in this order. Never skip ahead.
A component marked VERIFIED means all its tests pass.

```
1. Database Schema        (no dependencies)
2. Auth System            (depends on: database)
3. Cases API              (depends on: database, auth)
4. Communications API     (depends on: database, auth, cases)
5. Deadlines API          (depends on: database, auth, cases)
6. Deadline Engine        (depends on: database, cases, deadlines)
7. Communication Engine   (depends on: database, cases, communications, model router)
8. Compliance Engine      (depends on: database, cases, ruleset)
9. Model Router           (depends on: database, organisation_ai_config)
10. PII Tokeniser         (depends on: model router)
11. Knowledge Layer       (depends on: database, model router)
12. Regulatory Monitor    (depends on: database, knowledge layer)
13. Metrics API           (depends on: database, auth, cases, ai_actions)
14. Settings API          (depends on: database, auth, model router)
15. Webhooks              (depends on: database, communication engine)
16. Frontend: Dashboard   (depends on: cases API, metrics API, auth)
17. Frontend: Case View   (depends on: cases, communications, deadlines APIs, auth)
18. Frontend: Analytics   (depends on: metrics API, auth)
19. Frontend: Monitoring  (depends on: settings API, knowledge layer, auth)
```

---

## How to Use This Spec in Claude Code

At the start of every Claude Code session, paste this:

```
Read spec/ARCHITECTURE.md and spec/test_registry.md.
Tell me:
1. How many tests are currently passing
2. Which component has the most failing or not-run tests
3. What the next action should be
Then wait for my instruction before doing anything.
```

When working on a specific component, paste this:

```
Read spec/components/[XX_component_name].md carefully.
Do not build anything yet.
First run the existing tests for this component and report results.
Then fix any failures.
Then build any missing features listed in the spec.
Then write any missing tests listed in the spec.
Then run all tests again and confirm they pass.
Finally update the test status in spec/components/[XX_component_name].md
and spec/test_registry.md.
Do not move to the next component until all tests for this one pass.
```

---

## Known Issues (27 April 2026)

No open HIGH severity issues. See NUQE_TECHNICAL_DEBT.md for the full gap list.
Medium: IMAP polling reliability on Render free dyno (gap #55). Upgrade to paid dyno before first client.
Medium: OAuth2 for Google Workspace / Microsoft 365 deferred (gap #54).

---

## Repository Structure

```
nuqe/
├── api/
│   ├── src/
│   │   ├── db/
│   │   │   ├── migrations/
│   │   │   │   ├── 001_initial_schema.sql
│   │   │   │   ├── 002_ai_config_and_review_layer.sql
│   │   │   │   ├── 003_knowledge_base.sql
│   │   │   │   ├── 005_regulatory_monitoring.sql
│   │   │   │   ├── 006_users.sql
│   │   │   │   ├── 007_notifications.sql
│   │   │   │   ├── 008_users_extended.sql
│   │   │   │   ├── 009_knowledge_embeddings.sql
│   │   │   │   ├── 010_org_profile.sql
│   │   │   │   ├── 011_channels.sql
│   │   │   │   ├── 012_email_metadata.sql
│   │   │   │   └── 013_channel_connection.sql
│   │   │   ├── seeds/
│   │   │   │   ├── demo_data.js
│   │   │   │   ├── regulatory_knowledge.js
│   │   │   │   └── fca_regulations.js
│   │   │   ├── pool.js
│   │   │   └── migrate.js
│   │   ├── engines/
│   │   │   ├── deadlineEngine.js
│   │   │   ├── communicationEngine.js
│   │   │   ├── complianceEngine.js
│   │   │   ├── modelRouter.js
│   │   │   ├── piiTokeniser.js
│   │   │   ├── knowledgeLayer.js
│   │   │   └── regulatoryMonitor.js
│   │   ├── routes/
│   │   │   ├── cases.js
│   │   │   ├── channels.js
│   │   │   ├── communications.js
│   │   │   ├── deadlines.js
│   │   │   ├── compliance.js
│   │   │   ├── ai.js
│   │   │   ├── audit.js
│   │   │   ├── metrics.js
│   │   │   ├── settings.js
│   │   │   ├── knowledge.js
│   │   │   └── webhooks.js
│   │   ├── services/
│   │   │   ├── emailService.js      (Resend wrapper)
│   │   │   ├── imapService.js       (60s IMAP polling)
│   │   │   └── smtpService.js       (per-channel SMTP + Resend fallback)
│   │   ├── utils/
│   │   │   └── crypto.js            (AES-256-GCM for channel credentials)
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   ├── queues/
│   │   └── index.js
│   └── package.json
├── web/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── api/
│   │   └── App.jsx
│   └── package.json
├── spec/
│   ├── ARCHITECTURE.md        (this file)
│   ├── dependencies.md
│   ├── test_registry.md
│   └── components/
│       └── (19 component files)
├── NUQE_CONTEXT.md
├── NUQE_TECHNICAL_DEBT.md
├── docker-compose.yml
├── render.yaml
└── README.md
```

---

## Build Plan

The phased build plan is in NUQE_BUILD_PLAN.md at the repository root.
It defines 12 phases and 186 tests.
Always consult the build plan to know which phase you are in and what the exit criteria are.

Current status: Phase 12 complete — all 12 phases done.
Email omnichannel: per-channel IMAP polling (60s) + per-channel SMTP via client's own credentials.
Nuqe never owns a sending domain — all email appears from the client's own address.
Live at: https://nuqe-web.onrender.com (admin@nuqe.io / NuqeAdmin2026!)
