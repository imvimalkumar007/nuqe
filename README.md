# nuqe

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

- **Database:** PostgreSQL
- **API:** Node.js with Express
- **Frontend:** React with Vite and Tailwind CSS
- **AI:** Anthropic Claude API
- **Queue:** BullMQ with Redis
- **Infrastructure:** Docker Compose

---

## Getting started locally

### Prerequisites

- Docker and Docker Compose installed
- Node.js 18+
- An Anthropic API key

### Setup

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/nuqe.git
cd nuqe

# Copy environment variables
cp .env.example .env

# Add your values to .env
# At minimum: ANTHROPIC_API_KEY and JWT_SECRET

# Start all services
docker compose up --build

# In a separate terminal, run database migrations
cd api && npm run migrate
```

The API will be running at `http://localhost:3001`
The web app will be running at `http://localhost:5173`
Health check: `http://localhost:3001/health`

---

## Project structure

```
nuqe/
├── docker-compose.yml
├── .env.example
├── api/                        # Express API
│   └── src/
│       ├── index.js            # Entry point
│       ├── db/
│       │   ├── pool.js         # PostgreSQL connection
│       │   ├── migrate.js      # Migration runner
│       │   └── migrations/     # SQL migration files
│       ├── routes/             # API route handlers
│       │   ├── cases.js
│       │   ├── communications.js
│       │   ├── deadlines.js
│       │   ├── compliance.js
│       │   ├── ai.js
│       │   └── audit.js
│       ├── engines/            # Core business logic
│       │   ├── deadlineEngine.js
│       │   ├── communicationEngine.js
│       │   └── complianceEngine.js
│       └── middleware/
└── web/                        # React frontend
    └── src/
        ├── main.jsx
        ├── App.jsx
        └── components/
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
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `JWT_SECRET` | Secret for JWT token signing |
| `PORT` | API port (default 3001) |
| `NODE_ENV` | development / production |

---

## Status

**Pre-validation — v0.1**
Currently in active development. Not yet in production.

---

## Licence

Private — all rights reserved.
