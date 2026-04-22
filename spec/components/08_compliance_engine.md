# Component 08: Compliance Engine

## Status
BUILT — code exists, never verified with tests

## Purpose
Provides jurisdiction-specific ruleset data to other engines.
Caches active rulesets in Redis to avoid repeated database calls.
Assesses the impact of regulatory changes on open cases.

## Dependencies
- Database: ruleset, cases tables
- Redis: caches ruleset results (TTL 600 seconds)

## Key Functions

### getActiveRuleset(jurisdiction)
- Queries ruleset table for active rules matching jurisdiction
- Cache key: ruleset:active:{jurisdiction}
- Cache TTL: 600 seconds
- On cache hit: return parsed cached value
- On cache miss: query database, cache, return
- Must invalidate cache when ruleset is updated

### assessRulesetImpact(rulesetId, changeDescription)
- Finds all open cases using the affected ruleset
- Creates a pending ai_action per case with
  action_type=ruleset_impact_assessment
- Returns count of affected cases

## Ruleset Table Structure
Each row represents one rule for one jurisdiction:
- jurisdiction: UK, India, EU
- rule_type: ACKNOWLEDGE, FINAL_RESPONSE, FOS_REFERRAL etc
- threshold_days: integer (e.g. 56 for UK FINAL_RESPONSE)
- description: human-readable rule description
- effective_from, effective_to: date range for the rule

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| COMP-001 | getActiveRuleset returns correct rows for UK | NOT RUN | |
| COMP-002 | getActiveRuleset returns correct rows for India | NOT RUN | |
| COMP-003 | getActiveRuleset returns correct rows for EU | NOT RUN | |
| COMP-004 | Result is cached in Redis after first call | NOT RUN | |
| COMP-005 | Cache is invalidated when ruleset row is updated | NOT RUN | |
| COMP-006 | assessRulesetImpact creates pending ai_action per open case | NOT RUN | |

## Claude Code Prompt
```
Read spec/components/08_compliance_engine.md carefully.

Open api/src/engines/complianceEngine.js and read it fully.

First verify the ruleset table has data:
docker exec -it nuqe-api-1 node -e "
const {Pool} = require('pg');
const p = new Pool({connectionString: process.env.DATABASE_URL});
p.query('SELECT jurisdiction, rule_type, threshold_days FROM ruleset ORDER BY jurisdiction, rule_type').then(r => {console.log(JSON.stringify(r.rows,null,2)); p.end()});
"

Then check:
1. Is Redis caching implemented in getActiveRuleset?
2. Is cache invalidation called when ruleset is updated?
3. Does assessRulesetImpact write to ai_actions?

Fix any missing implementations. Write tests COMP-001 through
COMP-006. Mock Redis for cache tests using jest.mock.

Update test status in this file and spec/test_registry.md.
```
