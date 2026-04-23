# NUQE_TECHNICAL_DEBT.md

> Tracks all known technical gaps, shortcuts, deferred decisions, and areas needing attention. Share this file at the start of any gap-closing session and say: "Work through all high priority open gaps first, then medium, then low."

---

## Open Gaps

| # | Area | Description | Priority | Added | Notes |
|---|---|---|---|---|---|
| 9 | Security | Anthropic API key was accidentally exposed in chat on 22 April 2026 | URGENT | 22 Apr 2026 | Delete exposed key at console.anthropic.com/settings/keys and create new one immediately — **manual action required** |
| 12 | Testing | Seed script not tested for idempotency | Medium | Apr 2026 | Confirm delete order is correct |
| 15 | Performance | pgvector index may need tuning at scale | Low | Apr 2026 | Revisit when chunks exceed 100,000 rows |
| 18 | Reliability | No health check monitoring or alerting | Medium | Apr 2026 | Add UptimeRobot free tier |
| 19 | Reliability | No database backup strategy confirmed | High | Apr 2026 | Confirm Render PostgreSQL backup schedule before going live — **manual action required** |
| 21 | Reliability | BullMQ dead letter queue not configured | Low | Apr 2026 | Configure failed job handler |
| 22 | Architecture | Multi-tenancy relies on application-level filtering only | Medium | Apr 2026 | Consider PostgreSQL row-level security |
| 23 | Architecture | Express API is a monolith | Low | Apr 2026 | Plan to extract engines before scaling beyond 10 clients |
| 24 | Architecture | No API versioning strategy | Low | Apr 2026 | Document before releasing public API |
| 30 | Understanding | pgvector HNSW vs ivfflat trade-offs not fully understood | Low | Apr 2026 | Read docs before knowledge base exceeds 50,000 chunks |
| 31 | Understanding | BullMQ failure modes under Redis loss not tested | Low | Apr 2026 | Test graceful drain behaviour |
| 32 | Understanding | Supersession threshold of 0.85 not validated | Medium | Apr 2026 | Test after knowledge base is seeded |
| 34 | Frontend | No loading states on initial app load | Low | Apr 2026 | Add global loading state |
| 35 | Frontend | No network error handling | Low | Apr 2026 | Add global error boundary with retry |
| 36 | Frontend | No mobile responsiveness | Low | Apr 2026 | Assess after first customer discovery conversations |
| 38 | DevOps | No staging environment | Medium | Apr 2026 | Create before onboarding first client |
| 39 | DevOps | Docker Compose not tested on clean machine | Low | Apr 2026 | Document setup steps |

---

## Resolved Gaps

