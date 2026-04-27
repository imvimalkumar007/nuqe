# NUQE_CONTEXT.md

> This file is the single source of truth for the Nuqe project. At the start of any new Claude chat, share this file and say: "Read this and continue where we left off."

---

## 1. Project Identity

**Product name:** Nuqe
**Tagline:** Compliance-native communication and case management for digital lenders
**Stage:** Demo-ready — deployed on Render, all smoke tests passing
**GitHub:** https://github.com/imvimalkumar007/nuqe
**Founder:** Vimal Kumar
**Date last updated:** 27 April 2026

**Live URLs:**
- Web: https://nuqe-web.onrender.com
- API: https://nuqe-api.onrender.com
- Health: https://nuqe-api.onrender.com/health

**Demo credentials:** admin@nuqe.io / NuqeAdmin2026!

---

## 2. What Nuqe Is

Nuqe governs the entire written communication lifecycle between a regulated digital lender and its customers: complaints, queries, arrears correspondence, collections communications, affordability discussions, default notices, debt management correspondence, and data subject access requests. It is not only a complaints tool.

Three pillars: useful analytics, automation with human review boundaries, adaptive compliance layer (UK/FCA, India/RBI, EU/EBA).

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL with pgvector (via Docker) |
| API | Node.js with Express, JWT auth, BullMQ |
| Frontend | React with Vite and Tailwind CSS |
| AI | Pluggable model router: Claude, OpenAI, Gemini, or self-hosted |
| Knowledge | RAG using pgvector, four namespaces, as_at_date historical filtering |
| Regulatory monitoring | Automated RSS and scraping with human-gated review |
| Queue | BullMQ with Redis |
| Container runtime | Rancher Desktop (Docker Desktop failed on Windows) |
| Hosting | Render — live at nuqe-web.onrender.com / nuqe-api.onrender.com |
| Version control | GitHub: github.com/imvimalkumar007/nuqe |

---

## 4. Local Development Environment

**OS:** Windows 11, project at E:\Nuqe
**Container runtime:** Rancher Desktop (must run docker commands from elevated PowerShell)

**To start containers:**
```powershell
# Elevated PowerShell (Run as administrator)
cd E:\Nuqe
docker compose up -d
```

**Four containers when running:**
- nuqe-postgres-1: port 5432
- nuqe-redis-1: port 6379
- nuqe-api-1: port 3001
- nuqe-web-1: port 5173

---

## 5. Demo Flow (for customer discovery conversations)

Login at https://nuqe-web.onrender.com with admin@nuqe.io / NuqeAdmin2026!

1. **Complaints dashboard** — 8 cases, metric cards (Breach Risk 2, Under Review 3, Open 3, FOS Referred 1)
2. **Open NQ-2026-0001** (Sarah Okonkwo, irresponsible lending) — 1 day to FINAL_RESPONSE deadline, breach risk
3. **AI actions tab** — pending response draft from Claude, review the generated text
4. Click **Approve** — badge flips from Pending to Approved
5. **Performance** (Analytics) — AI volume chart, case status breakdown
6. **Reg monitoring** — 5 monitored sources (FCA, FOS, EBA, RBI), manual Check buttons
7. **Settings → AI Configuration** — primary/challenger model, encrypted API key display

---

## 6. Environment Variables

File: E:\Nuqe\api\.env

```
DATABASE_URL=postgresql://nuqe:nuqe_secret@localhost:5432/nuqe
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=REPLACE_WITH_NEW_KEY
JWT_SECRET=0e659184f3d8904c3062efe0b125d90d3be8d8766f5f3a6d2b50d16deb863ef8
PORT=3001
NODE_ENV=development
QUIDO_WEBHOOK_SECRET=quido_secret_local
EMBEDDING_DIMENSIONS=1536
```

Note: DATABASE_URL uses localhost for running outside Docker. The docker-compose.yml environment override uses postgres as hostname for inside Docker. Both are needed.

---

## 7. Build Progress

**Phase 0–11 complete as of 26 April 2026. Phase 12 (email omnichannel) in progress as of 27 April 2026.**

- 183 tests defined and passing (20 components)
- All API routes implemented and tested
- Email omnichannel shipped 27 April 2026:
  - `channels` table — named queues with nuqe_inbound routing addresses
  - `user_channel_assignments` — many-to-many staff-to-channel
  - Inbound email webhook (Mailgun) — thread matching via In-Reply-To + subject case ref
  - Resend delivery status webhook — `delivery_status` updated on communications
  - Tiptap rich text composer — Bold, Italic, lists, blockquote, CC/BCC, internal notes
  - Internal notes — `is_internal=true`, amber styling, never sent to customer
  - Delivery status dots on comm cards — sent/delivered/opened/bounced

