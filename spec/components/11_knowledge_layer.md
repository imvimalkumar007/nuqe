# Component 11: Knowledge Layer

## Status
BUILT — code exists, never verified. Depends on pgvector.

## Purpose
RAG (Retrieval Augmented Generation) layer. Retrieves relevant
regulatory and product knowledge chunks to enrich AI prompts.
as_at_date filtering ensures historical cases use historically
correct guidance.

## Dependencies
- Database: knowledge_chunks, knowledge_documents tables
- Model Router: for embedding generation
- pgvector extension: for cosine similarity search

## Key Functions

### retrieveContext(query, options)
Options: { jurisdiction, organisationId, as_at_date, topK, namespace }
- Generates embedding for query using model router
- Queries knowledge_chunks using cosine similarity (ivfflat index)
- Filters by: jurisdiction, organisation_id, namespace
- CRITICAL: filters by effective_from <= as_at_date AND
  (effective_to IS NULL OR effective_to >= as_at_date)
- Returns topK chunks ordered by similarity score

### enrichPrompt(basePrompt, caseId)
- Reads case.opened_at as the as_at_date
- Calls retrieveContext with case jurisdiction and opened_at
- Appends chunks to prompt as structured context block
- Labels chunks as "Verified regulatory guidance" or
  "Pending review - treat as indicative only"

### ingestDocument(document, metadata)
- Splits document into chunks
- Generates embeddings for each chunk
- Inserts into knowledge_chunks with effective_from = today
- Creates knowledge_documents row for tracking

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| KNOW-001 | retrieveContext returns chunks for UK jurisdiction | NOT RUN | Needs pgvector |
| KNOW-002 | as_at_date filter excludes chunks not yet effective | NOT RUN | |
| KNOW-003 | as_at_date filter excludes chunks that have expired | NOT RUN | |
| KNOW-004 | enrichPrompt appends context block to prompt | NOT RUN | |
| KNOW-005 | logRetrieval writes chunk IDs to audit_log | NOT RUN | |
| KNOW-006 | Verified chunks labelled correctly in prompt | NOT RUN | |
| KNOW-007 | Auto-ingested chunks labelled as pending review | NOT RUN | |

## Claude Code Prompt
```
Read spec/components/11_knowledge_layer.md carefully.

First check if pgvector extension is enabled:
docker exec -it nuqe-api-1 node -e "
const {Pool} = require('pg');
const p = new Pool({connectionString: process.env.DATABASE_URL});
p.query('SELECT extname FROM pg_extension WHERE extname = \'vector\'').then(r => {console.log('pgvector:', r.rows.length > 0 ? 'ENABLED' : 'NOT ENABLED'); p.end()});
"

Then check if knowledge_chunks table has the vector column:
docker exec -it nuqe-api-1 node -e "
const {Pool} = require('pg');
const p = new Pool({connectionString: process.env.DATABASE_URL});
p.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \'knowledge_chunks\' ORDER BY ordinal_position').then(r => {console.log(JSON.stringify(r.rows,null,2)); p.end()});
"

Report findings. If pgvector is not enabled, note this as a
blocker for KNOW-001 through KNOW-003 (mark as SKIPPED).

Write tests KNOW-004 through KNOW-007 which do not need pgvector.
Mock the database and model router calls.

Update test status in this file and spec/test_registry.md.
```
