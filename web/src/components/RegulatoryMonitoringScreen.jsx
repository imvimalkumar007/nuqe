import { useState, useEffect, useCallback, useRef } from 'react';
import client from '../api/client';

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const C = {
  purple:  '#7C3AED',
  surface: '#111318',
  bg:      '#0A0C10',
  text:    '#E8EAF0',
  muted:   '#6B7280',
  ok:      '#10B981',
  warn:    '#F59E0B',
  danger:  '#EF4444',
  border:  'rgba(255,255,255,0.07)',
  blue:    '#3B82F6',
};

// ─── Normalisers ──────────────────────────────────────────────────────────────
function normalizeSource(raw) {
  return {
    id:           raw.id,
    name:         raw.name           ?? '',
    jurisdiction: raw.jurisdiction   ?? 'UK',
    type:         raw.type           ?? 'RSS',
    intervalH:    raw.interval_hours ?? raw.intervalH ?? 24,
    lastChecked:  raw.last_checked_at ?? raw.lastChecked ?? new Date().toISOString(),
    hoursAgo:     raw.hours_since_check ?? raw.hoursAgo ?? 0,
    docsMonth:    raw.docs_this_month   ?? raw.docsMonth ?? 0,
    health:       raw.health_status     ?? raw.health    ?? 'ok',
    active:       raw.active            ?? true,
  };
}

function normalizeChunk(raw) {
  return {
    id:             raw.id,
    title:          raw.title        ?? 'Untitled',
    jurisdiction:   raw.jurisdiction ?? 'UK',
    ingestedAt:     raw.ingested_at  ?? raw.ingestedAt  ?? raw.created_at ?? '',
    preview:        (raw.content ?? raw.text ?? raw.preview ?? '').slice(0, 300),
    content:        raw.content      ?? raw.text        ?? raw.preview    ?? '',
    sourceName:     raw.source_name  ?? raw.sourceName  ?? '',
    confidenceTier: raw.confidence_tier ?? raw.confidenceTier ?? 'medium',
    status:         raw.status       ?? 'pending_review',
  };
}

function normalizeHealth(raw) {
  const list = Array.isArray(raw) ? raw : (raw.jurisdictions ?? []);
  return list.map((j) => ({
    jurisdiction: j.jurisdiction  ?? 'UK',
    status:       j.health_status ?? j.status    ?? 'ok',
    lastCheckAt:  j.last_check_at ?? j.lastCheck ?? '',
    docs7d:       j.docs_7d       ?? j.docs7d    ?? 0,
    docs30d:      j.docs_30d      ?? j.docs30d   ?? 0,
    sources:      j.sources_count ?? j.sources   ?? 0,
  }));
}

function normalizeLog(raw) {
  return {
    id:            raw.id,
    type:          raw.event_type     ?? raw.type          ?? 'approved',
    title:         raw.title          ?? '',
    jurisdiction:  raw.jurisdiction   ?? 'UK',
    approvedBy:    raw.approved_by    ?? raw.approvedBy    ?? 'System',
    effectiveDate: raw.effective_date ?? raw.effectiveDate ?? raw.created_at ?? '',
    casesImpacted: raw.cases_impacted ?? raw.casesImpacted ?? 0,
    supersedes:    raw.supersedes     ?? null,
    createdAt:     raw.created_at     ?? raw.createdAt     ?? '',
  };
}

