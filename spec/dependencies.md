# Nuqe Dependency Map

> Use this file before changing anything. It tells you what else will
> break if you modify a component. Never change a component without
> first checking what depends on it.

---

## Database Tables and Their Dependents

| Table | Used by components | If you change this table |
|---|---|---|
| customers | Cases API, Communications API, Webhooks, Frontend | Update all JOIN queries in Cases and Communications APIs |
| cases | Cases API, Deadline Engine, Communication Engine, Metrics API, Frontend Dashboard, Frontend Case View | Most critical table. Changes cascade everywhere. |
| communications | Communications API, Communication Engine, Frontend Case View | Update response shapes in Communication Engine |
| deadlines | Deadlines API, Deadline Engine, Metrics API (breach risk), Frontend Case View | Metric cards depend on deadline query logic |
| ruleset | Compliance Engine, Deadline Engine, Cases API | Cached in Redis. Clear cache on change. |
| ai_actions | Communication Engine, Metrics API, Frontend (pending actions) | Metrics depend on was_edited, ai_classification, human_classification columns |
| audit_log | All engines and routes (write only, never read in app) | Append only. Never modify existing rows. |
| organisation_ai_config | Model Router, Settings API | Cached in memory. Clear cache on change. |
| tokeniser_additions | PII Tokeniser Layer 4 | Cached per organisation. Clear cache on change. |
| knowledge_chunks | Knowledge Layer, Regulatory Monitor | Has vector index. Schema changes require index rebuild. |
| knowledge_documents | Knowledge Layer | Tracks ingestion status. |
| regulatory_sources | Regulatory Monitor | Seeded with 5 sources. |
| regulatory_monitoring_log | Regulatory Monitor | Append only. |
| notifications | Regulatory Monitor, Frontend (badge counts) | |
| users | Auth System, All protected routes | Changes to JWT payload affect all middleware. |

---

## Component Dependencies

### What breaks if you change Auth System
- Every protected API endpoint (all routes except /health and /webhooks)
- Frontend AuthContext
- Frontend PrivateRoute
- Frontend axios client (token attachment)

### What breaks if you change Cases API response shape
- Frontend Dashboard (useMetrics, useCases hooks)
- Frontend Case View (useCase hook)
- Deadline Engine (reads case.opened_at and case.ruleset_id)
- Communication Engine (reads case.status and case.customer_id)

### What breaks if you change the deadlines table
- Deadline Engine (calculateDeadlines, checkDeadlines)
- Deadlines API
- Metrics API (breach_risk_count query)
- Frontend Case View (DISP deadline panel)

### What breaks if you change the Model Router
- Communication Engine (classifyCommunication, draftResponse)
- Compliance Engine (assessRulesetImpact)
- Knowledge Layer (embedding generation)
- Settings API (connection test)

### What breaks if you change the PII Tokeniser
- Model Router (calls tokenise before every AI call)
- Every AI action (tokenisation_applied field)
- Tokeniser Additions API

### What breaks if you change the Knowledge Layer
- Communication Engine (retrieveContext called before every draft)
- Regulatory Monitor (ingestDocument)
- Frontend: Monitoring screen

---

## Build Order with Dependency Reasons

```
Step 1: Database Schema
  Reason: Everything depends on tables existing.
  No dependencies.

Step 2: Auth System
  Reason: All protected endpoints need auth middleware.
  Depends on: users table (from step 1).

Step 3: Cases API
  Reason: Core entity. Most other things depend on cases.
  Depends on: database (step 1), auth (step 2).

Step 4: Communications API
  Reason: Needed by case view and communication engine.
  Depends on: database (step 1), auth (step 2), cases (step 3).

Step 5: Deadlines API
  Reason: Needed by case view and metric cards.
  Depends on: database (step 1), auth (step 2), cases (step 3).

Step 6: Deadline Engine
  Reason: Must calculateDeadlines before metrics work.
  Depends on: database, cases, deadlines API.

Step 7: Compliance Engine
  Reason: Needed by communication engine and ruleset assessment.
  Depends on: database, cases, ruleset table.

Step 8: Model Router
  Reason: All AI calls go through this. Must exist before engines use AI.
  Depends on: organisation_ai_config table.

Step 9: PII Tokeniser
  Reason: Called by model router before every AI call.
  Depends on: model router, tokeniser_additions table.

Step 10: Communication Engine
  Reason: Classifies and drafts. Depends on model router being correct.
  Depends on: database, cases, communications, model router, PII tokeniser.

Step 11: Knowledge Layer
  Reason: RAG enrichment. Depends on pgvector and model router.
  Depends on: database (pgvector), model router.

Step 12: Regulatory Monitor
  Reason: Monitors sources and ingests knowledge.
  Depends on: database, knowledge layer.

Step 13: Metrics API
  Reason: Dashboard cards and analytics. Currently broken.
  Depends on: database, auth, cases, ai_actions, deadlines.

Step 14: Settings API
  Reason: Configure AI providers. Depends on model router.
  Depends on: database, auth, model router.

Step 15: Webhooks
  Reason: Quido integration. Depends on communication engine.
  Depends on: database, communication engine.

Step 16: Frontend Dashboard
  Reason: First screen. Depends on cases API and metrics API.
  Depends on: cases API, metrics API, auth.

Step 17: Frontend Case View
  Reason: Depends on cases, communications, deadlines APIs.
  Depends on: cases, communications, deadlines APIs, auth.

Step 18: Frontend Analytics
  Reason: Depends on metrics API returning real data.
  Depends on: metrics API, auth.

Step 19: Frontend Monitoring and Settings
  Reason: Last screens. Depend on all backend being correct.
  Depends on: settings API, knowledge layer, regulatory monitor, auth.
```

---

## Safe Change Checklist

Before making any change, answer these questions:

1. Which table or component am I changing?
2. What depends on it? (check the tables above)
3. Will my change break any of those dependents?
4. Which tests will I need to re-run after my change?
5. Have I updated the spec file for the changed component?
