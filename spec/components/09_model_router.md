# Component 09: Model Router

## Status
VERIFIED — all 7 tests passing (23 April 2026)

## Purpose
Single interface between all AI engines and all model providers.
Every AI call in the system goes through the model router.
Handles provider selection, A/B routing to challenger models,
PII tokenisation, and returns a standardised response object.

## Dependencies
- Database: organisation_ai_config table
- PII Tokeniser (component 10): called before sending, after receiving
- Environment: ANTHROPIC_API_KEY as fallback

## Key Functions

### complete(prompt, organisationId)
- Loads org config from organisation_ai_config (in-memory cache, 5-min TTL)
- If no org config: falls back to ANTHROPIC_API_KEY env var using claude-sonnet-4-6
- If challenger configured: routes challenger_percentage % of requests to challenger
- Calls piiTokeniser.tokenise(userMessage) before sending (when tokenisation_enabled)
- Sends to selected provider (claude | openai | gemini | custom)
- Calls piiTokeniser.detokenise(response) on result
- Returns: { content, provider, model, tokenisationApplied, lowConfidenceFlags, promptTokens, completionTokens }

### clearOrgConfigCache(organisationId?)
- Removes the cached org config. Pass org ID to clear one entry, omit to clear all.

## Notes
- organisation_ai_config.data_agreement_tier is NOT NULL (required on insert)
- Org config cache key is the organisationId UUID; TTL is 5 minutes
- Challenger routing uses Math.random() * 100 < challenger_percentage

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| ROUTER-001 | Routes to Claude when provider is claude | PASS | 23 Apr 2026 |
| ROUTER-002 | Returns standardised response object with all required fields | PASS | 23 Apr 2026 |
| ROUTER-003 | Calls piiTokeniser.tokenise before sending — PII absent from prompt | PASS | 23 Apr 2026 |
| ROUTER-004 | Calls piiTokeniser.detokenise on response — PII restored in content | PASS | 23 Apr 2026 |
| ROUTER-005 | A/B routing sends to challenger when challenger_percentage = 100 | PASS | 23 Apr 2026 |
| ROUTER-006 | Falls back to ANTHROPIC_API_KEY env var when no org config | PASS | 23 Apr 2026 |
| ROUTER-007 | Org config is cached — DB not re-queried on second call | PASS | 23 Apr 2026 |
