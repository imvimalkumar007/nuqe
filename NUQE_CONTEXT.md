# NUQE_CONTEXT.md

> This file is the single source of truth for the Nuqe project. At the start of any new Claude chat, share this file and say: "Read this and continue where we left off." Claude will update this file and both living documents as the conversation progresses.

---

## 1. Project Identity

**Product name:** Nuqe
**Tagline:** Compliance-native communication and case management for digital lenders
**Stage:** Pre-validation
**GitHub:** https://github.com/imvimalkumar007/nuqe
**Founder:** Vimal Kumar
**Date last updated:** April 2026

---

## 2. What Nuqe Is

Nuqe is a full-stack platform that unifies all written customer communication (email, live chat, postal) in a single compliance-governed environment for regulated digital lenders. Every regulatory deadline is calculated automatically from jurisdiction-specific rulesets stored as data, not code. Every AI action requires explicit human approval before it affects any case or reaches any customer. Every event is logged immutably for audit.

**Three pillars:**
1. Analytics that are useful: conduct risk patterns, complaint root causes, FOS escalation signals, AI accuracy metrics, model comparison
2. Automation with human review boundaries: AI classifies, drafts, and flags — humans approve every consequential action via a greyed-out pending state UI
3. Adaptive compliance layer: UK (FCA/DISP), India (RBI), EU (EBA) — rules as data, RAG-powered knowledge layer, automated regulatory source monitoring

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL with pgvector extension |
| API | Node.js with Express, JWT auth, BullMQ for async queuing |
| Frontend | React with Vite and Tailwind CSS |
| AI | Pluggable model router: Claude, OpenAI, Gemini, or self-hosted |
| Knowledge | RAG using pgvector — four namespaces, as_at_date historical filtering |
| Regulatory monitoring | Automated RSS and scraping with human-gated review pipeline |
| Embeddings | Voyage-3 (Anthropic) or text-embedding-3-small (OpenAI) |
| Queue | BullMQ with Redis |
| Infrastructure | Docker Compose using pgvector/pgvector:pg16 image |
| Hosting | Render (configured, not yet deployed) |
| Version control | GitHub: github.com/imvimalkumar007/nuqe |

---

## 4. Database Schema (14 Tables)

| Table | Purpose |
|---|---|
| customers | Borrower records with jurisdiction and vulnerability flags |
| cases | Complaint lifecycle from open to closed |
| communications | All written communications across every channel unified |
| deadlines | Regulatory timelines per case calculated from active ruleset |
| ruleset | Jurisdiction compliance rules stored as data rows |
| ai_actions | Every AI action with human review gate, classification comparison, model attribution |
| audit_log | Immutable append-only record — no UPDATE or DELETE ever permitted |
| organisation_ai_config | Per-organisation AI provider config with A/B routing and tokenisation settings |
| tokeniser_additions | Adaptive PII tokeniser entries added by human specialists |
| knowledge_chunks | RAG vector store with pgvector embeddings and as_at_date metadata |
| knowledge_documents | Source document tracking for ingestion pipeline |
| regulatory_sources | Configured official regulatory sources for automated monitoring |
| regulatory_monitoring_log | Audit log of every monitoring check per source |
| notifications | Compliance reviewer alerts for pending regulatory ingestions |

**Migration files:**
- `001_initial_schema.sql` — core 8 tables, ruleset seed data, audit_log protection
- `002_ai_config_and_review_layer.sql` — ai_actions additions, organisation_ai_config
- `003_tokeniser_additions.sql` — adaptive tokeniser table
- `004_knowledge_layer.sql` — pgvector extension, knowledge_chunks, knowledge_documents
- `005_regulatory_monitoring.sql` — regulatory_sources, monitoring_log, notifications

---

## 5. Key Architecture Decisions (and Why)