function fmtTs(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function fmtLastCheck(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const h  = Math.round(ms / 3600000);
  if (h < 1)  return 'Just now';
  if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d !== 1 ? 's' : ''} ago`;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function JurisdictionBadge({ j }) {
  const styles = {
    UK:    { color: C.purple, background: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.3)' },
    India: { color: C.warn,   background: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
    EU:    { color: C.blue,   background: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)' },
  };
  const s = styles[j] ?? styles.UK;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border"
      style={{ color: s.color, background: s.background, borderColor: s.border }}
    >
      {j}
    </span>
  );
}

function HealthDot({ status }) {
  const color = status === 'ok' ? C.ok : status === 'amber' ? C.warn : C.danger;
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
      style={{ background: color, boxShadow: `0 0 6px ${color}55` }}
    />
  );
}

function SectionCard({ title, badge, children }) {
  return (
    <div className="rounded-lg" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: C.border }}>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>
          {title}
        </p>
        {badge}
      </div>
      {children}
    </div>
  );
}

function Btn({ children, onClick, variant = 'ghost', disabled, loading }) {
  const base = 'text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={base}
      style={
        variant === 'primary' ? { background: C.purple, color: '#fff' }
        : variant === 'danger'  ? { color: C.danger }
        : { color: C.muted }
      }
    >
      {loading ? <span style={{ opacity: 0.7 }}>…</span> : children}
    </button>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null;
  const isOk = toast.kind === 'ok';
  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-xl"
      style={{
        background:  isOk ? 'rgba(16,185,129,0.12)'  : 'rgba(239,68,68,0.12)',
        border:      `1px solid ${isOk ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}`,
        color:       isOk ? C.ok : C.danger,
        backdropFilter: 'blur(8px)',
      }}
    >
      <span>{isOk ? '✓' : '✕'}</span>
      <span>{toast.msg}</span>
    </div>
  );
}

// ─── Review Modal ─────────────────────────────────────────────────────────────
const CONFIDENCE_COLORS = {
  high:   { color: C.ok,     bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.25)' },
  medium: { color: C.warn,   bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.25)' },
  low:    { color: C.danger, bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.25)'  },
};

function ReviewModal({ chunk, onApprove, onReject, onClose }) {
  const [actionLoading, setActionLoading] = useState(null);
  const [errMsg,        setErrMsg]        = useState('');

  async function handleApprove() {
    setActionLoading('approve');
    setErrMsg('');
    try {
      await client.patch(`/api/v1/knowledge/chunks/${chunk.id}`, {
        status:      'active',
        reviewer_id: localStorage.getItem('userId') ?? 'reviewer',
      });
      onApprove(chunk.id);
    } catch (err) {
      setErrMsg(err.response?.data?.error ?? 'Approval failed. Please try again.');
      setActionLoading(null);
    }
  }

  async function handleReject() {
    setActionLoading('reject');
    setErrMsg('');
    try {
      await client.patch(`/api/v1/knowledge/chunks/${chunk.id}`, {
        status:      'rejected',
        reviewer_id: localStorage.getItem('userId') ?? 'reviewer',
      });
      onReject(chunk.id);
    } catch (err) {
      setErrMsg(err.response?.data?.error ?? 'Rejection failed. Please try again.');
      setActionLoading(null);
    }
  }

  const conf = CONFIDENCE_COLORS[chunk.confidenceTier] ?? CONFIDENCE_COLORS.medium;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-12 px-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-xl w-full max-w-2xl"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5 border-b"
          style={{ borderColor: C.border }}
        >
          <p className="text-sm font-semibold" style={{ color: C.text }}>Review regulatory chunk</p>
          <button
            onClick={onClose}
            className="text-lg leading-none"
            style={{ color: C.muted }}
          >
            ×
          </button>
        </div>

        {/* Metadata strip */}
        <div
          className="flex flex-wrap items-center gap-3 px-6 py-4 border-b"
          style={{ borderColor: C.border, background: C.bg }}
        >
          <JurisdictionBadge j={chunk.jurisdiction} />
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border"
            style={{ color: conf.color, background: conf.bg, borderColor: conf.border }}
          >
            {chunk.confidenceTier} confidence
          </span>
          {chunk.sourceName && (
            <span className="text-xs" style={{ color: C.muted }}>
              Source: <span style={{ color: C.text }}>{chunk.sourceName}</span>
            </span>
          )}
          <span className="text-xs" style={{ color: C.muted }}>
            Ingested {fmtTs(chunk.ingestedAt)}
          </span>
        </div>

        {/* Title + Content */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm font-semibold leading-snug" style={{ color: C.text }}>
            {chunk.title}
          </p>
          <div
            className="rounded-md p-4 text-sm leading-relaxed"
            style={{
              background: C.bg,
              border:     `1px solid ${C.border}`,
              color:      C.muted,
              maxHeight:  '320px',
              overflowY:  'auto',
            }}
          >
            {chunk.content || chunk.preview || 'No content available.'}
          </div>
        </div>

        {errMsg && (
          <div
            className="mx-6 mb-4 rounded-md px-4 py-3 text-xs"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: C.danger }}
          >
            {errMsg}
          </div>
        )}

        {/* Actions */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t"
          style={{ borderColor: C.border }}
        >
          <button
            onClick={onClose}
            className="text-sm font-medium px-4 py-2 rounded-md"
            style={{ color: C.muted }}
          >
            Cancel
          </button>
          <button
            onClick={handleReject}
            disabled={!!actionLoading}
            className="text-sm font-medium px-4 py-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ border: `1px solid rgba(239,68,68,0.3)`, color: C.danger }}
          >
            {actionLoading === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
          <button
            onClick={handleApprove}
            disabled={!!actionLoading}
            className="text-sm font-medium px-4 py-2 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: C.purple }}
          >
            {actionLoading === 'approve' ? 'Approving…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Health banner ────────────────────────────────────────────────────────────
function HealthBanner({ sources, loading }) {
  if (loading) return (
    <div
      className="rounded-lg px-5 py-3 h-12"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    />
  );

  const overdue = sources.filter((s) => s.active && s.health !== 'ok');
  const allOk   = overdue.length === 0;

  if (allOk) {
    return (
      <div
        className="flex items-center gap-3 rounded-lg px-5 py-3"
        style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
      >
        <span className="text-emerald-400 text-base">✓</span>
        <p className="text-sm text-emerald-400 font-medium">All sources checked within schedule</p>
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-3 rounded-lg px-5 py-3"
      style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
    >
      <span className="text-amber-400 text-base mt-0.5">⚠</span>
      <div>
        <p className="text-sm text-amber-400 font-medium">
          {overdue.length} source{overdue.length > 1 ? 's' : ''} overdue — attention required
        </p>
        <p className="text-xs text-amber-400/70 mt-0.5">
          {overdue.map((s) => s.name).join(', ')}
        </p>
      </div>
    </div>
  );
}

// ─── Panel 1: Sources ─────────────────────────────────────────────────────────
function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="relative inline-flex items-center w-9 h-5 rounded-full transition-colors shrink-0"
      style={{ background: on ? C.purple : 'rgba(255,255,255,0.1)' }}
    >
      <span
        className="inline-block w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: on ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

function SourcesSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['Source', 'Jurisdiction', 'Type', 'Last checked', 'Hrs since', 'Docs / month', '', 'Active', ''].map(
              (h, i) => (
                <th key={i} className="px-4 py-3 text-left font-medium whitespace-nowrap" style={{ color: C.muted }}>
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {[0.9, 0.7, 0.5, 0.35, 0.2].map((op, i) => (
            <tr key={i} style={{ opacity: op, borderBottom: `1px solid ${C.border}` }}>
              {Array.from({ length: 9 }).map((_, j) => (
                <td key={j} className="px-4 py-3">
                  <div className="h-3 rounded" style={{ background: 'rgba(255,255,255,0.07)', width: j === 0 ? '120px' : '60px' }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourcesPanel({ sources, loading, error, onRetry, onToggle, onCheckNow, checking }) {
  return (
    <SectionCard title="Sources">
      {loading && <SourcesSkeleton />}
      {!loading && error && (
        <div className="px-5 py-6 text-xs flex items-center gap-3" style={{ color: C.danger }}>
          {error}
          <button onClick={onRetry} className="underline" style={{ color: C.muted }}>Retry</button>
        </div>
      )}
      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Source', 'Jurisdiction', 'Type', 'Last checked', 'Hrs since', 'Docs / month', '', 'Active', ''].map(
                  (h, i) => (
                    <th key={i} className="px-4 py-3 text-left font-medium whitespace-nowrap" style={{ color: C.muted }}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: C.border }}>
              {sources.map((s) => {
                const isChecking = checking.has(s.id);
                return (
                  <tr key={s.id} style={{ opacity: s.active ? 1 : 0.45 }}>
                    <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: C.text }}>{s.name}</td>
                    <td className="px-4 py-3"><JurisdictionBadge j={s.jurisdiction} /></td>
                    <td className="px-4 py-3" style={{ color: C.muted }}>{s.type}</td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: C.muted }}>
                      {isChecking ? <span style={{ color: C.purple }}>Checking…</span> : fmtTs(s.lastChecked)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="font-medium"
                        style={{ color: s.hoursAgo > s.intervalH ? C.warn : C.muted }}
                      >
                        {isChecking ? '—' : `${s.hoursAgo}h`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: C.muted }}>{s.docsMonth}</td>
                    <td className="px-4 py-3">
                      <HealthDot status={isChecking ? 'ok' : s.health} />
                    </td>
                    <td className="px-4 py-3">
                      <Toggle on={s.active} onChange={(v) => onToggle(s.id, v)} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onCheckNow(s.id)}
                        disabled={!s.active || isChecking}
                        className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                        style={{ color: C.muted }}
                      >
                        {isChecking && (
                          <span
                            className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
                            style={{ borderColor: `${C.purple} transparent transparent transparent` }}
                          />
                        )}
                        {isChecking ? 'Checking…' : 'Check Now'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Panel 2: Pending Review ──────────────────────────────────────────────────
function PendingBadge({ count }) {
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
      style={{ color: C.warn, background: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.3)' }}
    >
      {count} pending
    </span>
  );
}

function PendingReviewPanel({ items, loading, error, onRetry, onReview, onDismiss, dismissing }) {
  return (
    <SectionCard
      title="Pending Review"
      badge={!loading && !error ? <PendingBadge count={items.length} /> : null}
    >
      {loading && (
        <div className="px-5 py-8 text-center text-xs" style={{ color: C.muted }}>Loading…</div>
      )}
      {!loading && error && (
        <div className="px-5 py-6 text-xs flex items-center gap-3" style={{ color: C.danger }}>
          {error}
          <button onClick={onRetry} className="underline" style={{ color: C.muted }}>Retry</button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-xs px-5 py-6" style={{ color: C.muted }}>No items awaiting review.</p>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="divide-y" style={{ borderColor: C.border }}>
          {items.map((item) => (
            <div key={item.id} className="px-5 py-4 space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <JurisdictionBadge j={item.jurisdiction} />
                    <span className="text-[10px]" style={{ color: C.muted }}>
                      Ingested {fmtTs(item.ingestedAt)}
                    </span>
                    {item.sourceName && (
                      <span className="text-[10px]" style={{ color: C.muted }}>
                        · {item.sourceName}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium leading-snug" style={{ color: C.text }}>
                    {item.title}
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
                    {item.preview.slice(0, 150)}{item.preview.length > 150 ? '…' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Btn variant="primary" onClick={() => onReview(item)}>
                  Review
                </Btn>
                <Btn
                  variant="danger"
                  onClick={() => onDismiss(item.id)}
                  loading={dismissing.has(item.id)}
                  disabled={dismissing.has(item.id)}
                >
                  Dismiss
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Panel 3: Recent Changes ──────────────────────────────────────────────────
function RecentChangesPanel({ changes, loading, error, onRetry }) {
  return (
    <SectionCard title="Recent Changes">
      {loading && (
        <div className="px-5 py-6 space-y-4">
          {[0.9, 0.7, 0.5, 0.3].map((op, i) => (
            <div key={i} style={{ opacity: op }} className="flex gap-4">
              <div className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />
              <div className="space-y-2 flex-1">
                <div className="h-3 rounded w-3/4" style={{ background: 'rgba(255,255,255,0.07)' }} />
                <div className="h-3 rounded w-1/2" style={{ background: 'rgba(255,255,255,0.05)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && error && (
        <div className="px-5 py-6 text-xs flex items-center gap-3" style={{ color: C.danger }}>
          {error}
          <button onClick={onRetry} className="underline" style={{ color: C.muted }}>Retry</button>
        </div>
      )}
      {!loading && !error && (
        <div className="px-5 py-4 space-y-0">
          {changes.map((c, idx) => {
            const isLast       = idx === changes.length - 1;
            const isSuperseded = c.type === 'superseded';
            return (
              <div key={c.id} className="flex gap-4">
                <div className="flex flex-col items-center shrink-0 w-5 pt-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
                    style={{
                      background:  isSuperseded ? C.warn : C.ok,
                      boxShadow: `0 0 6px ${isSuperseded ? C.warn : C.ok}55`,
                    }}
                  />
                  {!isLast && (
                    <div className="flex-1 w-px mt-1" style={{ background: C.border, minHeight: '28px' }} />
                  )}
                </div>
                <div className="pb-5 min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <JurisdictionBadge j={c.jurisdiction} />
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={
                            isSuperseded
                              ? { color: C.warn, background: 'rgba(245,158,11,0.10)' }
                              : { color: C.ok,   background: 'rgba(16,185,129,0.10)' }
                          }
                        >
                          {isSuperseded ? 'Superseded' : 'Approved'}
                        </span>
                      </div>
                      <p className="text-sm font-medium leading-snug" style={{ color: C.text }}>
                        {c.title}
                      </p>
                      {isSuperseded && c.supersedes && (
                        <p className="text-[11px]" style={{ color: C.muted }}>
                          Supersedes: <span className="line-through">{c.supersedes}</span>
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      <p className="text-xs" style={{ color: C.muted }}>Effective {fmtDate(c.effectiveDate)}</p>
                      <p className="text-xs" style={{ color: C.muted }}>by {c.approvedBy}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded"
                      style={{ color: C.muted, background: 'rgba(255,255,255,0.04)' }}
                    >
                      {c.casesImpacted} case{c.casesImpacted !== 1 ? 's' : ''} flagged for impact review
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Panel 4: Monitoring Health ───────────────────────────────────────────────
function JurisdictionHealthCard({ j }) {
  const isOk        = j.status === 'ok';
  const accent      = isOk ? C.ok : C.warn;
  const borderColor = isOk ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.2)';

  return (
    <div className="rounded-lg p-5 space-y-4" style={{ background: C.bg, border: `1px solid ${borderColor}` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <JurisdictionBadge j={j.jurisdiction} />
          <span className="text-xs font-medium" style={{ color: C.muted }}>
            {j.sources} source{j.sources !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <HealthDot status={j.status} />
          <span className="text-xs font-medium" style={{ color: accent }}>
            {isOk ? 'Healthy' : 'Attention'}
          </span>
        </div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: C.muted }}>
          Last successful check
        </p>
        <p className="text-sm font-medium" style={{ color: C.text }}>
          {fmtLastCheck(j.lastCheckAt)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div
          className="rounded-md px-3 py-2.5 text-center"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
        >
          <p className="text-2xl font-semibold" style={{ color: C.text }}>{j.docs7d}</p>
          <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>docs / 7 days</p>
        </div>
        <div
          className="rounded-md px-3 py-2.5 text-center"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
        >
          <p className="text-2xl font-semibold" style={{ color: C.text }}>{j.docs30d}</p>
          <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>docs / 30 days</p>
        </div>
      </div>
    </div>
  );
}

function MonitoringHealthPanel({ health, loading, error, onRetry }) {
  return (
    <SectionCard title="Monitoring Health">
      {loading && (
        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0.9, 0.65, 0.4].map((op, i) => (
            <div
              key={i}
              className="rounded-lg p-5"
              style={{ background: C.bg, border: `1px solid ${C.border}`, opacity: op, minHeight: 160 }}
            />
          ))}
        </div>
      )}
      {!loading && error && (
        <div className="px-5 py-6 text-xs flex items-center gap-3" style={{ color: C.danger }}>
          {error}
          <button onClick={onRetry} className="underline" style={{ color: C.muted }}>Retry</button>
        </div>
      )}
      {!loading && !error && (
        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {health.map((j) => <JurisdictionHealthCard key={j.jurisdiction} j={j} />)}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────
export default function RegulatoryMonitoringScreen() {
  const [sources,      setSources]      = useState([]);
  const [pending,      setPending]      = useState([]);
  const [changes,      setChanges]      = useState([]);
  const [health,       setHealth]       = useState([]);

  const [sourcesLoading,  setSourcesLoading]  = useState(true);
  const [pendingLoading,  setPendingLoading]  = useState(true);
  const [changesLoading,  setChangesLoading]  = useState(true);
  const [healthLoading,   setHealthLoading]   = useState(true);

  const [sourcesError,  setSourcesError]  = useState(null);
  const [pendingError,  setPendingError]  = useState(null);
  const [changesError,  setChangesError]  = useState(null);
  const [healthError,   setHealthError]   = useState(null);

  const [checking,   setChecking]   = useState(new Set());
  const [dismissing, setDismissing] = useState(new Set());
  const [reviewing,  setReviewing]  = useState(null);
  const [toast,      setToast]      = useState(null);

  const toastTimerRef   = useRef(null);
  const sourcesInterval = useRef(null);
  const pendingInterval = useRef(null);

  // ── toast helper ──
  function showToast(kind, msg) {
    setToast({ kind, msg });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }

  // ── fetch sources ──
  const fetchSources = useCallback(async () => {
    try {
      const { data } = await client.get('/api/v1/knowledge/sources');
      const raw = Array.isArray(data) ? data : (data.sources ?? []);
      setSources(raw.map(normalizeSource));
      setSourcesError(null);
    } catch (err) {
      setSourcesError(err.response?.data?.error ?? err.message ?? 'Failed to load sources');
    } finally {
      setSourcesLoading(false);
    }
  }, []);

  // ── fetch pending chunks ──
  const fetchPending = useCallback(async () => {
    try {
      const { data } = await client.get('/api/v1/knowledge/chunks', {
        params: { status: 'pending_review' },
      });
      const raw = Array.isArray(data) ? data : (data.chunks ?? []);
      setPending(raw.map(normalizeChunk));
      setPendingError(null);
    } catch (err) {
      setPendingError(err.response?.data?.error ?? err.message ?? 'Failed to load pending items');
    } finally {
      setPendingLoading(false);
    }
  }, []);

  // ── fetch monitoring health ──
  const fetchHealth = useCallback(async () => {
    try {
      const { data } = await client.get('/api/v1/knowledge/monitoring-health');
      setHealth(normalizeHealth(data));
      setHealthError(null);
    } catch (err) {
      setHealthError(err.response?.data?.error ?? err.message ?? 'Failed to load health data');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  // ── fetch monitoring log ──
  const fetchChanges = useCallback(async () => {
    try {
      const { data } = await client.get('/api/v1/knowledge/monitoring-log', {
        params: { limit: 10 },
      });
      const raw = Array.isArray(data) ? data : (data.log ?? data.events ?? []);
      setChanges(raw.map(normalizeLog));
      setChangesError(null);
    } catch (err) {
      setChangesError(err.response?.data?.error ?? err.message ?? 'Failed to load change log');
    } finally {
      setChangesLoading(false);
    }
  }, []);

  // ── initial fetch + polling ──
  useEffect(() => {
    fetchSources();
    sourcesInterval.current = setInterval(fetchSources, 60_000);
    return () => clearInterval(sourcesInterval.current);
  }, [fetchSources]);

  useEffect(() => {
    fetchPending();
    pendingInterval.current = setInterval(fetchPending, 30_000);
    return () => clearInterval(pendingInterval.current);
  }, [fetchPending]);

  useEffect(() => { fetchHealth();  }, [fetchHealth]);
  useEffect(() => { fetchChanges(); }, [fetchChanges]);

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  // ── handlers ──
  function handleToggle(id, value) {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, active: value } : s)));
  }

  async function handleCheckNow(id) {
    setChecking((s) => new Set([...s, id]));
    const start = Date.now();
    try {
      const { data } = await client.post(`/api/v1/knowledge/sources/${id}/check`);
      setSources((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                health:      data.health_status ?? 'ok',
                lastChecked: data.checked_at    ?? new Date().toISOString(),
                hoursAgo:    0,
              }
            : s
        )
      );
      const sourceName = sources.find((s) => s.id === id)?.name ?? id;
      showToast('ok', data.message ?? `${sourceName} checked successfully.`);
    } catch (err) {
      showToast('err', err.response?.data?.error ?? 'Check failed. Please try again.');
    } finally {
      const remaining = Math.max(0, 5000 - (Date.now() - start));
      setTimeout(() => {
        setChecking((s) => { const n = new Set(s); n.delete(id); return n; });
      }, remaining);
    }
  }

  async function handleDismiss(id) {
    setDismissing((s) => new Set([...s, id]));
    try {
      await client.patch(`/api/v1/knowledge/chunks/${id}`, {
        status:      'rejected',
        reviewer_id: localStorage.getItem('userId') ?? 'reviewer',
      });
      setPending((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      showToast('err', err.response?.data?.error ?? 'Dismiss failed.');
    } finally {
      setDismissing((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  function handleApproved(id) {
    setPending((prev) => prev.filter((p) => p.id !== id));
    setReviewing(null);
    showToast('ok', 'Chunk approved and added to the knowledge base.');
  }

  function handleRejected(id) {
    setPending((prev) => prev.filter((p) => p.id !== id));
    setReviewing(null);
    showToast('ok', 'Chunk rejected.');
  }

  return (
    <>
      {reviewing && (
        <ReviewModal
          chunk={reviewing}
          onApprove={handleApproved}
          onReject={handleRejected}
          onClose={() => setReviewing(null)}
        />
      )}

      <Toast toast={toast} />

      <div className="p-6 space-y-5 min-h-full">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: C.text }}>Regulatory Monitoring</h1>
          <p className="text-xs mt-0.5" style={{ color: C.muted }}>
            Automated monitoring of official regulatory sources
          </p>
        </div>

        <HealthBanner sources={sources} loading={sourcesLoading} />

        <SourcesPanel
          sources={sources}
          loading={sourcesLoading}
          error={sourcesError}
          onRetry={fetchSources}
          onToggle={handleToggle}
          onCheckNow={handleCheckNow}
          checking={checking}
        />

        <PendingReviewPanel
          items={pending}
          loading={pendingLoading}
          error={pendingError}
          onRetry={fetchPending}
          onReview={setReviewing}
          onDismiss={handleDismiss}
          dismissing={dismissing}
        />

        <RecentChangesPanel
          changes={changes}
          loading={changesLoading}
          error={changesError}
          onRetry={fetchChanges}
        />

        <MonitoringHealthPanel
          health={health}
          loading={healthLoading}
          error={healthError}
          onRetry={fetchHealth}
        />
      </div>
    </>
  );
}
