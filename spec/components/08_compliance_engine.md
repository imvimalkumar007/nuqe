# Component 08: Compliance Engine

## Status
VERIFIED — all 6 tests passing (23 April 2026)

## Purpose
Provides jurisdiction-specific ruleset data to other engines.
Caches active rulesets in Redis to avoid repeated database calls.
Assesses the impact of regulatory changes on open cases.

## Dependencies
- Database: ruleset, cases, ai_actions tables
- Redis: caches ruleset results (TTL 600 seconds) at key `ruleset:active:{jurisdiction}`

## Key Functions

### getActiveRuleset(jurisdiction)
- Queries ruleset table for active rules matching jurisdiction
- Cache key: `ruleset:active:{jurisdiction}` (TTL 600s)
- On cache hit: return parsed cached value
- On cache miss: query database, cache result, return

### invalidateRulesetCache(jurisdiction)
- Deletes the Redis cache key for the jurisdiction
- Call whenever a ruleset row is updated or activated

### assessRulesetImpact(newRulesetVersion, jurisdiction)
- Diffs current active version against newRulesetVersion
- Finds open cases whose unmet deadlines touch the changed rule types
- Creates a pending ai_action per affected case (action_type=ruleset_impact_assessment)
- Calls Claude to generate impact summary (mocked in tests)
- Bug fixed: removed DISTINCT from json_agg SELECT — json type has no equality operator

## Notes
- Redis is running locally at localhost:6379 (same Redis used by BullMQ queues)
- `assessRulesetImpact` gracefully skips knowledgeLayer on error (no pgvector)
- New ruleset version rows must exist in ruleset table before calling assessRulesetImpact

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| COMP-001 | getActiveRuleset returns correct rows for UK | PASS | 23 Apr 2026 |
| COMP-002 | getActiveRuleset returns correct rows for India | PASS | 23 Apr 2026 |
| COMP-003 | getActiveRuleset returns correct rows for EU | PASS | 23 Apr 2026 |
| COMP-004 | Result is cached in Redis after first call | PASS | 23 Apr 2026 |
| COMP-005 | Cache is invalidated when invalidateRulesetCache is called | PASS | 23 Apr 2026 |
| COMP-006 | assessRulesetImpact creates pending ai_action per open affected case | PASS | 23 Apr 2026 |