| Decision | What was chosen | Why |
|---|---|---|
| AI knowledge grounding | RAG over fine-tuning | Regulatory content changes frequently. RAG allows updates without retraining. Auditable: every retrieval logged. |
| Historical accuracy | as_at_date parameter in retrieveContext() | Historical cases must reason from guidance active when the case was opened, not current guidance |
| AI provider | Pluggable model router | Data sovereignty requirements in regulated firms. Organisations bring their own subscription. |
| PII protection | Four-layer tokeniser before every AI call | Sensitive data (names, accounts, vulnerability disclosures) never reaches external AI provider in identifiable form |
| Human oversight | Greyed-out pending state UI + mandatory review gate | Regulatory defensibility. Every AI action traceable. Auditor can see AI suggestion and human decision separately. |
| Regulatory currency | Automated source monitoring with human review gate | Regulation changes continuously. Manual tracking fails. Automated monitoring with human approval keeps knowledge current without risk of unapproved content going live. |
| Supersession logic | Cosine similarity above 0.85 + matching jurisdiction and document_type | When new regulatory guidance is approved, outdated chunks are automatically superseded and affected open cases are surfaced for review |
| Quido integration | Webhook endpoint POST /api/v1/webhooks/quido | Quido is a consumer lending prototype (quido-prototype.onrender.com) built by the same founder. It is the first real-world communication source for Nuqe and the first internal pilot client. |
| AI accuracy tracking | was_edited boolean + ai_classification vs human_classification | Tracks model performance per provider over time. Drives model comparison dashboard. Creates a feedback loop for continuous improvement. |
| Compliance rules | Rules as data rows in ruleset table | Rule updates propagate without engineering changes. No redeployment needed. |

---

## 6. Living Documents

Two documents are maintained as living references. Both are saved without version numbers. Each update replaces the previous file. Version history is tracked via changelog sections inside each document.

### Nuqe_Project_Document.docx
**Purpose:** Product explanation, architecture, pillars, compliance layer, business model, roadmap, validation status. Used in customer discovery conversations and investor/endorsement discussions.

**Current version:** v0.4 (April 2026)

**Sections:**
1. What is Nuqe
2. The Problem
3. The Solution: Three Pillars
4. Product Architecture
5. RAG Knowledge Layer
6. Adaptive Regulatory Monitoring (NEW in v0.4)
7. Pluggable AI and Model Comparison
8. PII Tokenisation: Four-Layer Adaptive Design
9. Human Review Layer and AI Accuracy
10. Adaptive Compliance Layer
11. Quido Integration (Planned)
12. Target Market
13. Business Model
14. Build Roadmap
15. Validation Status
16. Founder Context
17. Changelog

**How to update:** Regenerate using the JavaScript generator script stored at `/home/claude/nuqe_project_doc_v04.js` in the Claude computer environment. Save as `Nuqe_Project_Document.docx` with no version number in the filename.

**Key rules:**
- No em dashes anywhere in the document. Use commas, colons, or restructure sentences.
- No version number in the filename.
- Changelog inside the document tracks every update.

### Nuqe_Build_Log.docx
**Purpose:** All Claude Code build messages as structured reference cards. Used as the technical build guide. Every message has: status, purpose, context (dependencies), what to build, files created, and notes.

**Current version:** v1.3 (April 2026)

**Structure:**
- How to Use
- Stack Summary
- Build Sequence Overview (31 total items: 21 BE + 5 UI mock + 5 UI wiring/seed)
- Phase 1: Foundation (Messages 1 to 8)
- Track B: UI Screens Mock Data (UI-1 to UI-5)
- Track B: API Wiring and Demo Data (UI-6 to UI-10)
- Phase 2: AI Layer, Review, and Metrics (Messages 9 to 16)
- Phase 3: Adaptive Tokeniser and RAG Knowledge Layer (Messages 17 to 20)
- Phase 4: Adaptive Regulatory Monitoring (Message 21)
- Demo Flow for Customer Discovery Calls
- GitHub and Deployment Reference
- Changelog

**How to update:** Regenerate using the JavaScript generator script stored at `/home/claude/nuqe_build_log_v4.js` in the Claude computer environment. Save as `Nuqe_Build_Log.docx` with no version number in the filename.

**Key rules:**
- No version number in the filename.
- Every 5 messages in any Nuqe conversation, update both documents automatically without being asked.
- No em dashes anywhere.

---

## 7. Build Progress

### Backend (Messages 1 to 21)

