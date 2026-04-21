import { useState } from 'react';

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

// ─── Mock data ────────────────────────────────────────────────────────────────
const INITIAL_SOURCES = [
  {
    id:         'fca-news',
    name:       'FCA News',
    jurisdiction: 'UK',
    type:       'RSS',
    intervalH:  12,
    lastChecked: '2026-04-22T20:15:00Z',
    hoursAgo:   2,
    docsMonth:  47,
    health:     'ok',
    active:     true,
  },
  {
    id:         'fca-publications',
    name:       'FCA Publications',
    jurisdiction: 'UK',
    type:       'RSS',
    intervalH:  24,
    lastChecked: '2026-04-22T11:00:00Z',
    hoursAgo:   11,
    docsMonth:  12,
    health:     'ok',
    active:     true,
  },
  {
    id:         'fos-decisions',
    name:       'FOS Decisions',
    jurisdiction: 'UK',
    type:       'Scrape',
    intervalH:  24,
    lastChecked: '2026-04-22T04:30:00Z',
    hoursAgo:   18,
    docsMonth:  8,
    health:     'ok',
    active:     true,
  },
  {
    id:         'rbi-press',
    name:       'RBI Press Releases',
    jurisdiction: 'India',
    type:       'Scrape',
    intervalH:  24,
    lastChecked: '2026-04-21T19:00:00Z',
    hoursAgo:   27,
    docsMonth:  5,
    health:     'amber',
    active:     true,
  },
  {
    id:         'eba-publications',
    name:       'EBA Publications',
    jurisdiction: 'EU',
    type:       'Scrape',
    intervalH:  24,
    lastChecked: '2026-04-22T00:15:00Z',
    hoursAgo:   22,
    docsMonth:  6,
    health:     'ok',
    active:     true,
  },
];

const INITIAL_PENDING = [
  {
    id:    'p1',
    title: 'FCA Dear CEO Letter: Consumer Credit Affordability Standards (April 2026)',
    jurisdiction: 'UK',
    ingestedAt: '2026-04-22T19:45:00Z',
    preview:
      'The FCA expects all consumer credit lenders to implement robust affordability assessments that account for cost-of-living pressures. Firms should review their current frameworks against updated guidance by 30 June 2026…',
  },
  {
    id:    'p2',
    title: 'RBI Circular DL-2026-031: Digital Lending — FLDG Arrangements (Revised)',
    jurisdiction: 'India',
    ingestedAt: '2026-04-22T17:20:00Z',
    preview:
      'Reserve Bank of India revises the cap on First Loss Default Guarantee arrangements. Regulated entities must ensure FLDG does not exceed 5% of the loan portfolio value. Existing arrangements to be wound down within 90 days of circular date…',
  },
  {
    id:    'p3',
    title: 'EBA/GL/2026/04: Guidelines on Internal Governance Under CRD VI (Updated)',
    jurisdiction: 'EU',
    ingestedAt: '2026-04-22T13:00:00Z',
    preview:
      'European Banking Authority updates guidelines on internal governance requirements, extending diversity targets to management body nominations. National competent authorities must incorporate by 31 December 2026…',
  },
];

