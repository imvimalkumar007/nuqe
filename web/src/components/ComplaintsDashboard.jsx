import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCases }   from '../hooks/useCases';
import { useMetrics } from '../hooks/useMetrics';
import client from '../api/client';
import ErrorBanner     from './shared/ErrorBanner';

// ─── Static config ────────────────────────────────────────────────────────────

const FILTERS = [
  { key: 'all',          label: 'All cases' },
  { key: 'breach_risk',  label: 'Breach risk' },
  { key: 'under_review', label: 'Under review' },
  { key: 'fos_referred', label: 'FOS referred' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, colour, sub, icon }) {
  const styles = {
    danger: { text: 'var(--nuqe-danger)', bg: 'var(--nuqe-danger-dim)', border: 'var(--nuqe-danger-ring)' },
    warn:   { text: 'var(--nuqe-warn)',   bg: 'var(--nuqe-warn-dim)',   border: 'var(--nuqe-warn-ring)'   },
    purple: { text: 'var(--nuqe-purple-light)', bg: 'rgba(124,58,237,0.1)', border: 'rgba(124,58,237,0.2)' },
    muted:  { text: 'var(--nuqe-muted)', bg: 'rgba(255,255,255,0.04)', border: 'var(--nuqe-border-hi)' },
  }[colour];

  return (
    <div className="card px-5 py-4 flex flex-col gap-2.5"
         style={{ borderColor: styles.border }}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-nuqe-muted">{label}</p>
        {icon && (
          <span className="w-6 h-6 rounded flex items-center justify-center opacity-60"
                style={{ background: styles.bg, color: styles.text }}>
            {icon}
          </span>
        )}
      </div>
      <p className="text-[28px] font-bold tabular-nums leading-none tracking-tight"
         style={{ color: styles.text }}>
        {value ?? '—'}
      </p>
      {sub && <p className="text-[11.5px] text-nuqe-subtle leading-tight">{sub}</p>}
    </div>
  );
}

function MetricCardSkeleton() {
  return (
    <div className="card px-5 py-4 flex flex-col gap-2.5">
      <div className="skeleton h-2 w-20 rounded" />
      <div className="skeleton h-7 w-10 rounded" />
      <div className="skeleton h-2 w-28 rounded" />
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    breach_risk:        { label: 'Breach risk',       cls: 'badge badge-danger' },
    under_review:       { label: 'Under review',      cls: 'badge badge-warn'   },
    fos_referred:       { label: 'FOS referred',      cls: 'badge badge-purple' },
    open:               { label: 'Open',              cls: 'badge badge-info'   },
    closed_upheld:      { label: 'Upheld',            cls: 'badge badge-ok'     },
    closed_not_upheld:  { label: 'Not upheld',        cls: 'badge badge-muted'  },
    closed_withdrawn:   { label: 'Withdrawn',         cls: 'badge badge-muted'  },
    ombudsman_referred: { label: 'Ombudsman',         cls: 'badge badge-purple' },
    pending_response:   { label: 'Pending response',  cls: 'badge badge-info'   },
    awaiting_customer:  { label: 'Awaiting customer', cls: 'badge badge-muted'  },
  }[status] ?? { label: status?.replace(/_/g, ' ') ?? '—', cls: 'badge badge-muted' };

  return <span className={cfg.cls}>{cfg.label}</span>;
}

function AiBadge({ state }) {
  if (!state) return null;
  const cfg = {
    drafted:   { label: 'AI drafted',  cls: 'badge badge-purple' },
    flagged:   { label: 'Flagged',     cls: 'badge badge-warn'   },
    reviewing: { label: 'Reviewing',   cls: 'badge badge-info'   },
    implicit:  { label: 'Implicit',    cls: 'badge badge-warn'   },
  }[state] ?? { label: state, cls: 'badge badge-muted' };

  return <span className={cfg.cls}>{cfg.label}</span>;
}

function ChannelPill({ channel }) {
  const cfg = {
    email:  { colour: '#63B3ED', label: 'Email'  },
    chat:   { colour: '#68D391', label: 'Chat'   },
    postal: { colour: '#F6AD55', label: 'Postal' },
  }[channel] ?? { colour: 'var(--nuqe-muted)', label: channel ?? '—' };

  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-nuqe-muted">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.colour }} />
      {cfg.label}
    </span>
  );
}