| # | Title | Status |
|---|---|---|
| 1 | Project Scaffold | In progress |
| 2 | Database Schema | In progress |
| 3 | DB Connection and Migration Runner | In progress |
| 4 | API Routes Scaffold | In progress |
| 5 | Deadline Engine | In progress |
| 6 | Communication Engine | In progress |
| 7 | Compliance Rules Engine | In progress |
| 8 | Frontend Base | In progress |
| 9 | Schema Additions | Planned |
| 10 | Model Router | Planned |
| 11 | PII Tokeniser | Planned |
| 12 | Human Review Layer | Planned |
| 13 | AI Accuracy and Model Comparison Metrics | Planned |
| 14 | Quido Webhook Integration | Planned |
| 15 | Organisation Settings | Planned |
| 16 | Global Greyed-Out Pending State | Planned |
| 17 | Adaptive Tokeniser with Human Feedback Loop | Planned |
| 18 | RAG Knowledge Layer | Planned |
| 19 | Knowledge Management UI | Planned |
| 20 | Regulatory Knowledge Seed | Planned |
| 21 | Adaptive Regulatory Monitoring | Planned |

### Frontend UI Track B (Screens UI-1 to UI-10)

| # | Title | Status |
|---|---|---|
| UI-1 | Complaints Dashboard (mock data) | In progress |
| UI-2 | Single Case View (mock data) | Planned |
| UI-3 | Analytics Dashboard (mock data) | Planned |
| UI-4 | Regulatory Monitoring Screen (mock data) | Planned |
| UI-5 | Settings Screen (mock data) | Planned |
| UI-6 | API Wiring: Complaints Dashboard | Planned |
| UI-7 | API Wiring: Single Case View | Planned |
| UI-8 | API Wiring: Analytics and Settings | Planned |
| UI-9 | API Wiring: Regulatory Monitoring | Planned |
| UI-10 | Demo Seed Data | Planned |

---

## 8. Current Active Prompt

The next Claude Code message to paste is **UI-1: Complaints Dashboard**. This is the first screen in Track B. Use mock data hardcoded in the component. Do not connect to the API yet.

```
I am building the frontend for a product called Nuqe. It is a compliance-native
communication and case management platform for digital lenders. The frontend is a
React application using Vite and Tailwind CSS, already scaffolded in the web/ folder.

Brand colours:
- Primary purple: #7C3AED
- Light purple: #EDE9FE
- Dark navy: #1E1B4B
- Background: #0A0C10
- Surface: #111318
- Text: #E8EAF0
- Muted: #6B7280
- Danger: #EF4444
- Warning: #F59E0B
- Success: #10B981

Design: dark theme, precise, authoritative. Compliance professionals, not a consumer
app. No rounded pill buttons, no pastel gradients, no playful elements.

Build the Complaints Dashboard only. Do not build any other screen.

The screen must show:
1. Top nav bar: Nuqe logo left, firm name and FCA regulatory badge right
2. Left sidebar: Casework (Complaints active, All cases, FOS referrals),
   Communications (Inbox, Live chat, Postal queue), Compliance (Consumer Duty,
   Audit trail, Reg updates, Regulatory Monitoring), Analytics, Knowledge
   (Regulatory, Product, Gaps), Settings
3. Four metric cards: Breach risk (red), Under review (amber), Open (purple),
   FOS referred (muted purple)
4. Filter chips: All, Breach risk, Under review, FOS referred
5. Cases table: Case ID (monospaced purple), Customer (name + account ref),
   Issue, Channel (coloured dot), Status (badge), DISP Deadline (progress bar
   coloured by urgency), AI (state badge)
6. Six mock cases: 2 breach risk, 1 FOS referred, 1 implicit complaint, 2 comfortable
7. Bottom bar: case count, ruleset reference (DISP 1.6, FCA rulebook v2024), pagination

Use mock data hardcoded in the component. Do not connect to the API yet.

Deliver as web/src/components/ComplaintsDashboard.jsx and add to App.jsx on /complaints.
```

---

## 9. Nuqe Brand

**Colours:**
- Primary purple: #7C3AED
- Light purple: #EDE9FE
- Dark navy: #1E1B4B
- Background (dark): #0A0C10
- Surface: #111318
- Text: #E8EAF0
- Muted: #6B7280
- Danger: #EF4444
- Warning: #F59E0B
- Success: #10B981

**Logo:** Purple ring icon with "Nuqe" wordmark in dark sans-serif (see Frame_1.png in repo)

**Design language:** Dark theme, clinical precision, authoritative typography. Used by compliance professionals in regulated financial firms. No rounded pill buttons, no pastel gradients, no playful elements.

**Writing rules:** No em dashes anywhere. Use commas, colons, or restructure sentences. British spelling. No overstatement.

---

## 10. Compliance Layer Details