const RECENT_CHANGES = [
  {
    id:       'rc1',
    type:     'approved',
    title:    'FCA PS26/2: Consumer Duty Annual Assessment — Clarified Expectations',
    jurisdiction: 'UK',
    approvedBy: 'Sarah Jennings',
    effectiveDate: '2026-04-10',
    casesImpacted: 12,
  },
  {
    id:       'rc2',
    type:     'approved',
    title:    'FOS Guidance Update: Mortgage Arrears and Tailored Support',
    jurisdiction: 'UK',
    approvedBy: 'Michael Thornton',
    effectiveDate: '2026-03-28',
    casesImpacted: 4,
  },
  {
    id:       'rc3',
    type:     'superseded',
    title:    'RBI Master Direction: FLDG Arrangements (DL-2026-031)',
    jurisdiction: 'India',
    supersedes:   'RBI Circular DL-2023-12',
    approvedBy: 'Amanda Kovacs',
    effectiveDate: '2026-03-15',
    casesImpacted: 8,
  },
  {
    id:       'rc4',
    type:     'approved',
    title:    'EBA/GL/2026/02: Remote Customer Due Diligence',
    jurisdiction: 'EU',
    approvedBy: 'David Reyes',
    effectiveDate: '2026-03-01',
    casesImpacted: 2,
  },
  {
    id:       'rc5',
    type:     'approved',
    title:    'FCA FG26/1: Financial Promotions — Real-time Communication Standards',
    jurisdiction: 'UK',
    approvedBy: 'Sarah Jennings',
    effectiveDate: '2026-02-14',
    casesImpacted: 7,
  },
];

