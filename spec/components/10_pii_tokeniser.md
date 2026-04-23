# Component 10: PII Tokeniser

## Purpose
Replaces sensitive data with typed tokens before any text is sent to
an external AI provider. Restores original values on the way back.
Four layers of detection. Token format: [TYPE-INDEX] e.g. [NAME-1].

## Status
VERIFIED — all 8 tests passing (23 April 2026)

## Dependencies
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

### Layer 4: Adaptive fallback (title-case regex)
Two-word title-case pattern without a title prefix. Confidence 0.72
so every match increments lowConfidenceFlags.
NOTE: tokeniser_additions table (DB-backed Layer 4 patterns) is
currently missing from schema — not implemented.

## Key Functions

### tokenise(text)
Returns: { tokenisedText: string, tokenMap: object, lowConfidenceFlags: number }

### detokenise(text, tokenMap)
Returns: string with all [TYPE-INDEX] tokens replaced with original values

### auditTokenisation(actionId, tokenMap, lowConfidenceFlags)
Writes tokenisation type summary to audit_log (no raw PII values stored)

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| PII-001 | Layer 1 replaces email addresses | PASS | 23 Apr 2026 |
| PII-002 | Layer 1 replaces UK phone numbers | PASS | 23 Apr 2026 |
| PII-003 | Layer 1 replaces loan refs (NQ-YYYY-NNNN) | PASS | 23 Apr 2026 |
| PII-004 | Layer 2 replaces StepChange with DEBTORG token | PASS | 23 Apr 2026 |
| PII-005 | Layer 2 replaces mental health with VULNERABILITY token | PASS | 23 Apr 2026 |
| PII-006 | Person name without title prefix is tokenised (L3/L4) | PASS | 23 Apr 2026 |
| PII-007 | detokenise restores all original values correctly | PASS | 23 Apr 2026 |
| PII-008 | Low confidence detections reflected in lowConfidenceFlags | PASS | 23 Apr 2026 |