| Jurisdiction | Regulator | Key framework | Acknowledge deadline | Final response deadline | Escalation |
|---|---|---|---|---|---|
| UK | FCA | DISP, CONC, Consumer Duty | 3 days | 56 days (8 weeks) | Financial Ombudsman Service |
| India | RBI | Integrated Ombudsman Scheme, DPDP Act 2023 | 5 business days | 30 days | RBI Ombudsman |
| EU | EBA / NCAs | EBA GL/2012/01, ADR Directive, GDPR | 5 business days | 15 business days (extendable to 35) | National ADR bodies |

---

## 11. Quido Integration

**What Quido is:** A consumer lending prototype built by the same founder. Live at https://quido-prototype.onrender.com. Borrower-facing application for personal loan applications (£300 to £10,000), affordability decisions, contract signing, and loan account management. Also hosted on Render and GitHub.

**Why it matters for Nuqe:** Quido is the first real-world communication source for Nuqe. It is the first internal pilot client. By the time external customer discovery conversations happen, there will be real operational data and a working integration to show.

**Three integration points:**

| Integration point | Nuqe behaviour | Endpoint |
|---|---|---|
| Contact and complaints form | POSTs to Nuqe on submission. Complaint reasons trigger classification, case opening, and regulatory clock. | POST /api/v1/webhooks/quido |
| Live chat widget | Chat threads routed into Nuqe as communication records linked to loan ID. | POST /api/v1/webhooks/quido |
| Customer portal messages | Route with customer ID and loan reference pre-attached. | POST /api/v1/webhooks/quido |

**Webhook security:** X-Quido-Secret header validated against QUIDO_WEBHOOK_SECRET environment variable.

---

## 12. PII Tokeniser: Four Layers

| Layer | Method | What it catches |
|---|---|---|
| 1 | Regex | Names, email, UK phone, postcode, sort code, account number, card number, NI number, loan ref (NQ-YYYY-NNNN), monetary amounts |
| 2 | Domain vocabulary | UK debt charities (StepChange, National Debtline, PayPlan), benefit types (Universal Credit, PIP, ESA, JSA, DLA), financial difficulty (IVA, CCJ, DMP, bankruptcy, DRO), vulnerability keywords (bereavement, mental health, domestic abuse), external orgs (FOS, ICO, Citizens Advice) |
| 3 | NLP — compromise.js | Named entity recognition for persons, organisations, locations. Below 0.8 confidence: tokenise conservatively, flag as low confidence. |
| 4 | Adaptive additions | Human-curated patterns from tokeniser_additions table. Organisation-scoped (active immediately) or global (requires admin review). |

**Token format:** [TYPE-INDEX] — e.g. [NAME-1], [ACCOUNT-2], [VULNERABILITY-3]

---

## 13. RAG Knowledge Layer

**Four namespaces:**

| Namespace | Scope | What it contains |
|---|---|---|
| Regulatory | Shared (Nuqe-managed) | FCA DISP, CONC, Consumer Duty, RBI master directions, EBA guidelines, FOS decisions, Dear CEO letters |
| Product | Organisation-specific | Loan terms, fee schedules, credit agreements, product history |
| Industry | Shared (Nuqe-managed) | FOS decision trends, complaint categories, supervisory focus areas |
| Internal process | Organisation-specific | Vulnerability procedures, forbearance options, arrears escalation |

**Critical design: as_at_date filtering**

Every retrieval call accepts a `case.opened_at` date. Chunks are filtered to those effective at the time the case was opened. Historical cases always reason from historically accurate guidance. This is critical for regulatory defensibility.

**Regulatory monitoring sources:**

| Source | Jurisdiction | Method | Frequency |
|---|---|---|---|
| FCA news | UK | RSS | Every 12 hours |
| FCA publications | UK | RSS | Every 24 hours |
| FOS decisions | UK | Scrape | Every 24 hours |
| RBI press releases | India | Scrape | Every 24 hours |
| EBA publications | EU | Scrape | Every 24 hours |

**Supersession logic:** When a new chunk is approved, similarity search against existing active chunks with matching jurisdiction and document_type. Chunks with cosine similarity above 0.85 are automatically superseded (effective_to set to today). Open cases using superseded chunks are surfaced for compliance review.

---

## 14. Human Review Layer

**Flow:**
1. All AI actions render in greyed-out pending state with "Pending review" badge
2. Three options: Approve, Edit and Approve (inline editor), Reject
3. Classification actions show AI classification as selectable badge — specialist can change before approving
4. Flag missed sensitive data — opens tokeniser addition modal
5. Flag missing knowledge — opens knowledge gap modal