function DeadlineBar({ daysLeft, daysTotal }) {
  const pct = Math.max(0, Math.min(100, (daysLeft / (daysTotal || 56)) * 100));
  const colour = daysLeft < 3 ? 'var(--nuqe-danger)' : daysLeft < 10 ? 'var(--nuqe-warn)' : 'var(--nuqe-ok)';

  if (daysLeft <= 0) {
    return <span className="text-[12px] font-medium" style={{ color: 'var(--nuqe-danger)' }}>Overdue</span>;
  }

  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colour }} />
      </div>
      <span className="text-[12px] tabular-nums font-medium shrink-0" style={{ color: colour, minWidth: '28px', textAlign: 'right' }}>
        {daysLeft}d
      </span>
    </div>
  );
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

function TableSkeleton({ rows = 8 }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} style={{ borderBottom: '1px solid var(--nuqe-border)' }}>
          {[64, 96, 140, 60, 80, 100, 56].map((w, j) => (
            <td key={j} className="px-4 py-3.5">
              <div className="skeleton rounded" style={{ height: '12px', width: `${w}px` }} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ComplaintsDashboard() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { cases, loading: casesLoading, error: casesError, refetch: refetchCases } = useCases(activeFilter);
  const { loading: metricsLoading, refetch: refetchMetrics } = useMetrics();
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    client.get('/api/v1/metrics/dashboard-summary')
      .then((r) => setSummary(r.data))
      .catch(() => setSummary(null));
  }, []);

  const counts = summary
    ? { breach_risk: summary.breach_risk_count, under_review: summary.under_review_count,
        open: summary.open_count, fos_referred: summary.fos_referred_count }
    : {
        breach_risk:  cases.filter((c) => { if (!c.disp_deadline) return false; return Math.ceil((new Date(c.disp_deadline) - new Date()) / 86400000) <= 2; }).length,
        under_review: cases.filter((c) => c.status === 'under_review').length,
        open:         cases.filter((c) => c.status === 'open').length,
        fos_referred: cases.filter((c) => c.status === 'fos_referred').length,
      };

  const filtered = activeFilter === 'breach_risk'
    ? cases.filter((c) => { if (!c.disp_deadline) return false; return Math.ceil((new Date(c.disp_deadline) - new Date()) / 86400000) <= 2; })
    : cases;
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const visible   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleFilter(key) { setActiveFilter(key); setPage(1); }
  function handleRetry() { refetchCases(); refetchMetrics(); }

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3"
              style={{ borderBottom: '1px solid var(--nuqe-border)', background: 'var(--nuqe-surface)' }}>
        <div className="flex items-center gap-3">
          <h1 className="text-[14.5px] font-semibold text-nuqe-text tracking-tight">Complaints</h1>
          <span className="text-nuqe-subtle text-sm">/</span>
          <span className="text-[13px] text-nuqe-muted">Dashboard</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-medium text-nuqe-muted">
            {import.meta.env.VITE_FIRM_NAME ?? 'Nuqe Demo'}
          </span>
          <span className="badge badge-ok" style={{ fontSize: '10.5px', letterSpacing: '0.04em' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-nuqe-ok inline-block" />
            FCA Authorised
          </span>
        </div>
      </header>

      {/* ── Scrollable content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

        {casesError && <ErrorBanner message={casesError} onRetry={handleRetry} />}

        {/* ── Metric cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3">
          {metricsLoading && !summary ? (
            [0,1,2,3].map((i) => <MetricCardSkeleton key={i} />)
          ) : (
            <>
              <MetricCard label="Breach risk"  value={counts.breach_risk}  colour="danger" sub="Within 48 h of DISP deadline"
                icon={<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5"><path d="M6 1l5 9H1L6 1z" strokeLinejoin="round" /><path d="M6 5v2M6 8.5v.5" strokeLinecap="round" /></svg>} />
              <MetricCard label="Under review" value={counts.under_review} colour="warn"   sub="Awaiting compliance sign-off"
                icon={<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5"><circle cx="6" cy="6" r="4.5" /><path d="M6 3.5V6l1.5 1.5" strokeLinecap="round" /></svg>} />
              <MetricCard label="Open cases"   value={counts.open}         colour="purple" sub="Total active cases"
                icon={<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5"><rect x="1.5" y="1.5" width="9" height="9" rx="1.5" /><path d="M4 6h4M6 4v4" strokeLinecap="round" /></svg>} />
              <MetricCard label="FOS referred"  value={counts.fos_referred} colour="muted"  sub="Escalated to ombudsman"
                icon={<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5"><path d="M2 6h8M7 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" /></svg>} />
            </>
          )}
        </div>

        {/* ── Filter bar ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5">
          {FILTERS.map((f) => {
            const active = activeFilter === f.key;
            const cnt = f.key !== 'all' ? counts[f.key] : null;
            return (
              <button
                key={f.key}
                onClick={() => handleFilter(f.key)}
                className="btn btn-ghost"
                style={active ? {
                  background: 'rgba(124,58,237,0.1)',
                  color: 'var(--nuqe-purple-light)',
                  border: '1px solid rgba(124,58,237,0.25)',
                  padding: '5px 12px',
                  fontSize: '12.5px',
                } : {
                  padding: '5px 12px',
                  fontSize: '12.5px',
                }}
              >
                {f.label}
                {cnt != null && cnt > 0 && (
                  <span className="ml-1.5 tabular-nums opacity-60 text-[11px]">{cnt}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Cases table ──────────────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                {['Case ref', 'Customer', 'Category', 'Channel', 'Status', 'DISP deadline', 'AI'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>

            {casesLoading ? (
              <TableSkeleton rows={8} />
            ) : (
              <tbody>
                {visible.map((c) => {
                  const daysLeft = c.disp_deadline
                    ? Math.ceil((new Date(c.disp_deadline) - new Date()) / 86400000)
                    : null;
                  const isBreaching = daysLeft !== null && daysLeft <= 2;

                  return (
                    <tr
                      key={c.case_id}
                      onClick={() => navigate(`/cases/${c.case_id}`)}
                      className="cursor-pointer"
                      style={isBreaching ? { background: 'rgba(252,129,129,0.025)' } : {}}
                    >
                      <td style={{ width: '120px' }}>
                        <span className="mono-ref font-medium text-nuqe-purple">{c.case_ref}</span>
                        {c.fos_ref && <p className="mono-ref text-nuqe-subtle mt-0.5">{c.fos_ref}</p>}
                      </td>
                      <td>
                        <p className="font-medium text-[13.5px] text-nuqe-text leading-tight">{c.customer_name ?? '—'}</p>
                      </td>
                      <td className="text-nuqe-muted text-[12.5px] max-w-[160px]" style={{ lineHeight: '1.4' }}>
                        {c.category ? c.category.replace(/_/g, ' ') : '—'}
                      </td>
                      <td><ChannelPill channel={c.channel_received} /></td>
                      <td><StatusBadge status={c.status} /></td>
                      <td style={{ width: '140px' }}>
                        {daysLeft === null
                          ? <span className="text-[12px] text-nuqe-subtle">No deadline</span>
                          : <DeadlineBar daysLeft={daysLeft} daysTotal={56} />
                        }
                      </td>
                      <td><AiBadge state={c.ai_status} /></td>
                    </tr>
                  );
                })}

                {!casesLoading && visible.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="flex flex-col items-center justify-center py-14 gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-nuqe-subtle"
                             style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--nuqe-border)' }}>
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                            <path d="M10 3a7 7 0 100 14A7 7 0 0010 3z" strokeLinecap="round" />
                            <path d="M10 7v4M10 13v.5" strokeLinecap="round" />
                          </svg>
                        </div>
                        <div className="text-center">
                          <p className="text-[13.5px] font-medium text-nuqe-muted">No cases found</p>
                          <p className="text-[12px] text-nuqe-subtle mt-0.5">
                            {casesError ? 'Failed to load cases — check your connection.' : 'No cases match this filter.'}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            )}
          </table>
        </div>

      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="shrink-0 flex items-center justify-between px-6 py-2.5 text-[11.5px] text-nuqe-subtle"
              style={{ borderTop: '1px solid var(--nuqe-border)', background: 'var(--nuqe-surface)' }}>
        <div className="flex items-center gap-3">
          <span>
            <span className="text-nuqe-muted font-medium tabular-nums">{cases.length}</span>
            {' '}case{cases.length !== 1 ? 's' : ''}
          </span>
          <span className="opacity-20">·</span>
          <span>Ruleset: <span className="text-nuqe-muted font-medium">DISP 1.6 · FCA Rulebook v2024</span></span>
        </div>

        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn btn-ghost"
              style={{ padding: '3px 8px', fontSize: '12px' }}
            >
              ←
            </button>
            <span className="px-2 tabular-nums text-nuqe-muted">{page} / {Math.max(1, pageCount)}</span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
              className="btn btn-ghost"
              style={{ padding: '3px 8px', fontSize: '12px' }}
            >
              →
            </button>
          </div>
        )}
      </footer>

    </div>
  );
}