| # | Area | Description | Resolved | How |
|---|---|---|---|---|
| 1 | Security | JWT token expiry and refresh logic | 23 Apr 2026 | Already implemented: 1h access token, 7d refresh token, refresh endpoint in auth.js |
| 3 | Security | No rate limiting on public endpoints | 23 Apr 2026 | express-rate-limit: 10/min on auth, 60/min on webhooks, 200/min on all other routes; skipped in test env |
| 4 | Security | CORS too permissive | 23 Apr 2026 | Restricted to CORS_ORIGIN env var (default localhost:5173) |
| 5 | Security | No input validation middleware | 23 Apr 2026 | Zod schemas + validate() middleware on all POST and PATCH routes |
| 6 | Security | Helmet.js not added | 23 Apr 2026 | Added helmet() to app.js as first middleware |
| 7 | Security | SQL injection audit | 23 Apr 2026 | All queries use parameterized $1/$2 style; only dynamic element is hardcoded column names from known if-checks (safe) |
| 10 | Testing | No tests written yet | 23 Apr 2026 | 142 Jest tests covering all routes and engines; 80%+ coverage on critical paths |
| 11 | Testing | No end-to-end tests | 23 Apr 2026 | 142 Playwright e2e tests across all 19 UI components in web/e2e/ |
| 13 | Performance | No caching on getActiveRuleset() | 23 Apr 2026 | Already implemented: Redis cache with CACHE_TTL=600s in complianceEngine.js |
| 14 | Performance | No caching on organisation_ai_config | 23 Apr 2026 | Already implemented: in-memory Map with ORG_CONFIG_TTL=5min in modelRouter.js |
| 16 | Performance | No database connection pool size | 23 Apr 2026 | Added max: 20 to Pool config in db/pool.js |
| 17 | Performance | BullMQ queues have no retry configuration | 23 Apr 2026 | Added attempts:3 + exponential backoff (1s base) to deadlineQueue and regulatoryQueue |
| 20 | Reliability | No error tracking / structured logging | 23 Apr 2026 | Pino logger added (src/logger.js); pino-http request logging in app.js; all console.log/error/warn replaced in runtime code; graceful SIGTERM/SIGINT shutdown in index.js; /health returns db_response_ms |
| 25 | Architecture | Docker networking: API container uses localhost for postgres/redis | 23 Apr 2026 | docker-compose.yml environment block overrides DATABASE_URL and REDIS_URL with Docker service hostnames (postgres:5432, redis:6379) |
| 33 | Frontend | No authentication or login screen | 23 Apr 2026 | Login screen built as Component 02; JWT auth flow fully tested (10 passing tests) |
| 37 | DevOps | No CI/CD pipeline | 23 Apr 2026 | .github/workflows/ci.yml: lint-api, lint-web, test-api (postgres+redis services), build-web jobs; coverage and dist artifacts uploaded |
| 40 | DevOps | docker-compose.yml uses postgres:16-alpine not pgvector/pgvector:pg16 | 23 Apr 2026 | Updated to pgvector/pgvector:pg16 in docker-compose.yml |
| 46 | API | GET /api/v1/metrics/ai-accuracy returned placeholder | 23 Apr 2026 | Fully implemented in metrics.js: approval rate, rejection rate, by-action-type breakdown, breach risk, avg resolution days |
| 47 | API | GET /api/v1/regulatory/sources and /monitoring-log not implemented | 23 Apr 2026 | Both fully implemented in regulatory.js: /sources returns all sources ordered by jurisdiction; /monitoring-log paginates regulatory_monitoring_log joined with sources |
| 48 | API | GET and PATCH /api/v1/settings/ai-config not implemented | 23 Apr 2026 | GET returns masked config; POST upserts with AES-256-GCM encrypted API keys; cache cleared on update |
| 49 | API | POST /api/v1/settings/tokeniser not implemented | 23 Apr 2026 | POST /settings/tokeniser-additions inserts to tokeniser_additions; /tokeniser redirects to it for backwards compat |
| 2 | Security | API key encryption uses JWT_SECRET | 23 Apr 2026 | Added ENCRYPTION_SECRET env var; settings.js deriveKey() uses ENCRYPTION_SECRET with fallback to JWT_SECRET for backward compat; .env.example updated |
| 8 | Security | GDPR right to erasure not implemented | 23 Apr 2026 | DELETE /api/v1/customers/:id/erasure: anonymises customer PII, communication bodies, AI action inputs/outputs, and case notes in a single transaction; writes immutable audit_log entry |
| 26 | Compliance | GDPR data retention policy not defined | 23 Apr 2026 | Retention periods defined (cases+comms 7yr, AI actions 2yr, audit 10yr); retentionArchiver.js anonymises expired records; BullMQ retentionQueue runs weekly; npm run archive for manual runs |
| 27 | Compliance | No data processing agreement template | 23 Apr 2026 | docs/compliance/data-processing-agreement-template.md created — covers Art.28 obligations, sub-processors, retention periods, erasure mechanism. Needs legal review before use. |
| 28 | Compliance | AI provider zero-retention agreements not in place | 23 Apr 2026 | docs/compliance/ai-provider-zero-retention-checklist.md created — step-by-step for Anthropic and OpenAI. Manual sign-off still required. |
| 29 | Compliance | No terms of service or privacy policy | 23 Apr 2026 | docs/compliance/terms-of-service-template.md and privacy-policy-template.md created. Needs legal review before publishing. |

---

## Priority Guide

| Priority | When to close |
|---|---|
| URGENT | Before the next session starts |
| High | Before onboarding any real client data |
| Medium | Before scaling beyond the first paid pilot |
| Low | Before scaling beyond 10 clients or raising funding |

---

## Changelog

| Date | What changed |
|---|---|
| April 2026 | Initial file created with 37 seeded gaps |
| 22 April 2026 | Added gap 9 (exposed API key, URGENT), gap 25 (Docker networking), gap 40 (wrong postgres image). Added URGENT priority level. |
| 23 April 2026 | Session 8.1–8.3: resolved gaps 1,3,4,5,6,7 (security), 13,14,16,17 (performance), 20 (observability). Session 9.1: resolved gap 37 (CI/CD). Docker fixes: resolved gaps 25, 40. API audit: resolved gaps 46,47,48,49 (already implemented). Housekeeping: resolved gaps 10,11,33 (tests and auth screen done). |
| 23 April 2026 | Resolved gaps 2 (ENCRYPTION_SECRET), 8 (GDPR erasure endpoint), 26 (retention archiver + BullMQ job), 27 (DPA template), 28 (AI provider checklist), 29 (ToS + privacy policy templates). Gaps 9 and 19 flagged as manual actions. |