**What is logged per review:**
- `ai_output` — exactly what the AI produced (never overwritten)
- `human_output` — what was approved (original or edited)
- `was_edited` — boolean flag
- `ai_classification` vs `human_classification` — for accuracy tracking
- `reviewed_by` — staff UUID
- `reviewed_at` — timestamp

---

## 15. Business Model

| Tier | Target | Pricing | Includes |
|---|---|---|---|
| Starter | Up to 10,000 customers | £499/month | Single jurisdiction, complaint management, deadline tracking, email channel, basic AI with tokenisation |
| Growth | 10,000 to 100,000 customers | £1,499/month | Two jurisdictions, all channels, full AI suite, RAG knowledge layer, adaptive regulatory monitoring, model comparison, human review dashboard |
| Scale | 100,000+ or multi-jurisdiction | From £3,500/month | All jurisdictions, custom model config, dedicated knowledge base management, SLA, A/B routing |

---

## 16. Deployment

**GitHub:** https://github.com/imvimalkumar007/nuqe
**Branch:** main
**Auto-deploy:** Render configured via render.yaml. Not yet deployed.
**Render services:** nuqe-api (Starter), nuqe-web (Static), nuqe-db (Basic-256mb), nuqe-redis (Starter)
**Estimated Render cost:** £27.50/month when deployed
**Deployment steps when ready:**
1. Go to render.com, New, Blueprint, select nuqe repo
2. Enter ANTHROPIC_API_KEY when prompted
3. After deploy: open nuqe-api Shell, run `npm run migrate`
4. Then run `npm run seed:knowledge`
5. Then run `npm run seed:demo`
6. Confirm at https://nuqe-api.onrender.com/health

---

## 17. Founder Context

**Name:** Vimal Kumar
**Current role:** Product Operations Manager at Credair Limited (FCA-authorised consumer credit firm)
**Regulatory standing:** Named complaints contact in FCA organisational filings for Credair. Not SM&CR registered.
**Domain expertise:** DISP complaint handling, Consumer Duty evidencing, FOS case management, CONC obligations, FCA regulatory reporting
**Certifications:** A-CSPO, CSPO, AgilePM, PRINCE2, MSc University of Warwick
**Location:** London
**Parallel tracks:** UK job search (5 months active), Australian skilled migration (190/491 visa, mid-to-late 2027 timeline), Nuqe build

---

## 18. Instructions for Claude in Any New Chat

When a new chat starts and this file is shared:

1. Read the entire file before responding.
2. Confirm current build status and what is next.
3. If the conversation adds new decisions, features, or architecture changes, update this file at the end of the conversation.
4. Every 5 messages in any Nuqe conversation, automatically regenerate and deliver both `Nuqe_Project_Document.docx` and `Nuqe_Build_Log.docx` using the generator scripts. Do not wait to be asked.
5. Never use em dashes in any output. Use commas, colons, or restructure sentences.
6. Never version the filenames of the two living documents. Save as `Nuqe_Project_Document.docx` and `Nuqe_Build_Log.docx` always.
7. Update this NUQE_CONTEXT.md file whenever significant decisions are made, build status changes, or new features are designed.
8. The generator scripts for both documents are stored in the Claude computer environment. The project document generator is at `/home/claude/nuqe_project_doc_v04.js` and the build log generator is at `/home/claude/nuqe_build_log_v4.js`. These should be updated and re-run whenever the documents need updating.

---

## 19. Open Questions and Next Decisions

- How many customer discovery conversations to complete before starting a paid pilot?
- Pricing validation: are the three tiers at the right price points for UK mid-market digital lenders?
- Company registration: RegOps Systems Ltd was considered as a company name. Nuqe is the product name. Decision on legal entity name still open.
- Innovator Visa endorsement: Nuqe could form the basis of an Innovator Visa application once traction is demonstrated. This has not been formally pursued yet.
- Ireland as a secondary market: CBI Consumer Protection Code 2025 is the regulatory angle. Not yet in the product roadmap formally.

---

## 20. Changelog

| Date | What changed |
|---|---|
| April 2026 | Initial NUQE_CONTEXT.md created covering full project state, all architecture decisions, build progress, living documents, brand, compliance layer, Quido integration, PII tokeniser, RAG knowledge layer, human review layer, business model, deployment, and founder context. |
