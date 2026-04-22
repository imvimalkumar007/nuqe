# Component 14: Settings API

## Status
NOT BUILT — endpoints referenced by frontend do not exist

## Purpose
Allows organisations to configure their AI provider, model, and API
credentials. Settings are encrypted before storage. The connection
test endpoint verifies credentials are valid without saving them.

## Dependencies
- Database: organisation_ai_config table
- Auth: all endpoints require valid JWT with admin role
- Model Router (component 09): used for connection test

## Endpoints

### GET /api/v1/settings/ai-config
Response: organisation_ai_config row with:
- api keys masked: show only last 4 chars as "****XXXX"
- If no row exists: return default empty config object (not 404)

Default empty config:
{
  primary_provider: null,
  primary_model: null,
  primary_api_key_encrypted: null,
  challenger_provider: null,
  challenger_model: null,
  challenger_percentage: 0,
  tokenisation_enabled: true,
  data_agreement_tier: 'standard'
}

### POST /api/v1/settings/ai-config
Body: full config object
- Encrypt api key fields using AES-256-GCM before storing
- Encryption key: use JWT_SECRET for now (comment: move to KMS)
- Upsert into organisation_ai_config using req.user.organisation_id
- Clear org config memory cache after saving
- Write to audit_log
- Return saved config with masked keys

### POST /api/v1/settings/ai-config/test
Body: { provider, model, api_key }
- Do NOT save to database
- Make minimal API call: prompt "Respond with the single word OK"
- Return: { success: boolean, provider, model, response_time_ms, error? }

### GET /api/v1/settings/tokeniser-additions
Returns all rows from tokeniser_additions for this organisation
NOTE: requires tokeniser_additions table to exist (currently missing)

### POST /api/v1/settings/tokeniser-additions
Creates new tokeniser addition for this organisation
NOTE: requires tokeniser_additions table to exist

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| SET-001 | GET /settings/ai-config returns 200 | NOT RUN | |
| SET-002 | API key shown as ****XXXX (last 4 chars only) | NOT RUN | |
| SET-003 | Returns default empty config when no row exists | NOT RUN | |
| SET-004 | POST /settings/ai-config saves and encrypts key | NOT RUN | |
| SET-005 | POST /settings/ai-config writes to audit_log | NOT RUN | |
| SET-006 | POST /settings/ai-config/test returns response_time_ms | NOT RUN | Mock provider |
| SET-007 | POST /settings/ai-config/test returns error on bad key | NOT RUN | Mock provider |

## Claude Code Prompt
```
Read spec/components/14_settings_api.md carefully.

First check what exists in api/src/routes/settings.js.
Report which endpoints are implemented and which are missing.

Then build the missing endpoints following the spec exactly.
Pay attention to:
1. API key masking (GET must never return full key)
2. AES-256-GCM encryption before saving (POST)
3. Calling clearOrgConfigCache after saving (from model router)
4. Default empty config when no row exists (GET)

Write tests SET-001 through SET-007.
Mock the model router calls for connection test.
Mock the database for all other tests.

Run all tests. Fix failures.
Update test status in this file and spec/test_registry.md.
```
