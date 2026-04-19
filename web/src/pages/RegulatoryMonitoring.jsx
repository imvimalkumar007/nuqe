import { useState, useEffect, useCallback } from 'react';
import { usePendingActions } from '../context/PendingActionsContext';

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const C = {
  purple:  '#7C3AED',
  surface: '#111318',
  text:    '#E8EAF0',
  muted:   '#6B7280',
  ok:      '#10B981',
  warn:    '#F59E0B',
  danger:  '#EF4444',
  border:  'rgba(255,255,255,0.07)',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function jurisdictionColour(j) {
  if (j === 'UK') return { color: '#818CF8', background: 'rgba(129,140,248,0.12)', border: 'rgba(129,140,248,0.3)' };
  if (j === 'IN') return { color: C.warn,    background: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)' };
  if (j === 'EU') return { color: C.ok,      background: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)' };
  return { color: C.muted, background: 'transparent', border: C.border };
}

// Compute overall health from sources array.
// Returns 'green' | 'amber' | 'red' | 'unknown'
function computeHealth(sources) {
  const active = sources.filter((s) => s.is_active);
  if (!active.length) return 'unknown';

  let maxFactor = 0;
  const now = Date.now();
  for (const s of active) {
    if (!s.last_checked_at) { maxFactor = Math.max(maxFactor, 5); continue; }
    const freqMs  = (s.check_frequency_hours ?? 24) * 3_600_000;
    const elapsed = now - new Date(s.last_checked_at).getTime();
    maxFactor = Math.max(maxFactor, elapsed / freqMs);
  }

  if (maxFactor >= 4) return 'red';
  if (maxFactor >= 2) return 'amber';
  return 'green';
}

const HEALTH_LABEL = { green: 'All systems nominal', amber: 'Some sources overdue', red: 'Sources significantly overdue', unknown: 'No active sources' };
const HEALTH_COLOUR = { green: C.ok, amber: C.warn, red: C.danger, unknown: C.muted };

// ─── Sub-components ───────────────────────────────────────────────────────────

function JurisdictionBadge({ j }) {
  const s = jurisdictionColour(j);
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
      style={{ color: s.color, background: s.background, borderColor: s.border }}>
      {j ?? 'global'}
    </span>
  );
}

function StatusDot({ isActive }) {
  return (
    <span className="inline-block w-2 h-2 rounded-full mr-1.5"
      style={{ background: isActive ? C.ok : C.muted }} />
  );
}

function SectionHeader({ title }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest mb-3"
      style={{ color: C.muted }}>
      {title}
    </p>
  );
}

