import { useCallback, useEffect, useRef, useState } from 'react';
import { usePendingActions } from '../context/PendingActionsContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function HealthDot({ status }) {
  const colour =
    status === 'ok' ? 'bg-emerald-400'
    : status === 'amber' ? 'bg-amber-400'
    : 'bg-red-400';
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${colour}`} />;
}

function Badge({ children, colour = 'gray' }) {
  const map = {
    gray:   'bg-white/5 text-nuqe-muted',
    amber:  'bg-amber-500/15 text-amber-400 border border-amber-500/25',
    red:    'bg-red-500/15 text-red-400 border border-red-500/25',
    green:  'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
    purple: 'bg-nuqe-purple/15 text-nuqe-purple border border-nuqe-purple/25',
    blue:   'bg-blue-500/15 text-blue-400 border border-blue-500/25',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${map[colour] ?? map.gray}`}>
      {children}
    </span>
  );
}

// ─── Review modal ─────────────────────────────────────────────────────────────

function ReviewModal({ chunk, onClose, onDone }) {
  const [submitting, setSubmitting] = useState(false);

  async function handleDecision(decision) {
    setSubmitting(true);
    try {
      await fetch(`/api/v1/knowledge-chunks/${chunk.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: decision === 'approve' ? 'active' : 'archived' }),
      });
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-nuqe-surface border border-white/10 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/5">
          <div>
            <p className="text-sm font-semibold text-nuqe-text">{chunk.title}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge colour="gray">{chunk.jurisdiction ?? 'global'}</Badge>
              <Badge colour="gray">{chunk.document_type}</Badge>
              {chunk.source_name && <Badge colour="blue">{chunk.source_name}</Badge>}
            </div>
          </div>
          <button onClick={onClose} className="text-nuqe-muted hover:text-nuqe-text ml-4 shrink-0">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs text-nuqe-muted mb-1 uppercase tracking-widest">Chunk text</p>
          <pre className="text-xs text-nuqe-text whitespace-pre-wrap leading-relaxed font-sans">
            {chunk.chunk_text}
          </pre>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-white/5">
          <button
            onClick={() => handleDecision('reject')}
            disabled={submitting}
            className="px-4 py-1.5 rounded-md text-sm bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40"
          >
            Reject
          </button>
          <button
            onClick={() => handleDecision('approve')}
            disabled={submitting}
            className="px-4 py-1.5 rounded-md text-sm bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panel wrapper ────────────────────────────────────────────────────────────

function Panel({ title, count, children }) {
  return (
    <div className="bg-nuqe-surface border border-white/5 rounded-xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <p className="text-xs font-semibold uppercase tracking-widest text-nuqe-muted">{title}</p>
        {count != null && (
          <span className="text-[10px] tabular-nums bg-white/5 text-nuqe-muted rounded px-1.5 py-0.5">
            {count}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegulatoryMonitoring() {
  const { refresh: refreshPending } = usePendingActions();

  const [sources,       setSources]      = useState([]);
  const [pendingChunks, setPendingChunks] = useState([]);
  const [recentChanges, setRecentChanges] = useState([]);
  const [health,        setHealth]       = useState([]);
  const [reviewTarget,  setReviewTarget] = useState(null);
  const [loading,       setLoading]      = useState(true);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const [sRes, cRes, rRes, hRes] = await Promise.all([
        fetch('/api/v1/regulatory/sources'),
        fetch('/api/v1/knowledge-chunks?status=pending_review&limit=100'),
        fetch('/api/v1/regulatory/recent-changes?limit=50'),
        fetch('/api/v1/regulatory/health'),
      ]);
      if (!mountedRef.current) return;
      if (sRes.ok) setSources(await sRes.json());
      if (cRes.ok) setPendingChunks(await cRes.json());
      if (rRes.ok) setRecentChanges(await rRes.json());
      if (hRes.ok) setHealth(await hRes.json());
    } catch {
      // silently handle
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const anyUnhealthy = health.some((h) => h.health_status !== 'ok');
  const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s]));

  const juriHealth = ['UK', 'EU', 'IN'].map((jur) => {
    const juriSources = health.filter((h) => h.jurisdiction === jur);
    const worst = juriSources.some((h) => h.health_status === 'red') ? 'red'
      : juriSources.some((h) => h.health_status === 'amber') ? 'amber'
      : 'ok';
    const totalDocs = juriSources.reduce((s, h) => s + (h.documents_ingested_last_30_days ?? 0), 0);
    return { jur, worst, totalDocs, count: juriSources.length };
  });

  function handleReviewDone() {
    setReviewTarget(null);
    load();
    refreshPending();
  }

  async function triggerCheck(sourceId) {
    await fetch(`/api/v1/regulatory/sources/${sourceId}/check`, { method: 'POST' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-nuqe-muted text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-nuqe-text">Regulatory Monitoring</h1>
          <p className="text-xs text-nuqe-muted mt-0.5">
            Live knowledge base health, pending reviews, and change history
          </p>
        </div>
        <button
          onClick={load}
          className="text-xs px-3 py-1.5 rounded-md bg-white/5 text-nuqe-muted hover:text-nuqe-text hover:bg-white/10 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Warning banner */}
      {anyUnhealthy && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
          <span>⚠</span>
          <span>
            One or more monitoring sources are overdue. Review the sources table and trigger a manual check if needed.
          </span>
        </div>
      )}

      {/* Jurisdiction health cards */}
      <div className="grid grid-cols-3 gap-4">
        {juriHealth.map(({ jur, worst, totalDocs, count }) => (
          <div key={jur} className="bg-nuqe-surface border border-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
            <HealthDot status={worst} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-nuqe-text">{jur}</p>
              <p className="text-[11px] text-nuqe-muted">
                {count} source{count !== 1 ? 's' : ''} · {totalDocs} docs / 30 d
              </p>
            </div>
            <Badge colour={worst === 'ok' ? 'green' : worst === 'amber' ? 'amber' : 'red'}>
              {worst.toUpperCase()}
            </Badge>
          </div>
        ))}
      </div>

      {/* 4-panel grid */}
      <div className="grid grid-cols-2 gap-4" style={{ minHeight: 480 }}>

        {/* Panel 1 — Sources */}
        <Panel title="Monitored Sources" count={sources.length}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-nuqe-muted border-b border-white/5">
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Last check</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const h = health.find((x) => x.id === s.id);
                return (
                  <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <HealthDot status={h?.health_status ?? 'ok'} />
                        <div>
                          <p className="text-nuqe-text font-medium leading-tight">{s.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Badge colour="gray">{s.jurisdiction}</Badge>
                            <Badge colour="gray">{s.source_type}</Badge>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-nuqe-muted whitespace-nowrap">
                      {h?.last_check_at ? fmtDateShort(h.last_check_at) : '—'}
                      {h?.last_check_error && (
                        <p
                          className="text-red-400 text-[10px] mt-0.5 truncate max-w-[130px]"
                          title={h.last_check_error}
                        >
                          {h.last_check_error}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => triggerCheck(s.id)}
                        className="text-[10px] px-2 py-1 rounded bg-white/5 text-nuqe-muted hover:text-nuqe-text"
                      >
                        Check
                      </button>
                    </td>
                  </tr>
                );
              })}
              {sources.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-nuqe-muted">
                    No sources configured
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>

        {/* Panel 2 — Pending Review */}
        <Panel title="Pending Review" count={pendingChunks.length}>
          {pendingChunks.length === 0 ? (
            <div className="flex items-center justify-center h-full text-nuqe-muted text-xs py-10">
              No chunks pending review
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {pendingChunks.map((c) => {
                const src = c.source_id ? sourceMap[c.source_id] : null;
                return (
                  <li key={c.id} className="px-4 py-3 hover:bg-white/[0.03]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-nuqe-text truncate">{c.title}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge colour="gray">{c.jurisdiction ?? 'global'}</Badge>
                          <Badge colour="gray">{c.document_type}</Badge>
                          {src && <Badge colour="blue">{src.name}</Badge>}
                          <span className="text-nuqe-muted text-[10px]">{fmtDateShort(c.created_at)}</span>
                        </div>
                        <p className="text-[11px] text-nuqe-muted mt-1.5 line-clamp-2">
                          {c.chunk_text?.slice(0, 200)}…
                        </p>
                      </div>
                      <button
                        onClick={() => setReviewTarget({ ...c, source_name: src?.name })}
                        className="shrink-0 text-[10px] px-2.5 py-1.5 rounded-md bg-nuqe-purple/15 text-nuqe-purple hover:bg-nuqe-purple/25"
                      >
                        Review
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Panel 3 — Recent Changes timeline */}
        <Panel title="Recent Changes" count={recentChanges.length}>
          {recentChanges.length === 0 ? (
            <div className="flex items-center justify-center h-full text-nuqe-muted text-xs py-10">
              No changes in the last 30 days
            </div>
          ) : (
            <div className="relative px-4 py-3">
              <div className="absolute left-[27px] top-0 bottom-0 w-px bg-white/5" />
              <ul className="space-y-4">
                {recentChanges.map((entry) => {
                  const actionColour = {
                    approved:      'green',
                    superseded:    'amber',
                    rejected:      'red',
                    auto_ingested: 'blue',
                  }[entry.action] ?? 'gray';

                  const actionIcon = {
                    approved:      '✓',
                    superseded:    '↻',
                    rejected:      '✕',
                    auto_ingested: '↓',
                  }[entry.action] ?? '·';

                  return (
                    <li key={entry.id} className="flex gap-3 relative">
                      <div className="w-7 h-7 rounded-full bg-nuqe-bg border border-white/10 flex items-center justify-center shrink-0 z-10">
                        <span className="text-[9px]">{actionIcon}</span>
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge colour={actionColour}>{entry.action.replace(/_/g, ' ')}</Badge>
                          {entry.jurisdiction && <Badge colour="gray">{entry.jurisdiction}</Badge>}
                        </div>
                        <p className="text-xs text-nuqe-text mt-1 truncate">
                          {entry.chunk_title ?? entry.entity_id}
                        </p>
                        <p className="text-[10px] text-nuqe-muted mt-0.5">{fmtDate(entry.created_at)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Panel>

        {/* Panel 4 — Monitoring Health detail */}
        <Panel title="Source Health Detail">
          {health.length === 0 ? (
            <div className="flex items-center justify-center h-full text-nuqe-muted text-xs py-10">
              No health data
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {health.map((h) => (
                <li key={h.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <HealthDot status={h.health_status} />
                    <p className="text-xs font-medium text-nuqe-text flex-1 truncate">{h.name}</p>
                    <Badge
                      colour={
                        h.health_status === 'ok' ? 'green'
                        : h.health_status === 'amber' ? 'amber'
                        : 'red'
                      }
                    >
                      {h.health_status.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 text-[11px] text-nuqe-muted ml-4">
                    <span>
                      Last check:{' '}
                      {h.hours_since_check != null ? `${h.hours_since_check}h ago` : 'Never'}
                    </span>
                    <span>Every {h.check_frequency_hours}h</span>
                    <span>30-day docs: {h.documents_ingested_last_30_days}</span>
                    {h.last_check_error && (
                      <span className="text-red-400 col-span-2 truncate" title={h.last_check_error}>
                        Error: {h.last_check_error}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

      </div>

      {/* Review modal */}
      {reviewTarget && (
        <ReviewModal
          chunk={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onDone={handleReviewDone}
        />
      )}
    </div>
  );
}
