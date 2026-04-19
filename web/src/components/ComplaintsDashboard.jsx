import { useState } from 'react';

// ─── Mock data ────────────────────────────────────────────────────────────────

const CASES = [
  {
    id:          'COMP-2024-0041',
    customer:    { name: 'Sarah Mitchell',  ref: 'ACC-88412' },
    issue:       'Irresponsible lending',
    channel:     'email',
    status:      'breach_risk',
    daysTotal:   56,
    daysLeft:    1,
    ai:          'flagged',
    fosRef:      null,
  },
  {
    id:          'COMP-2024-0039',
    customer:    { name: 'James Okafor',    ref: 'ACC-77203' },
    issue:       'Arrears handling conduct',
    channel:     'postal',
    status:      'breach_risk',
    daysTotal:   56,
    daysLeft:    2,
    ai:          'reviewing',
    fosRef:      null,
  },
  {
    id:          'COMP-2024-0038',
    customer:    { name: 'Priya Sharma',    ref: 'ACC-65891' },
    issue:       'Payment allocation dispute',
    channel:     'email',
    status:      'fos_referred',
    daysTotal:   56,
    daysLeft:    0,
    ai:          'drafted',
    fosRef:      'FOS-2024-18832',
  },
  {
    id:          'COMP-2024-0036',
    customer:    { name: 'Daniel Walsh',    ref: 'ACC-54320' },
    issue:       'Implicit complaint — fee escalation',
    channel:     'chat',
    status:      'under_review',
    daysTotal:   56,
    daysLeft:    15,
    ai:          'implicit',
    fosRef:      null,
  },
  {
    id:          'COMP-2024-0034',
    customer:    { name: 'Emma Thornton',   ref: 'ACC-43198' },
    issue:       'Unauthorised fee charge',
    channel:     'email',
    status:      'open',
    daysTotal:   56,
    daysLeft:    34,
    ai:          'drafted',
    fosRef:      null,
  },
  {
    id:          'COMP-2024-0031',
    customer:    { name: 'Marcus Lee',      ref: 'ACC-32456' },
    issue:       'Credit file inaccuracy',
    channel:     'email',
    status:      'open',
    daysTotal:   56,
    daysLeft:    28,
    ai:          null,
    fosRef:      null,
  },
];

const FILTERS = [
  { key: 'all',          label: 'All' },
  { key: 'breach_risk',  label: 'Breach risk' },
  { key: 'under_review', label: 'Under review' },
  { key: 'fos_referred', label: 'FOS referred' },
];

// ─── Derived counts ───────────────────────────────────────────────────────────

const counts = {
  breach_risk:  CASES.filter((c) => c.status === 'breach_risk').length,
  under_review: CASES.filter((c) => c.status === 'under_review').length,
  open:         CASES.filter((c) => ['open', 'under_review', 'breach_risk'].includes(c.status)).length,
  fos_referred: CASES.filter((c) => c.status === 'fos_referred').length,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, colour, sub }) {
  const ring = {
    danger: 'border-nuqe-danger/30',
    warn:   'border-nuqe-warn/30',
    purple: 'border-nuqe-purple/30',
    muted:  'border-white/10',
  }[colour];

  const val = {
    danger: 'text-nuqe-danger',
    warn:   'text-nuqe-warn',
    purple: 'text-nuqe-purple',
    muted:  'text-nuqe-muted',
  }[colour];

  return (
    <div className={`bg-nuqe-surface border ${ring} rounded-lg px-5 py-4 flex flex-col gap-1`}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-nuqe-muted">{label}</p>
      <p className={`text-3xl font-bold tabular-nums leading-none ${val}`}>{value}</p>
      {sub && <p className="text-[11px] text-nuqe-muted mt-1">{sub}</p>}
    </div>
  );
}