// Inline knowledge chunk reviewer
function ChunkReviewer({ chunk, onDone }) {
  const { refresh } = usePendingActions();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  async function submit(status) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/knowledge-chunks/${chunk.id}/review`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status, reviewer_id: 'staff-placeholder' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      refresh();
      onDone(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 rounded-md p-3 space-y-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}` }}>
      <p className="text-xs leading-relaxed whitespace-pre-wrap line-clamp-8"
        style={{ color: C.text }}>{chunk.chunk_text}</p>
      {error && (
        <p className="text-xs" style={{ color: C.danger }}>⚠ {error}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => submit('active')}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-md border transition-colors disabled:opacity-40"
          style={{ color: C.ok,     background: 'rgba(16,185,129,0.1)',  borderColor: 'rgba(16,185,129,0.3)' }}>
          {loading ? '…' : 'Approve'}
        </button>
        <button
          onClick={() => submit('archived')}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-md border transition-colors disabled:opacity-40"
          style={{ color: C.danger, background: 'rgba(239,68,68,0.1)',   borderColor: 'rgba(239,68,68,0.3)' }}>
          Reject
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RegulatoryMonitoring() {
  const [sources,           setSources]           = useState([]);
  const [pendingChunks,     setPendingChunks]     = useState([]);
  const [supersededChunks,  setSupersededChunks]  = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState(null);
  const [expandedChunkId,   setExpandedChunkId]   = useState(null);
  const [togglingId,        setTogglingId]        = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [srcRes, pendRes, supRes] = await Promise.all([
        fetch('/api/v1/regulatory/sources'),
        fetch('/api/v1/knowledge-chunks?status=pending_review&limit=20'),
        fetch('/api/v1/knowledge-chunks?status=superseded&days=30&limit=20'),
      ]);
      if (!srcRes.ok)  throw new Error(`Sources: HTTP ${srcRes.status}`);
      if (!pendRes.ok) throw new Error(`Chunks: HTTP ${pendRes.status}`);

      setSources(await srcRes.json());
      setPendingChunks(await pendRes.json());
      setSupersededChunks(supRes.ok ? await supRes.json() : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleSource(source) {
    setTogglingId(source.id);
    try {
      const res = await fetch(`/api/v1/regulatory/sources/${source.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ is_active: !source.is_active }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setSources((prev) => prev.map((s) => (s.id === source.id ? { ...s, ...updated } : s)));
    } catch (err) {
      console.error('toggle failed:', err.message);
    } finally {
      setTogglingId(null);
    }
  }

  async function triggerCheck(source) {
    await fetch(`/api/v1/regulatory/sources/${source.id}/check`, { method: 'POST' });
  }

  const health = computeHealth(sources);
  const healthColor = HEALTH_COLOUR[health];

  if (loading) return (
    <div className="p-6 space-y-4 animate-pulse">
      {[0,1,2].map((i) => <div key={i} className="h-24 rounded-lg" style={{ background: C.surface }} />)}
    </div>
  );

  return (
    <div className="p-6 space-y-5 min-h-full">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: C.text }}>Regulatory Monitoring</h1>
          <p className="text-xs mt-0.5" style={{ color: C.muted }}>
            Automated source monitoring · knowledge base currency
          </p>
        </div>

        {/* Health indicator */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <span className="w-2 h-2 rounded-full" style={{ background: healthColor }} />
          <span className="text-xs font-medium" style={{ color: healthColor }}>
            {HEALTH_LABEL[health]}
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg p-4 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: C.danger }}>
          {error}
        </div>
      )}

      {/* ── Sources table ─────────────────────────────────────────────────────── */}
      <div className="rounded-lg overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div className="px-5 pt-5 pb-3">
          <SectionHeader title="Configured Sources" />
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Source', 'Jurisdiction', 'Type', 'Last checked', 'This month', 'Status', ''].map((h) => (
                <th key={h} className="px-5 py-2 text-left font-medium" style={{ color: C.muted }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((src) => {
              const overdueMs  = (src.check_frequency_hours ?? 24) * 3_600_000;
              const elapsedMs  = src.last_checked_at ? Date.now() - new Date(src.last_checked_at).getTime() : Infinity;
              const overdueX   = elapsedMs / overdueMs;
              const rowColour  = overdueX >= 4 ? C.danger : overdueX >= 2 ? C.warn : C.text;

              return (
                <tr key={src.id} style={{ borderBottom: `1px solid ${C.border}` }}
                  className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3 font-medium" style={{ color: C.text }}>
                    <div className="flex items-center">
                      <StatusDot isActive={src.is_active} />
                      {src.name}
                    </div>
                    {src.last_check_error && (
                      <p className="text-[10px] mt-0.5 truncate max-w-[200px]" style={{ color: C.danger }}>
                        {src.last_check_error}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3"><JurisdictionBadge j={src.jurisdiction} /></td>
                  <td className="px-5 py-3 font-mono uppercase" style={{ color: C.muted }}>{src.source_type}</td>
                  <td className="px-5 py-3" style={{ color: rowColour }}>
                    {relativeTime(src.last_checked_at)}
                    <span className="ml-1 text-[10px]" style={{ color: C.muted }}>
                      (every {src.check_frequency_hours}h)
                    </span>
                  </td>
                  <td className="px-5 py-3" style={{ color: C.text }}>
                    {src.ingested_this_month ?? 0}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleSource(src)}
                      disabled={togglingId === src.id}
                      className="text-[10px] px-2 py-0.5 rounded-full border transition-colors disabled:opacity-40"
                      style={src.is_active
                        ? { color: C.ok,   background: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)' }
                        : { color: C.muted, background: 'transparent',         borderColor: C.border }}>
                      {src.is_active ? 'Active' : 'Paused'}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => triggerCheck(src)}
                      className="text-[10px] px-2 py-0.5 rounded-md border transition-colors"
                      style={{ color: C.muted, borderColor: C.border }}
                      title="Trigger immediate check">
                      Check now
                    </button>
                  </td>
                </tr>
              );
            })}
            {sources.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-xs" style={{ color: C.muted }}>No sources configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Bottom panels ─────────────────────────────────────────────────────── */}
      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(460px,1fr))' }}>

        {/* Recent Ingestions */}
        <div className="rounded-lg p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <SectionHeader title={`Recent Ingestions Awaiting Review (${pendingChunks.length})`} />

          {pendingChunks.length === 0 ? (
            <p className="text-xs py-8 text-center" style={{ color: C.muted }}>No pending chunks — knowledge base is current.</p>
          ) : (
            <div className="space-y-3">
              {pendingChunks.map((chunk) => (
                <div key={chunk.id} className="rounded-md p-3"
                  style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: C.text }}>{chunk.title}</p>
                      <p className="text-[10px] mt-0.5 truncate" style={{ color: C.muted }}>
                        {chunk.source_name ?? chunk.source_document}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <JurisdictionBadge j={chunk.jurisdiction} />
                      <button
                        onClick={() => setExpandedChunkId((id) => id === chunk.id ? null : chunk.id)}
                        className="text-[10px] px-2 py-0.5 rounded-md border transition-colors"
                        style={{ color: C.purple, borderColor: 'rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.1)' }}>
                        {expandedChunkId === chunk.id ? 'Collapse' : 'Review'}
                      </button>
                    </div>
                  </div>

                  <p className="text-[10px] mt-1" style={{ color: C.muted }}>
                    {relativeTime(chunk.created_at)}
                  </p>

                  {expandedChunkId === chunk.id && (
                    <ChunkReviewer
                      chunk={chunk}
                      onDone={() => {
                        setExpandedChunkId(null);
                        setPendingChunks((prev) => prev.filter((c) => c.id !== chunk.id));
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Superseded Chunks */}
        <div className="rounded-lg p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <SectionHeader title="Superseded Chunks (last 30 days)" />

          {supersededChunks.length === 0 ? (
            <p className="text-xs py-8 text-center" style={{ color: C.muted }}>No chunks superseded in the last 30 days.</p>
          ) : (
            <div className="space-y-3">
              {supersededChunks.map((chunk) => (
                <div key={chunk.id} className="rounded-md p-3"
                  style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, opacity: 0.7 }}>
                  <div className="flex items-start gap-2">
                    <JurisdictionBadge j={chunk.jurisdiction} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate" style={{ color: C.text }}>{chunk.title}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>
                        {chunk.source_document}
                      </p>
                      {chunk.superseded_by_title && (
                        <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: C.warn }}>
                          <span>→</span>
                          <span className="truncate">Replaced by: {chunk.superseded_by_title}</span>
                        </p>
                      )}
                      <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>
                        Superseded {relativeTime(chunk.effective_to)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
