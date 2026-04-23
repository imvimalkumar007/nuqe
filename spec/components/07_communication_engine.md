# Component 07: Communication Engine

## Status
VERIFIED — all 8 tests passing (23 April 2026)

## Purpose
Ingests inbound communications, classifies them (complaint vs query
vs general), drafts AI responses, and manages the human review gate.
Every AI output is written to ai_actions with status pending before
any human interaction occurs. Nothing is ever sent without approval.

## Dependencies
- Database: communications, cases, customers, ai_actions, audit_log
- Model Router (component 09): all AI calls route through here
- PII Tokeniser (component 10): called before every AI call
- Cases API (component 03): opens new cases on complaint detection

## Key Functions

### ingestCommunication(payload)
- Creates a row in communications table
- Calls classifyCommunication on the new communication
- Returns the created communication and any opened case

### classifyCommunication(communicationId)
- Retrieves communication and customer context
- Calls PII tokeniser on the communication body
- Calls model router with classification prompt
- Writes result to ai_actions with action_type=complaint_classification,
  status=pending
- If classification is complaint or implicit_complaint and no case
  exists: calls cases API to open a new case
- Never modifies the communications table directly

### draftResponse(caseId, instructionNotes?)
- Retrieves case, customer, and communication history
- Calls knowledge layer to retrieve context (as_at_date = case.opened_at)
- Calls PII tokeniser on the full prompt
- Calls model router with response draft prompt
- Writes result to ai_actions with action_type=response_draft, status=pending
- Does NOT write to communications table (human approval does that)

## Human Review Gate
This is non-negotiable. No AI output reaches a customer without
going through PATCH /api/v1/ai-actions/:id/review with status=approved.
Only on approval does the communication row get created.

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| CENG-001 | ingestCommunication creates communications row | PASS | 23 Apr 2026 |
| CENG-002 | classifyCommunication writes pending ai_action | PASS | 23 Apr 2026 |
| CENG-003 | classifyCommunication opens new case when complaint detected | PASS | 23 Apr 2026 |
| CENG-004 | classifyCommunication detects implicit complaint | PASS | 23 Apr 2026 |
| CENG-005 | draftResponse writes pending ai_action | PASS | 23 Apr 2026 |
| CENG-006 | draftResponse does NOT write to communications table | PASS | 23 Apr 2026 |
| CENG-007 | Approving response_draft creates communications row | PASS | 23 Apr 2026 |
| CENG-008 | All AI outputs write to audit_log | PASS | 23 Apr 2026 |

## Claude Code Prompt
```
Read spec/components/07_communication_engine.md carefully.
Also read spec/components/09_model_router.md and
spec/components/10_pii_tokeniser.md for context.

Open api/src/engines/communicationEngine.js and read it fully.
Report:
1. Does classifyCommunication call the PII tokeniser?
2. Does draftResponse call the knowledge layer?
3. Does every function write to audit_log?
4. Is the human review gate enforced (no direct writes to
   communications from AI functions)?

Fix any violations of the spec. Then write tests CENG-001
through CENG-008 using Jest with mocked model router calls.

Run tests and fix failures before finishing.
Update test status in this file and spec/test_registry.md.
```
