# Component 12: Regulatory Monitor

## Status
VERIFIED — all 6 tests passing (23 April 2026)

## Purpose
Monitors official regulatory sources (RSS feeds and web scraping).
When new documents are detected, ingests them into the knowledge layer
as pending_review chunks. Notifies compliance reviewers. Propagates
approved changes to affected open cases.

## Dependencies
- Database: regulatory_sources, regulatory_monitoring_log, notifications
- Knowledge Layer (component 11): for document ingestion
- BullMQ/Redis: separate queues per jurisdiction

## Configured Sources (5)
| Source | Jurisdiction | Method | Frequency |
|---|---|---|---|
| FCA news RSS | UK | RSS | 12 hours |
| FCA publications RSS | UK | RSS | 24 hours |
| FOS decisions | UK | Scrape | 24 hours |
| RBI press releases | India | Scrape | 24 hours |
| EBA publications | EU | Scrape | 24 hours |

## Key Functions

### checkSources()
- Fetches each configured source
- Compares with last known state
- For new documents: calls ingestDocument and creates notification
- Inserts monitoring_log row with result
- Updates last_checked_at on source

### getMonitoringHealth()
- Returns health status per source based on last_checked_at
- ok: checked within check_frequency_hours
- amber: overdue up to 2x frequency
- red: overdue more than 2x frequency

### propagateKnowledgeUpdate(chunkId)
- Called when a chunk is approved (status set to active)
- Runs similarity search against existing active chunks
- Supersedes chunks with cosine similarity > 0.85
- Creates pending ai_action for all open cases affected by superseded chunks

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| RMON-001 | getMonitoringHealth returns object for each source | PASS | 23 Apr 2026 |
| RMON-002 | Health is ok when checked within frequency | PASS | 23 Apr 2026 |
| RMON-003 | Health is amber when overdue up to 2x frequency | PASS | 23 Apr 2026 |
| RMON-004 | Health is red when overdue more than 2x frequency | PASS | 23 Apr 2026 |
| RMON-005 | propagateKnowledgeUpdate supersedes similar chunks | PASS | 23 Apr 2026; pg_trgm fallback |
| RMON-006 | propagateKnowledgeUpdate creates ai_action for affected cases | PASS | 23 Apr 2026 |

## Claude Code Prompt
```
Read spec/components/12_regulatory_monitor.md carefully.

Open api/src/engines/regulatoryMonitor.js and read it fully.

Write tests RMON-001 through RMON-004 using Jest.
These tests do not need pgvector or external HTTP calls.
Mock all external fetches. Mock the database.

Skip RMON-005 until pgvector is confirmed enabled.

Write RMON-006 with mocked similarity search return values.

Run all tests. Fix failures.
Update test status in this file and spec/test_registry.md.
```
