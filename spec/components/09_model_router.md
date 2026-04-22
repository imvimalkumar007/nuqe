# Component 09: Model Router

## Status
BUILT — code exists, never verified with tests

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

### route(prompt, context, options)
- Loads org config from organisation_ai_config (cached in memory, 5min TTL)
- If no org config: falls back to ANTHROPIC_API_KEY env var
- If challenger configured: routes challenger_percentage to challenger
- Calls piiTokeniser.tokenise(prompt) before sending
- Sends to selected provider
- Calls piiTokeniser.detokenise(response) on result
- Returns standardised response: {
    content: string,
    provider: string,
    model: string,
    tokens_used: number,
    response_time_ms: number,
    tokenisation_applied: boolean,
    low_confidence_flags: string[]
  }

## Provider Config Shape (from organisation_ai_config)
- primary_provider: claude | openai | gemini | custom
- primary_model: string
- primary_api_key_encrypted: string
- challenger_provider: string (optional)
- challenger_model: string (optional)
- challenger_api_key_encrypted: string (optional)
- challenger_percentage: integer 0-100

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| ROUTER-001 | Routes to Claude when provider is claude | NOT RUN | Mock Anthropic SDK |
| ROUTER-002 | Returns standardised response object | NOT RUN | |
| ROUTER-003 | Calls piiTokeniser.tokenise before sending | NOT RUN | |
| ROUTER-004 | Calls piiTokeniser.detokenise on response | NOT RUN | |
| ROUTER-005 | A/B routing sends correct percentage to challenger | NOT RUN | |
| ROUTER-006 | Falls back to ANTHROPIC_API_KEY when no org config | NOT RUN | |
| ROUTER-007 | Org config is cached, not re-queried on every call | NOT RUN | |

## Claude Code Prompt
```
Read spec/components/09_model_router.md carefully.
Also read spec/components/10_pii_tokeniser.md.

Open api/src/engines/modelRouter.js and read it fully.

Check:
1. Is the response shape standardised as per the spec?
2. Is PII tokenisation called before AND after?
3. Is org config cached with TTL?
4. Does A/B routing logic exist?

Write tests ROUTER-001 through ROUTER-007 using Jest.
Mock all external API calls (Anthropic SDK, OpenAI SDK).
Mock the database for org config queries.

Update test status in this file and spec/test_registry.md.
```
