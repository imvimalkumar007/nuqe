# Component 11: Knowledge Layer

## Status
VERIFIED — all 7 tests passing (23 April 2026)

## Purpose
RAG (Retrieval Augmented Generation) layer. Retrieves relevant
regulatory and product knowledge chunks to enrich AI prompts.
as_at_date filtering ensures historical cases use historically
correct guidance.

## Dependencies
- Database: knowledge_chunks table
- pgvector: NOT enabled on local PG18. Vector search falls back to
  ORDER BY updated_at DESC. Jurisdiction and date filters work in both paths.

## Key Functions

### retrieveContext(query, options)
Options: { jurisdiction, documentType, asAtDate, limit }
- Attempts embedding (requires OPENAI_API_KEY + pgvector)
- Falls back to recency-sorted query when no embedding available
- Returns: [{ id, title, chunk_text, jurisdiction, document_type, source_document, confidence_tier, similarity }]
- CRITICAL: filters by effective_from <= asAtDate AND (effective_to IS NULL OR effective_to > asAtDate)

### enrichPrompt(basePrompt, caseId)
- Reads case.opened_at and jurisdiction from ruleset JOIN
- Calls retrieveContext with jurisdiction and opened_at as asAtDate
- Appends "## Regulatory Context" block to basePrompt
- Labels verified chunks as "### Verified regulatory guidance"
- Labels auto_ingested chunks as "### Pending review — treat as indicative only"

### logRetrieval(actionId, chunkIds)
- Inserts audit_log row: entity_type='ai_action', action='knowledge_retrieval'
- new_value = { chunk_ids: [...] }

## Notes
- audit_log.new_value is json type — pg parses it automatically (no JSON.parse needed)
- pgvector KNOW-001/002/003 work via fallback path despite no vector extension

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| KNOW-001 | retrieveContext returns chunks for UK jurisdiction | PASS | 23 Apr 2026 |
| KNOW-002 | as_at_date filter excludes chunks not yet effective | PASS | 23 Apr 2026 |
| KNOW-003 | as_at_date filter excludes chunks that have expired | PASS | 23 Apr 2026 |
| KNOW-004 | enrichPrompt appends regulatory context block to prompt | PASS | 23 Apr 2026 |
| KNOW-005 | logRetrieval writes chunk IDs to audit_log | PASS | 23 Apr 2026 |
| KNOW-006 | Verified chunks labelled as "Verified regulatory guidance" | PASS | 23 Apr 2026 |
| KNOW-007 | Auto-ingested chunks labelled as "Pending review" | PASS | 23 Apr 2026 |