**Pending (to go live):**
- Register `inbound.nuqe.io` domain and set MX records to Mailgun
- Set `MAILGUN_WEBHOOK_SIGNING_KEY` in Render env
- Set `RESEND_WEBHOOK_SECRET` in Render env

---

## 8. Database Schema (17 Tables)

customers, cases, communications, deadlines, ruleset, ai_actions, audit_log, organisation_ai_config, tokeniser_additions, knowledge_chunks, knowledge_documents, regulatory_sources, regulatory_monitoring_log, notifications, users, channels, user_channel_assignments.

Migration files: 001_initial_schema.sql, 002_ai_config_and_review_layer.sql, 003_knowledge_base.sql, 005_regulatory_monitoring.sql (requires pgvector, will work in Docker).

---

## 9. Key Architecture Decisions

- RAG over fine-tuning for regulatory knowledge
- as_at_date parameter for historical case accuracy
- Pluggable model router for data sovereignty
- Four-layer PII tokeniser before every AI call
- Greyed-out pending state for all AI actions
- Automated regulatory monitoring with human review gate
- Cosine similarity above 0.85 for chunk supersession
- Rancher Desktop instead of Docker Desktop (Windows permissions issue)
- docker-compose.yml environment override for Docker service hostnames

---

## 10. Living Documents

Both saved without version numbers. Updated every 5 messages automatically.

**Nuqe_Project_Document.docx:** Product explanation, architecture, business model, roadmap. Generator: /home/claude/nuqe_project_doc_v04.js
**Nuqe_Build_Log.docx:** All Claude Code build messages as reference cards. Generator: /home/claude/nuqe_build_log_v4.js
**NUQE_CONTEXT.md:** This file. Update at end of every session.
**NUQE_TECHNICAL_DEBT.md:** 37 tracked technical gaps. Update when new gaps identified.

Rules: No em dashes. No version numbers in filenames. British spelling.

---

## 11. Nuqe Brand

Purple: #7C3AED. Background: #0A0C10. Surface: #111318. Text: #E8EAF0. Danger: #EF4444. Warning: #F59E0B. Success: #10B981.

Dark theme, clinical precision, authoritative typography. No rounded pill buttons, no pastel gradients.

---

## 12. Compliance Layer

| Jurisdiction | Regulator | Acknowledge | Final response | Escalation |
|---|---|---|---|---|
| UK | FCA/DISP | 3 days | 56 days | FOS |
| India | RBI | 5 business days | 30 days | RBI Ombudsman |
| EU | EBA | 5 business days | 15 business days (extendable to 35) | National ADR bodies |

---

## 13. Quido Integration

Consumer lending prototype at https://quido-prototype.onrender.com. First internal pilot client. Three integration points via POST /api/v1/webhooks/quido: contact form, live chat, customer portal messages.

---

## 14. Business Model

Starter: £499/month (up to 10k customers). Growth: £1,499/month (10k to 100k). Scale: from £3,500/month (100k+ or multi-jurisdiction).

---

## 15. Founder Context

Vimal Kumar. Product Operations Manager at Credair Limited (FCA-authorised). Named complaints contact in FCA filings. Not SM&CR registered. London. MSc Warwick, A-CSPO, CSPO, AgilePM, PRINCE2. Newborn daughter Viana. Parallel tracks: UK job search, Australian migration, Nuqe.

---

## 16. Instructions for Claude in Any New Chat

1. Read this entire file first.
2. Go to Section 5 (Immediate Next Steps) and address those before anything else.
3. Every 5 messages in any Nuqe conversation, regenerate and deliver both docx files automatically.
4. Never use em dashes. Never version filenames. Update this file at end of every session.
5. Update NUQE_TECHNICAL_DEBT.md when new gaps are identified.

---

## 17. Session Log

| Date | What happened | What is next |
|---|---|---|
| April 2026 | Full architecture designed, all 21 backend messages and 10 UI messages acted on in Claude Code. GitHub repo live. Render configured. NUQE_CONTEXT.md and NUQE_TECHNICAL_DEBT.md created. | Apply docker-compose.yml fix, run migrations, run seed, confirm demo. |
| 22 April 2026 | Rancher Desktop installed and working. All four Docker containers pulled and started. Docker networking issue identified: API container needs postgres hostname not localhost. Fix designed but not yet applied. Anthropic API key accidentally exposed in chat and must be rotated. | Apply fix in Section 5 steps 1 to 6 at start of next session. |