const JURISDICTION_HEALTH = [
  {
    jurisdiction: 'UK',
    status:      'ok',
    lastCheck:   '2 hours ago',
    docs7d:      23,
    docs30d:     67,
    sources:     3,
  },
  {
    jurisdiction: 'India',
    status:      'amber',
    lastCheck:   '27 hours ago',
    docs7d:       3,
    docs30d:      5,
    sources:     1,
  },
  {
    jurisdiction: 'EU',
    status:      'ok',
    lastCheck:   '22 hours ago',
    docs7d:       4,
    docs30d:      6,
    sources:     1,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTs(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function JurisdictionBadge({ j }) {
  const styles = {
    UK:    { color: C.purple, background: 'rgba(124,58,237,0.12)',  border: 'rgba(124,58,237,0.3)' },
    India: { color: C.warn,   background: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)' },
    EU:    { color: C.blue,   background: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)' },
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
      <div
        className="flex items-center gap-3 px-5 py-4 border-b"
        style={{ borderColor: C.border }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-nuqe-muted">
          {title}
        </p>
        {badge}
      </div>
      {children}
    </div>
  );
}

function Btn({ children, onClick, variant = 'ghost', disabled }) {
  const base = 'text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    ghost:   `${base} text-nuqe-muted hover:text-nuqe-text`,
    primary: `${base} text-white`,
    danger:  `${base} text-red-400 hover:text-red-300`,
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={variants[variant]}
      style={variant === 'primary' ? { background: C.purple } : undefined}
    >
      {children}
    </button>
  );
}

// ─── Health banner ────────────────────────────────────────────────────────────
function HealthBanner({ sources }) {
  const overdue = sources.filter((s) => s.active && s.health !== 'ok');
  const allOk   = overdue.length === 0;

  if (allOk) {
    return (
      <div
        className="flex items-center gap-3 rounded-lg px-5 py-3"
        style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
      >
        <span className="text-emerald-400 text-base">✓</span>
        <p className="text-sm text-emerald-400 font-medium">
          All sources checked within schedule
        </p>
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

function SourcesPanel({ sources, onToggle, onCheckNow, checking }) {
  return (
    <SectionCard title="Sources">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Source', 'Jurisdiction', 'Type', 'Last checked', 'Hrs since', 'Docs / month', '', 'Active', ''].map(
                (h, i) => (
                  <th
                    key={i}
                    className="px-4 py-3 text-left font-medium text-nuqe-muted whitespace-nowrap"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: C.border }}>
            {sources.map((s) => (
              <tr
                key={s.id}
                className="transition-colors"
                style={{ opacity: s.active ? 1 : 0.45 }}
              >
                <td className="px-4 py-3 font-medium text-nuqe-text whitespace-nowrap">
                  {s.name}
                </td>
                <td className="px-4 py-3">
                  <JurisdictionBadge j={s.jurisdiction} />
                </td>
                <td className="px-4 py-3 text-nuqe-muted">{s.type}</td>
                <td className="px-4 py-3 text-nuqe-muted whitespace-nowrap">
                  {checking === s.id ? (
                    <span style={{ color: C.purple }}>Checking…</span>
                  ) : (
                    fmtTs(s.lastChecked)
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="font-medium"
                    style={{
                      color:
                        s.hoursAgo > s.intervalH
                          ? C.warn
                          : s.hoursAgo > s.intervalH * 0.8
                          ? C.warn
                          : C.muted,
                    }}
                  >
                    {checking === s.id ? '—' : `${s.hoursAgo}h`}
                  </span>
                </td>
                <td className="px-4 py-3 text-nuqe-muted text-right">{s.docsMonth}</td>
                <td className="px-4 py-3">
                  <HealthDot status={checking === s.id ? 'ok' : s.health} />
                </td>
                <td className="px-4 py-3">
                  <Toggle on={s.active} onChange={(v) => onToggle(s.id, v)} />
                </td>
                <td className="px-4 py-3">
                  <Btn
                    onClick={() => onCheckNow(s.id)}
                    disabled={!s.active || checking === s.id}
                  >
                    {checking === s.id ? 'Checking…' : 'Check Now'}
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─── Panel 2: Pending Review ──────────────────────────────────────────────────
function PendingBadge({ count }) {
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
      style={{
        color:       C.warn,
        background:  'rgba(245,158,11,0.12)',
        borderColor: 'rgba(245,158,11,0.3)',
      }}
    >
      {count} pending
    </span>
  );
}

function PendingReviewPanel({ items, onDismiss }) {
  const [reviewing, setReviewing] = useState(null);

  return (
    <SectionCard title="Pending Review" badge={<PendingBadge count={items.length} />}>
      {items.length === 0 ? (
        <p className="text-xs text-nuqe-muted px-5 py-6">No items awaiting review.</p>
      ) : (
        <div className="divide-y" style={{ borderColor: C.border }}>
          {items.map((item) => (
            <div key={item.id} className="px-5 py-4 space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <JurisdictionBadge j={item.jurisdiction} />
                    <span className="text-[10px] text-nuqe-muted">
                      Ingested {fmtTs(item.ingestedAt)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-nuqe-text leading-snug">
                    {item.title}
                  </p>
                  <p className="text-xs text-nuqe-muted leading-relaxed line-clamp-2">
                    {item.preview.slice(0, 150)}
                    {item.preview.length > 150 ? '…' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Btn
                  variant="primary"
                  onClick={() => setReviewing(item.id)}
                  disabled={reviewing === item.id}
                >
                  {reviewing === item.id ? 'Opened in review…' : 'Review'}
                </Btn>
                <Btn variant="danger" onClick={() => onDismiss(item.id)}>
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
function RecentChangesPanel({ changes }) {
  return (
    <SectionCard title="Recent Changes">
      <div className="px-5 py-4 space-y-0">
        {changes.map((c, idx) => {
          const isLast = idx === changes.length - 1;
          const isSuperseded = c.type === 'superseded';
          return (
            <div key={c.id} className="flex gap-4">
              {/* Timeline spine */}
              <div className="flex flex-col items-center shrink-0 w-5 pt-1">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
                  style={{
                    background: isSuperseded ? C.warn : C.ok,
                    boxShadow: `0 0 6px ${isSuperseded ? C.warn : C.ok}55`,
                  }}
                />
                {!isLast && (
                  <div
                    className="flex-1 w-px mt-1"
                    style={{ background: C.border, minHeight: '28px' }}
                  />
                )}
              </div>

              {/* Entry body */}
              <div className={`pb-5 min-w-0 flex-1 ${isLast ? '' : ''}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <JurisdictionBadge j={c.jurisdiction} />
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={
                          isSuperseded
                            ? { color: C.warn,   background: 'rgba(245,158,11,0.10)' }
                            : { color: C.ok,     background: 'rgba(16,185,129,0.10)' }
                        }
                      >
                        {isSuperseded ? 'Superseded' : 'Approved'}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-nuqe-text leading-snug">
                      {c.title}
                    </p>
                    {isSuperseded && c.supersedes && (
                      <p className="text-[11px] text-nuqe-muted">
                        Supersedes:{' '}
                        <span className="line-through">{c.supersedes}</span>
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-xs text-nuqe-muted">
                      Effective {fmtDate(c.effectiveDate)}
                    </p>
                    <p className="text-xs text-nuqe-muted">by {c.approvedBy}</p>
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
    </SectionCard>
  );
}

// ─── Panel 4: Monitoring Health ───────────────────────────────────────────────
function JurisdictionHealthCard({ j }) {
  const isOk   = j.status === 'ok';
  const accent = isOk ? C.ok : C.warn;
  const borderColor = isOk
    ? 'rgba(16,185,129,0.15)'
    : 'rgba(245,158,11,0.2)';

  return (
    <div
      className="rounded-lg p-5 space-y-4"
      style={{ background: C.bg, border: `1px solid ${borderColor}` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <JurisdictionBadge j={j.jurisdiction} />
          <span className="text-xs font-medium text-nuqe-muted">
            {j.sources} source{j.sources !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <HealthDot status={j.status} />
          <span
            className="text-xs font-medium"
            style={{ color: accent }}
          >
            {isOk ? 'Healthy' : 'Attention'}
          </span>
        </div>
      </div>

      <div>
        <p className="text-[10px] text-nuqe-muted uppercase tracking-widest mb-1">
          Last successful check
        </p>
        <p className="text-sm font-medium text-nuqe-text">{j.lastCheck}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div
          className="rounded-md px-3 py-2.5 text-center"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
        >
          <p className="text-2xl font-semibold text-nuqe-text">{j.docs7d}</p>
          <p className="text-[10px] text-nuqe-muted mt-0.5">docs / 7 days</p>
        </div>
        <div
          className="rounded-md px-3 py-2.5 text-center"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
        >
          <p className="text-2xl font-semibold text-nuqe-text">{j.docs30d}</p>
          <p className="text-[10px] text-nuqe-muted mt-0.5">docs / 30 days</p>
        </div>
      </div>
    </div>
  );
}

function MonitoringHealthPanel() {
  return (
    <SectionCard title="Monitoring Health">
      <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {JURISDICTION_HEALTH.map((j) => (
          <JurisdictionHealthCard key={j.jurisdiction} j={j} />
        ))}
      </div>
    </SectionCard>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────
export default function RegulatoryMonitoringScreen() {
  const [sources,  setSources]  = useState(INITIAL_SOURCES);
  const [pending,  setPending]  = useState(INITIAL_PENDING);
  const [checking, setChecking] = useState(null);

  function handleToggle(id, value) {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: value } : s))
    );
  }

  function handleCheckNow(id) {
    setChecking(id);
    setTimeout(() => {
      setSources((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, health: 'ok', hoursAgo: 0, lastChecked: new Date().toISOString() }
            : s
        )
      );
      setChecking(null);
    }, 2000);
  }

  function handleDismiss(id) {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="p-6 space-y-5 min-h-full">

      {/* Page header */}
      <div>
        <h1 className="text-lg font-semibold text-nuqe-text">Regulatory Monitoring</h1>
        <p className="text-xs text-nuqe-muted mt-0.5">
          Automated monitoring of official regulatory sources
        </p>
      </div>

      {/* Health banner */}
      <HealthBanner sources={sources} />

      {/* Panel 1: Sources */}
      <SourcesPanel
        sources={sources}
        onToggle={handleToggle}
        onCheckNow={handleCheckNow}
        checking={checking}
      />

      {/* Panel 2: Pending Review */}
      <PendingReviewPanel items={pending} onDismiss={handleDismiss} />

      {/* Panel 3: Recent Changes */}
      <RecentChangesPanel changes={RECENT_CHANGES} />

      {/* Panel 4: Monitoring Health */}
      <MonitoringHealthPanel />

    </div>
  );
}
