# Data Processing Agreement — Template

> **Legal review required before use.** This template must be reviewed and approved by a qualified solicitor before being presented to any client.

**Agreement date:** [DATE]
**Controller:** [CLIENT COMPANY NAME] ("Controller")
**Processor:** Nuqe Ltd, [ADDRESS] ("Processor")

---

## 1. Subject Matter and Duration

The Processor shall process personal data on behalf of the Controller for the purpose of delivering the Nuqe compliance management platform ("Service"), for the duration of the Master Services Agreement between the parties.

## 2. Nature and Purpose of Processing

The Processor will process personal data to:
- Manage financial services complaint cases on behalf of the Controller
- Generate AI-assisted draft responses to customer communications
- Monitor regulatory deadlines and compliance obligations
- Provide analytics and reporting on complaint handling performance

## 3. Type of Personal Data Processed

- Customer full name, email address, telephone number
- Customer complaint and case correspondence (written communications)
- Customer account references and case identifiers
- AI-generated analysis and draft content relating to customer complaints

## 4. Categories of Data Subjects

Retail and business customers of the Controller who have submitted complaints or are party to an open case managed via the Service.

## 5. Obligations of the Processor

The Processor shall:

(a) Process personal data only on documented instructions from the Controller, including with regard to transfers to third countries;

(b) Ensure that persons authorised to process personal data have committed themselves to confidentiality;

(c) Implement appropriate technical and organisational measures (Article 32 GDPR) including:
   - AES-256-GCM encryption of stored API keys
   - JWT-based authentication with short-lived access tokens (1 hour)
   - Rate limiting and input validation on all API endpoints
   - Immutable audit logging of all data access and modifications
   - Data isolation at the organisation level

(d) Not engage a sub-processor without prior written authorisation from the Controller;

(e) Assist the Controller with data subject rights requests (access, rectification, erasure, portability, restriction);

(f) Implement the right to erasure via the `/api/v1/customers/:id/erasure` endpoint, which anonymises all PII fields in-place within a single transaction and records the action in the immutable audit log;

(g) Delete or return all personal data at the end of the service relationship, at the Controller's choice;

(h) Provide all information necessary to demonstrate compliance with Article 28 GDPR.

## 6. Sub-processors

The Processor currently uses the following sub-processors:

| Sub-processor | Purpose | Location | DPA in place |
|---|---|---|---|
| Anthropic | AI model inference (Claude) | USA | To be confirmed — see ai-provider-zero-retention-checklist.md |
| OpenAI | AI model inference (GPT) | USA | To be confirmed |
| Render | Cloud hosting and PostgreSQL database | USA | See Render DPA |
| Redis Ltd | In-memory caching (Upstash or Render Redis) | USA/EU | See provider DPA |

## 7. Data Retention

Personal data is retained in accordance with the following schedule:
- Complaint case records and communications: 7 years from case closure (FCA DISP requirement)
- AI action inputs and outputs: 2 years from creation
- Audit log entries: 10 years (immutable by database rule)

Automated archival runs weekly and anonymises records that have exceeded their retention period.

## 8. International Transfers

Where sub-processors are located outside the UK or EEA, the Processor shall ensure appropriate safeguards are in place (standard contractual clauses or adequacy decision).

## 9. Governing Law

This Agreement shall be governed by the laws of England and Wales.

---

*Template version 0.1 — 23 April 2026. Not yet reviewed by legal counsel.*
