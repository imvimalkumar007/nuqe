import { jest } from '@jest/globals';

jest.unstable_mockModule('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: jest.fn().mockResolvedValue({
        content: [{ text: '{"summary":"test impact","risk_level":"low","recommended_action":"Review."}' }],
      }),
    };
  },
}));

let pool, getMonitoringHealth, propagateKnowledgeUpdate;

const insertedSourceIds = [];
const testChunkIds = [];
let propagateResult;
let propagateCalledAt;

beforeAll(async () => {
  ({ pool } = await import('../db/pool.js'));
  ({ getMonitoringHealth, propagateKnowledgeUpdate } = await import('./regulatoryMonitor.js'));

  // RMON-002: checked NOW() → elapsed ≈ 0h → health 'ok'
  const { rows: s2 } = await pool.query(
    `INSERT INTO regulatory_sources
       (name, jurisdiction, source_type, url, document_type, check_frequency_hours, is_active)
     VALUES ('RMON-002 Test Source', 'UK', 'rss', 'https://rmon-002.test.example.com/rss', 'guidance', 24, TRUE)
     RETURNING id`
  );
  insertedSourceIds.push(s2[0].id);
  await pool.query(
    `INSERT INTO regulatory_monitoring_log (source_id, checked_at, documents_found, documents_ingested)
     VALUES ($1, NOW(), 0, 0)`,
    [s2[0].id]
  );

  // RMON-003: checked 36h ago (1.5× freq of 24h = between 1.2× and 2× window) → health 'amber'
  const { rows: s3 } = await pool.query(
    `INSERT INTO regulatory_sources
       (name, jurisdiction, source_type, url, document_type, check_frequency_hours, is_active)
     VALUES ('RMON-003 Test Source', 'UK', 'rss', 'https://rmon-003.test.example.com/rss', 'guidance', 24, TRUE)
     RETURNING id`
  );
  insertedSourceIds.push(s3[0].id);
  await pool.query(
    `INSERT INTO regulatory_monitoring_log (source_id, checked_at, documents_found, documents_ingested)
     VALUES ($1, NOW() - INTERVAL '36 hours', 0, 0)`,
    [s3[0].id]
  );

  // RMON-004: never checked (no monitoring_log row) → health 'red'
  const { rows: s4 } = await pool.query(
    `INSERT INTO regulatory_sources
       (name, jurisdiction, source_type, url, document_type, check_frequency_hours, is_active)
     VALUES ('RMON-004 Test Source', 'UK', 'rss', 'https://rmon-004.test.example.com/rss', 'guidance', 24, TRUE)
     RETURNING id`
  );
  insertedSourceIds.push(s4[0].id);

  // RMON-005/006: two knowledge chunks with similar text for pg_trgm propagation
  const oldText = 'Regulatory guidance on UK FCA complaints handling. Financial services firms must have adequate written procedures for responding to eligible complainants. Complaints must be resolved within eight weeks of receipt.';
  const newText = `${oldText} Updated 2026: enhanced requirements for vulnerable customers now apply to all complaint categories.`;

  const { rows: oldRows } = await pool.query(
    `INSERT INTO knowledge_chunks
       (namespace, jurisdiction, document_type, source_document, title,
        chunk_text, confidence_tier, status, token_count, effective_from)
     VALUES ('regulatory','UK','guidance','test://rmon-old-chunk','RMON Old Guidance Chunk',
             $1,'verified','active',60,'2024-01-01')
     RETURNING id`,
    [oldText]
  );
  testChunkIds.push(oldRows[0].id); // [0] = old chunk, expected to be superseded

  const { rows: newRows } = await pool.query(
    `INSERT INTO knowledge_chunks
       (namespace, jurisdiction, document_type, source_document, title,
        chunk_text, confidence_tier, status, token_count, effective_from)
     VALUES ('regulatory','UK','guidance','test://rmon-new-chunk','RMON New Guidance Chunk',
             $1,'verified','active',70,'2026-01-01')
     RETURNING id`,
    [newText]
  );
  testChunkIds.push(newRows[0].id); // [1] = new chunk, passed to propagateKnowledgeUpdate

  propagateCalledAt = new Date();
  propagateResult = await propagateKnowledgeUpdate(testChunkIds[1]);
}, 30_000);

