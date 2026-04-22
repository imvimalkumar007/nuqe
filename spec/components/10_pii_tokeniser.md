# Component 10: PII Tokeniser

## Purpose
Replaces sensitive data with typed tokens before any text is sent to
an external AI provider. Restores original values on the way back.
Four layers of detection. Token format: [TYPE-INDEX] e.g. [NAME-1].

## Status
BUILT — code exists, never verified with tests

## Dependencies
- Database: tokeniser_additions table (Layer 4 — MISSING from schema)
- compromise.js: NLP library for Layer 3

## Four Layers

### Layer 1: Regex
Detects: email, UK phone, postcode, sort code, account number,
card number, NI number, loan ref (NQ-YYYY-NNNN), monetary amounts

### Layer 2: Domain vocabulary
Detects: UK debt charities (StepChange, National Debtline, PayPlan),
benefit types (Universal Credit, PIP, ESA, JSA, DLA), financial
difficulty terms (IVA, CCJ, DMP, bankruptcy, DRO), vulnerability
keywords (bereavement, mental health, domestic abuse), external orgs
(FOS, ICO, Citizens Advice)

### Layer 3: NLP (compromise.js)
Detects: person names, organisations, locations not caught by Layer 1.
Confidence threshold: 0.8. Below 0.8: tokenise conservatively and
flag as low_confidence in audit.

### Layer 4: Adaptive (from tokeniser_additions table)
Organisation-scoped custom patterns added by human specialists.
Cached per organisation. Refreshed when table is updated.
NOTE: tokeniser_additions table is currently missing from schema.

## Key Functions

### tokenise(text, organisationId)
Returns: { tokenised: string, tokenMap: Map, lowConfidenceFlags: string[] }

### detokenise(text, tokenMap)
Returns: string with all [TYPE-INDEX] tokens replaced with original values

### auditTokenisation(caseId, tokenMap, lowConfidenceFlags)
Writes tokenisation audit record to audit_log

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| PII-001 | Layer 1 replaces email addresses | NOT RUN | |
| PII-002 | Layer 1 replaces UK phone numbers | NOT RUN | |
| PII-003 | Layer 1 replaces loan refs (NQ-YYYY-NNNN) | NOT RUN | |
| PII-004 | Layer 2 replaces StepChange with [DEBTORG-1] | NOT RUN | |
| PII-005 | Layer 2 replaces mental health with [VULNERABILITY-1] | NOT RUN | |
| PII-006 | Layer 3 detects person names | NOT RUN | |
| PII-007 | detokenise restores all original values correctly | NOT RUN | |
| PII-008 | Low confidence detections are flagged in return value | NOT RUN | |

## Claude Code Prompt
```
Read spec/components/10_pii_tokeniser.md carefully.

Open api/src/engines/piiTokeniser.js and read it fully.

Note: the tokeniser_additions table is missing from the database.
Do NOT try to query it yet. Skip Layer 4 tests for now and mark
them as SKIPPED with reason "tokeniser_additions table missing".

Write tests PII-001 through PII-008 in
api/src/engines/piiTokeniser.test.js using Jest.
These are pure unit tests with no database dependency.
Test each layer with realistic input strings.

Run all tests. Fix any failures.
Update test status in this file and spec/test_registry.md.
```
