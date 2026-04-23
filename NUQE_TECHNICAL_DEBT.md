# NUQE_TECHNICAL_DEBT.md

> Tracks all known technical gaps, shortcuts, deferred decisions, and areas needing attention. Share this file at the start of any gap-closing session and say: "Work through all high priority open gaps first, then medium, then low."

---

## Open Gaps

| # | Area | Description | Priority | Added | Notes |
|---|---|---|---|---|---|
| 1 | Security | JWT token expiry and refresh logic not yet configured | High | Apr 2026 | Add 1hr access token, 7 day refresh token, and refresh endpoint |
| 2 | Security | API key encryption uses JWT_SECRET. Should move to dedicated secrets manager in production. | High | Apr 2026 | Acceptable for pilot. Must resolve before onboarding second client. |
| 3 | Security | No rate limiting on public endpoints | High | Apr 2026 | Use express-rate-limit on all routes |
| 4 | Security | CORS may be too permissive | High | Apr 2026 | Restrict to known frontend origin |
| 5 | Security | No input validation middleware applied globally | High | Apr 2026 | Add express-validator or zod on all POST and PATCH routes |
| 6 | Security | Helmet.js not yet added | High | Apr 2026 | Add helmet middleware to api/src/index.js |
| 7 | Security | Audit all queries for raw string interpolation | High | Apr 2026 | Fail any query using string concatenation |
| 8 | Security | GDPR right to erasure not yet implemented | High | Apr 2026 | Build DELETE /api/v1/customers/:id/erasure with cascade and audit log |
| 9 | Security | Anthropic API key was accidentally exposed in chat on 22 April 2026 | URGENT | 22 Apr 2026 | Delete exposed key at console.anthropic.com/settings/keys and create new one immediately |
| 10 | Testing | No tests written yet | High | Apr 2026 | Target 80 percent coverage. Jest for API, Vitest for frontend. |
| 11 | Testing | No end-to-end tests | Medium | Apr 2026 | Use Playwright after all screens connected |
| 12 | Testing | Seed script not tested for idempotency | Medium | Apr 2026 | Confirm delete order is correct |
| 13 | Performance | No caching on getActiveRuleset() calls | Medium | Apr 2026 | Cache in Redis with 10-minute TTL |
| 14 | Performance | No caching on organisation_ai_config lookups | Medium | Apr 2026 | Cache in memory with 5-minute TTL |
| 15 | Performance | pgvector index may need tuning at scale | Low | Apr 2026 | Revisit when chunks exceed 100,000 rows |
| 16 | Performance | No database connection pool size configured | Medium | Apr 2026 | Set pool max to 20 in pool.js |
| 17 | Performance | BullMQ queues have no retry configuration | Medium | Apr 2026 | Add retry: 3 and backoff to all queue workers |
| 18 | Reliability | No health check monitoring or alerting | Medium | Apr 2026 | Add UptimeRobot free tier |
| 19 | Reliability | No database backup strategy confirmed | High | Apr 2026 | Confirm Render PostgreSQL backup schedule before going live |
| 20 | Reliability | No error tracking | Medium | Apr 2026 | Add Sentry free tier and structured logging via pino |
| 21 | Reliability | BullMQ dead letter queue not configured | Low | Apr 2026 | Configure failed job handler |
| 22 | Architecture | Multi-tenancy relies on application-level filtering only | Medium | Apr 2026 | Consider PostgreSQL row-level security |
| 23 | Architecture | Express API is a monolith | Low | Apr 2026 | Plan to extract engines before scaling beyond 10 clients |
| 24 | Architecture | No API versioning strategy | Low | Apr 2026 | Document before releasing public API |
| 25 | Architecture | Docker networking: API container uses localhost but needs postgres hostname | High | 22 Apr 2026 | Fix in docker-compose.yml environment override. See NUQE_CONTEXT.md Section 5. NOT YET APPLIED. |
| 26 | Compliance | GDPR data retention policy not defined | High | Apr 2026 | Define retention periods and build archival job |
| 27 | Compliance | No data processing agreement template | High | Apr 2026 | Required before onboarding first paying client |
| 28 | Compliance | AI provider enterprise zero-retention agreements not in place | High | Apr 2026 | Required before processing real client data via external AI APIs |
| 29 | Compliance | No terms of service or privacy policy | High | Apr 2026 | Required before any client pilot |
| 30 | Understanding | pgvector HNSW vs ivfflat trade-offs not fully understood | Low | Apr 2026 | Read docs before knowledge base exceeds 50,000 chunks |
| 31 | Understanding | BullMQ failure modes under Redis loss not tested | Low | Apr 2026 | Test graceful drain behaviour |
| 32 | Understanding | Supersession threshold of 0.85 not validated | Medium | Apr 2026 | Test after knowledge base is seeded |
| 33 | Frontend | No authentication or login screen | High | Apr 2026 | Build before deploying to Render |
| 34 | Frontend | No loading states on initial app load | Low | Apr 2026 | Add global loading state |
| 35 | Frontend | No network error handling | Low | Apr 2026 | Add global error boundary with retry |
| 36 | Frontend | No mobile responsiveness | Low | Apr 2026 | Assess after first customer discovery conversations |
| 37 | DevOps | No CI/CD pipeline | Medium | Apr 2026 | Add GitHub Actions after test suite exists |
| 38 | DevOps | No staging environment | Medium | Apr 2026 | Create before onboarding first client |
| 39 | DevOps | Docker Compose not tested on clean machine | Low | Apr 2026 | Document setup steps |
| 40 | DevOps | docker-compose.yml uses postgres:16-alpine not pgvector/pgvector:pg16 | High | 22 Apr 2026 | Update image to pgvector/pgvector:pg16 to enable vector extension for migration 005 |

---

| 46 | API | GET /api/v1/metrics/ai-accuracy still returns placeholder. AnalyticsDashboard relies on this. | High | 22 Apr 2026 | Implement before wiring UI-3. |
| 47 | API | GET /api/v1/regulatory/sources and /monitoring-log not yet implemented. RegulatoryMonitoring screen relies on these. | High | 22 Apr 2026 | Implement before wiring UI-4. |
| 48 | API | GET and PATCH /api/v1/settings/ai-config not yet implemented. Settings screen relies on these. | Medium | 22 Apr 2026 | Implement before wiring UI-5. |
| 49 | API | POST /api/v1/settings/tokeniser not yet implemented. | Medium | 22 Apr 2026 | Implement before wiring UI-5. |

## Resolved Gaps

| # | Area | Description | Resolved | How |
|---|---|---|---|---|
| 1 | Security | JWT token expiry and refresh logic | 23 Apr 2026 | Already implemented: 1h access token, 7d refresh token, refresh endpoint in auth.js |
| 3 | Security | No rate limiting on public endpoints | 23 Apr 2026 | express-rate-limit: 10/min on auth, 60/min on webhooks, 200/min on all other routes; skipped in test env |
| 4 | Security | CORS too permissive | 23 Apr 2026 | Restricted to CORS_ORIGIN env var (default localhost:5173) |
| 5 | Security | No input validation middleware | 23 Apr 2026 | Zod schemas + validate() middleware on all POST and PATCH routes |
| 6 | Security | Helmet.js not added | 23 Apr 2026 | Added helmet() to app.js as first middleware |
| 7 | Security | SQL injection audit | 23 Apr 2026 | All queries use parameterized $1/$2 style; only dynamic element in regulatory.js PATCH /sources/:id uses hardcoded column names from known `if` checks (safe) |

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
