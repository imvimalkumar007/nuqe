# nuqe

[![CI](https://github.com/imvimalkumar007/nuqe/actions/workflows/ci.yml/badge.svg)](https://github.com/imvimalkumar007/nuqe/actions/workflows/ci.yml)

**Compliance-native communication and case management for digital lenders.**

Nuqe is a full-stack platform that unifies all written customer communication — email, chat, and postal — in a single compliance-governed environment. Every regulatory deadline is calculated automatically, every AI action requires human approval, and every event is logged immutably for audit.

---

## Three pillars

| Pillar | What it does |
|---|---|
| Useful analytics | Conduct risk patterns, complaint root causes, FOS escalation signals — portfolio-level intelligence |
| Automation with human review boundaries | AI classifies, drafts, and flags — humans approve every consequential action |
| Adaptive compliance layer | UK (FCA/DISP), India (RBI), EU (EBA) — regulatory rules as data, not code |

---

## Tech stack

- **Database:** PostgreSQL 18 with pgvector
- **API:** Node.js / Express — JWT auth, Zod validation, Helmet, rate limiting, Pino logging
- **Frontend:** React with Vite and Tailwind CSS
- **AI:** Pluggable model router — Claude (Anthropic), OpenAI, Gemini, or self-hosted
- **Knowledge:** RAG over pgvector — four namespaces, `as_at_date` historical filtering
- **Queue:** BullMQ with Redis — deadline alerts, retention archiver, regulatory monitor
- **Infrastructure:** Docker Compose (local) / Render Blueprint (production)

---

## Getting started locally

### Prerequisites

- Docker and Docker Compose installed
- Node.js 18+
- An Anthropic API key

### Setup

```bash
# Clone the repository
git clone https://github.com/imvimalkumar007/nuqe.git
cd nuqe

# Copy environment variables
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY, JWT_SECRET, ENCRYPTION_SECRET, QUIDO_WEBHOOK_SECRET

# Start all services (requires Docker / Rancher Desktop)
docker compose up --build -d

# Run database migrations
docker exec -it nuqe-api-1 npm run migrate

# Seed demo data
docker exec -it nuqe-api-1 npm run seed:demo
```

The API will be running at `http://localhost:3001`
The web app will be running at `http://localhost:5173`
Health check: `http://localhost:3001/health`

**Live demo:** https://nuqe-web.onrender.com — sign in with admin@nuqe.io / NuqeAdmin2026!

---

## Project structure

```
nuqe/
├── docker-compose.yml
├── render.yaml                 # Render Blueprint (4 services)
├── .env.example
├── .github/workflows/
│   ├── ci.yml                  # lint + test + build on every push
│   └── deploy.yml              # trigger Render deploy on main merge
├── api/                        # Express API
│   └── src/
│       ├── index.js
│       ├── app.js
│       ├── logger.js           # Pino structured logging
│       ├── db/
│       │   ├── pool.js
│       │   ├── migrate.js
│       │   ├── migrations/     # 008 SQL migration files
│       │   └── seeds/          # demo_data.js, regulatory_knowledge.js
│       ├── routes/             # cases, communications, deadlines, compliance,
│       │   │                   # ai, audit, metrics, settings, knowledge,
│       │   │                   # regulatory, customers, webhooks, users
│       ├── engines/            # deadlineEngine, communicationEngine,
│       │   │                   # complianceEngine, modelRouter,
│       │   │                   # piiTokeniser, knowledgeLayer,
│       │   │                   # regulatoryMonitor
│       ├── middleware/
│       │   ├── auth.js         # JWT verify
│       │   └── validate.js     # Zod middleware
│       ├── jobs/
│       │   └── retentionArchiver.js   # GDPR data retention
│       └── queues/
│           ├── deadlineQueue.js
│           ├── regulatoryQueue.js
│           └── retentionQueue.js
├── web/                        # React frontend
│   └── src/
│       ├── App.jsx
│       ├── api/client.js       # Axios with JWT interceptor
│       ├── context/AuthContext.jsx
│       ├── hooks/              # useCases, useMetrics, useKnowledge, …
│       └── components/         # 19 components (Login → Monitoring)
└── docs/compliance/            # DPA template, ToS, privacy policy, AI checklist
```

---

## Compliance jurisdictions

| Jurisdiction | Regulator | Key framework | Complaint timeline |
|---|---|---|---|
| United Kingdom | FCA | DISP, CONC, Consumer Duty | 3-day acknowledge / 8-week final response |
| India | RBI | Integrated Ombudsman Scheme, DPDP Act | 5-day acknowledge / 30-day resolution |
| European Union | EBA | EBA complaint handling guidelines, ADR Directive | 5-day acknowledge / 15 business days |

---

## Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `ANTHROPIC_API_KEY` | Anthropic API key (primary AI provider) |
| `OPENAI_API_KEY` | OpenAI API key (optional challenger model) |
| `JWT_SECRET` | Secret for JWT token signing |
| `ENCRYPTION_SECRET` | Separate secret for AES-256-GCM API key encryption |
| `QUIDO_WEBHOOK_SECRET` | Shared secret for Quido webhook HMAC verification |
| `PORT` | API port (default 3001) |
| `NODE_ENV` | development / production |
| `CORS_ORIGIN` | Allowed CORS origin (default http://localhost:5173) |

---

## Status

**Demo-ready — v0.1**
Deployed on Render. Full demo flow verified end to end. 142 tests passing.

---

## Licence

Private — all rights reserved.