function ChannelDot({ channel }) {
  const cfg = {
    email:  { colour: 'bg-blue-400',  label: 'Email' },
    chat:   { colour: 'bg-emerald-400', label: 'Chat' },
    postal: { colour: 'bg-amber-400',  label: 'Postal' },
  }[channel] ?? { colour: 'bg-nuqe-muted', label: channel };

  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.colour}`} />
      <span className="text-nuqe-muted text-xs">{cfg.label}</span>
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    breach_risk:  { label: 'Breach risk',  cls: 'bg-nuqe-danger/10 text-nuqe-danger  border border-nuqe-danger/25' },
    under_review: { label: 'Under review', cls: 'bg-nuqe-warn/10   text-nuqe-warn    border border-nuqe-warn/25' },
    fos_referred: { label: 'FOS referred', cls: 'bg-nuqe-dark/60   text-purple-300   border border-purple-700/40' },
    open:         { label: 'Open',         cls: 'bg-nuqe-purple/10 text-nuqe-purple  border border-nuqe-purple/25' },
  }[status] ?? { label: status, cls: 'bg-white/5 text-nuqe-muted border border-white/10' };

  return (
    <span className={`inline-block text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function DeadlineBar({ daysLeft, daysTotal }) {
  const pct = Math.max(0, Math.min(100, (daysLeft / daysTotal) * 100));
  const barColour =
    daysLeft < 3  ? 'bg-nuqe-danger' :
    daysLeft < 10 ? 'bg-nuqe-warn'   :
                    'bg-nuqe-ok';
  const textColour =
    daysLeft < 3  ? 'text-nuqe-danger' :
    daysLeft < 10 ? 'text-nuqe-warn'   :
                    'text-nuqe-ok';

  if (daysLeft <= 0) {
    return (
      <span className="text-[11px] font-semibold text-nuqe-danger">
        Deadline passed
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColour}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[11px] tabular-nums font-medium shrink-0 ${textColour}`}>
        {daysLeft}d
      </span>
    </div>
  );
}

function AiBadge({ state }) {
  if (!state) return null;

  const cfg = {
    drafted:  { label: 'Drafted',  cls: 'bg-nuqe-purple/15 text-nuqe-purple border-nuqe-purple/20' },
    flagged:  { label: 'Flagged',  cls: 'bg-nuqe-warn/15   text-nuqe-warn   border-nuqe-warn/20'   },
    reviewing:{ label: 'Reviewing',cls: 'bg-blue-500/15     text-blue-400    border-blue-500/20'    },
    implicit: { label: 'Implicit', cls: 'bg-nuqe-warn/15   text-nuqe-warn   border-nuqe-warn/20'   },
  }[state] ?? { label: state, cls: 'bg-white/5 text-nuqe-muted border-white/10' };

  return (
    <span className={`inline-block text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ComplaintsDashboard() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 6;

  const filtered =
    activeFilter === 'all'
      ? CASES
      : CASES.filter((c) => c.status === activeFilter);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const visible   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleFilter(key) {
    setActiveFilter(key);
    setPage(1);
  }

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3.5 border-b border-white/5 bg-nuqe-surface">
        <div className="flex items-center gap-3">
          <span
            className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'var(--nuqe-purple)' }}
          >
            N
          </span>
          <span className="text-nuqe-text font-semibold tracking-wide text-sm">Nuqe</span>
          <span className="text-white/15 text-sm">|</span>
          <span className="text-nuqe-muted text-sm">Complaints</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-nuqe-text font-medium">Meridian Digital Finance Ltd</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold tracking-widest uppercase border border-emerald-500/30 bg-emerald-500/8 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            FCA Authorised
          </span>
        </div>
      </header>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* ── Metric cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4">
          <MetricCard
            label="Breach risk"
            value={counts.breach_risk}
            colour="danger"
            sub="Within 48 h of DISP deadline"
          />
          <MetricCard
            label="Under review"
            value={counts.under_review}
            colour="warn"
            sub="Awaiting compliance sign-off"
          />
          <MetricCard
            label="Open"
            value={counts.open}
            colour="purple"
            sub="Total active cases"
          />
          <MetricCard
            label="FOS referred"
            value={counts.fos_referred}
            colour="muted"
            sub="Escalated to ombudsman"
          />
        </div>

        {/* ── Filter row ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          {FILTERS.map((f) => {
            const active = activeFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => handleFilter(f.key)}
                className={[
                  'px-3 py-1.5 text-xs font-medium rounded transition-colors border',
                  active
                    ? 'bg-nuqe-purple/20 text-nuqe-purple border-nuqe-purple/40'
                    : 'bg-transparent text-nuqe-muted border-white/10 hover:text-nuqe-text hover:border-white/20',
                ].join(' ')}
              >
                {f.label}
                {f.key !== 'all' && counts[f.key] > 0 && (
                  <span className="ml-1.5 tabular-nums opacity-70">{counts[f.key]}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Cases table ──────────────────────────────────────────────────── */}
        <div className="bg-nuqe-surface border border-white/5 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['Case ID', 'Customer', 'Issue', 'Channel', 'Status', 'DISP Deadline', 'AI'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-nuqe-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((c, i) => (
                <tr
                  key={c.id}
                  className={[
                    'border-b border-white/5 last:border-0 transition-colors cursor-pointer',
                    'hover:bg-white/[0.03]',
                    c.status === 'breach_risk' ? 'bg-nuqe-danger/[0.03]' : '',
                  ].join(' ')}
                >
                  {/* Case ID */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="font-mono text-xs text-nuqe-purple tracking-tight">{c.id}</span>
                    {c.fosRef && (
                      <p className="font-mono text-[10px] text-nuqe-muted mt-0.5">{c.fosRef}</p>
                    )}
                  </td>

                  {/* Customer */}
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-nuqe-text text-sm leading-tight">{c.customer.name}</p>
                    <p className="text-[11px] text-nuqe-muted font-mono mt-0.5">{c.customer.ref}</p>
                  </td>

                  {/* Issue */}
                  <td className="px-4 py-3.5 text-nuqe-text text-xs max-w-[180px]">
                    {c.issue}
                  </td>

                  {/* Channel */}
                  <td className="px-4 py-3.5">
                    <ChannelDot channel={c.channel} />
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5">
                    <StatusBadge status={c.status} />
                  </td>

                  {/* DISP Deadline */}
                  <td className="px-4 py-3.5">
                    <DeadlineBar daysLeft={c.daysLeft} daysTotal={c.daysTotal} />
                  </td>

                  {/* AI */}
                  <td className="px-4 py-3.5">
                    <AiBadge state={c.ai} />
                  </td>
                </tr>
              ))}

              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-nuqe-muted text-sm">
                    No cases match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* ── Bottom bar ─────────────────────────────────────────────────────── */}
      <footer className="shrink-0 flex items-center justify-between px-6 py-3 border-t border-white/5 bg-nuqe-surface text-[11px] text-nuqe-muted">
        <div className="flex items-center gap-4">
          <span>
            <span className="text-nuqe-text font-medium tabular-nums">{filtered.length}</span> case{filtered.length !== 1 ? 's' : ''}
          </span>
          <span className="text-white/15">|</span>
          <span>Ruleset: <span className="text-nuqe-text font-medium">DISP 1.6 · FCA Rulebook v2024</span></span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-2.5 py-1 rounded border border-white/10 text-nuqe-muted hover:text-nuqe-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ‹
          </button>
          <span className="px-3 tabular-nums">
            {page} / {Math.max(1, pageCount)}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={page >= pageCount}
            className="px-2.5 py-1 rounded border border-white/10 text-nuqe-muted hover:text-nuqe-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ›
          </button>
        </div>
      </footer>

    </div>
  );
}