afterAll(async () => {
  for (const id of insertedSourceIds) {
    await pool.query('DELETE FROM regulatory_monitoring_log WHERE source_id = $1', [id]);
    await pool.query('DELETE FROM regulatory_sources WHERE id = $1', [id]);
  }

  if (testChunkIds.length) {
    if (propagateCalledAt) {
      await pool.query(
        `DELETE FROM ai_actions WHERE action_type='ruleset_impact_assessment' AND created_at >= $1`,
        [propagateCalledAt]
      );
      await pool.query(
        `DELETE FROM audit_log WHERE action='knowledge_superseded' AND ts >= $1`,
        [propagateCalledAt]
      );
      await pool.query(
        `DELETE FROM audit_log WHERE entity_type='knowledge_chunk' AND entity_id = ANY($1)`,
        [testChunkIds]
      );
    }
    await pool.query(
      `UPDATE knowledge_chunks SET superseded_by = NULL WHERE superseded_by = ANY($1)`,
      [testChunkIds]
    );
    await pool.query('DELETE FROM knowledge_chunks WHERE id = ANY($1)', [testChunkIds]);
  }
});

// ─── RMON-001 ─────────────────────────────────────────────────────────────────

test('RMON-001: getMonitoringHealth returns object for each active source', async () => {
  const health = await getMonitoringHealth();

  expect(Array.isArray(health)).toBe(true);
  expect(health.length).toBeGreaterThan(0);

  for (const h of health) {
    expect(h).toHaveProperty('id');
    expect(h).toHaveProperty('name');
    expect(h).toHaveProperty('jurisdiction');
    expect(h).toHaveProperty('health_status');
    expect(h).toHaveProperty('hours_since_check');
    expect(['ok', 'amber', 'red']).toContain(h.health_status);
  }
});

// ─── RMON-002 ─────────────────────────────────────────────────────────────────

test('RMON-002: health is ok when checked within frequency window', async () => {
  const health = await getMonitoringHealth();
  const source = health.find((h) => h.id === insertedSourceIds[0]);

  expect(source).toBeDefined();
  expect(source.health_status).toBe('ok');
  expect(source.hours_since_check).toBeDefined();
});

// ─── RMON-003 ─────────────────────────────────────────────────────────────────

test('RMON-003: health is amber when overdue by up to 2x frequency', async () => {
  const health = await getMonitoringHealth();
  const source = health.find((h) => h.id === insertedSourceIds[1]);

  expect(source).toBeDefined();
  expect(source.health_status).toBe('amber');
  // 36h elapsed, 24h freq → hours_since_check ≈ 36
  expect(source.hours_since_check).toBeGreaterThan(28);
  expect(source.hours_since_check).toBeLessThan(48);
});

// ─── RMON-004 ─────────────────────────────────────────────────────────────────

test('RMON-004: health is red when source has never been checked', async () => {
  const health = await getMonitoringHealth();
  const source = health.find((h) => h.id === insertedSourceIds[2]);

  expect(source).toBeDefined();
  expect(source.health_status).toBe('red');
  expect(source.hours_since_check).toBeNull();
});

// ─── RMON-005 ─────────────────────────────────────────────────────────────────

test('RMON-005: propagateKnowledgeUpdate marks similar chunks as superseded', async () => {
  const { rows } = await pool.query(
    'SELECT status, superseded_by FROM knowledge_chunks WHERE id = $1',
    [testChunkIds[0]]
  );

  expect(rows[0].status).toBe('superseded');
  expect(rows[0].superseded_by).toBe(testChunkIds[1]);
  expect(propagateResult.superseded).toContain(testChunkIds[0]);
});

// ─── RMON-006 ─────────────────────────────────────────────────────────────────

test('RMON-006: propagateKnowledgeUpdate creates ai_action for affected open cases', async () => {
  const { rows } = await pool.query(
    `SELECT id, case_id, action_type, status FROM ai_actions
     WHERE action_type = 'ruleset_impact_assessment' AND created_at >= $1`,
    [propagateCalledAt]
  );

  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((r) => r.status === 'pending')).toBe(true);
  expect(propagateResult.affectedCases.length).toBe(rows.length);
});
