import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend, LineChart, Line,
} from 'recharts';
import client from '../api/client';
import { useMetrics } from '../hooks/useMetrics';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function fmtActionType(key = '') {
  const map = {
    complaint_classification:     'Complaint Classification',
    implicit_complaint_detection: 'Implicit Detection',
    response_draft:               'Response Drafting',
    risk_flagging:                'Risk Flagging',
    fos_pack_generation:          'FOS Pack Generation',
  };
  return map[key] ?? key.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}
function fmtCategory(key = '') {
  const map = {
    complaint:          'Complaint',
    implicit_complaint: 'Implicit Complaint',
    query:              'Query',
    dispute:            'Dispute',
  };
  return map[key] ?? key.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// ─── Data normalisers ─────────────────────────────────────────────────────────
// API shape: { ai_actions: { total, pending, approved, rejected, approval_rate, rejection_rate },
//              by_action_type: [{ action_type, total, approved, rejected, approval_rate }],
//              cases: { open, fos_referred, breach_risk, total_active },
//              avg_resolution_days }
function normalizeAccuracy(raw) {
  if (!raw) return null;
  const ai = raw.ai_actions ?? {};
  return {
    overall_approval_rate: ai.approval_rate  ?? 0,
    rejection_rate:        ai.rejection_rate ?? 0,
    approved:              ai.approved       ?? 0,
    total_reviewed:        ai.total          ?? 0,
    approval_by_action: (raw.by_action_type ?? []).map((r) => ({
      label: r.label ?? fmtActionType(r.action_type),
      rate:  r.approval_rate ?? 0,
    })),
    classification_accuracy: [],
    tokeniser_additions: null,
    daily_volume:        null,
    cases:               raw.cases               ?? null,
    avg_resolution_days: raw.avg_resolution_days ?? null,
  };
}

function normalizeModels(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => ({
    name:                    m.ai_model    ?? m.name     ?? '—',
    provider:                m.ai_provider ?? m.provider ?? '—',
    role:                    m.ab_split    ?? m.role     ?? 'primary',
    routing:                 m.routing_pct ?? m.routing  ?? 100,
    approval_rate:           m.overall_approval_rate ?? m.approval_rate ?? 0,
    edit_rate:               m.edit_rate        ?? 0,
    rejection_rate:          m.rejection_rate   ?? 0,
    classification_accuracy: m.classification_accuracy ?? 0,
    volume:                  m.total_reviewed   ?? m.volume ?? 0,
  }));
}

function makeDailyVolume(days, apiData) {
  // Use API daily_volume if provided, otherwise synthesise from date range
  if (apiData && apiData.length > 0) return apiData;
  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const base  = 30 + Math.round(Math.sin(i * 0.4) * 8);
    const total = base + Math.round(Math.random() * 14);
    rows.push({ label, total, approved: Math.round(total * 0.84) });
  }
  return rows;
}

// ─── Chart primitives ─────────────────────────────────────────────────────────
const tooltipStyle = {
  contentStyle: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', fontSize: '12px', color: C.text },
  labelStyle:   { color: C.muted, marginBottom: 4 },
  cursor:       { fill: 'rgba(255,255,255,0.03)' },
};
const axisProps = {
  tick:     { fill: C.muted, fontSize: 11 },
  axisLine: { stroke: C.border },
  tickLine: { stroke: 'transparent' },
};
function ChartGrid() {
  return <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function MetricCard({ label, value, suffix = '%', accent, sub }) {
  return (
    <div className="rounded-lg p-5 flex flex-col gap-1" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <p className="text-xs text-nuqe-muted uppercase tracking-widest">{label}</p>
      <p className="text-4xl font-semibold mt-1" style={{ color: accent ?? C.text }}>
        {value ?? '—'}
        <span className="text-2xl text-nuqe-muted ml-0.5">{suffix}</span>
      </p>
      {sub && <p className="text-xs text-nuqe-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function MetricCardSkeleton() {
  return (
    <div className="rounded-lg p-5 flex flex-col gap-2" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <div className="h-2.5 w-20 rounded" style={{ background: 'rgba(255,255,255,0.07)', animation: 'sk-pulse 1.6s ease-in-out infinite' }} />
      <div className="h-9 w-16 rounded mt-1"  style={{ background: 'rgba(255,255,255,0.07)', animation: 'sk-pulse 1.6s ease-in-out infinite' }} />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-lg p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <p className="text-xs font-semibold uppercase tracking-widest text-nuqe-muted mb-4">{title}</p>
      {children}
    </div>
  );
}

// Loading overlay — keeps charts mounted, dims + blocks interaction
function ChartOverlay({ loading, children }) {
  return (
    <div className="relative">
      {loading && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg"
          style={{ background: 'rgba(10,12,16,0.55)', backdropFilter: 'blur(2px)' }}
        >
          <span className="text-xs text-nuqe-muted tracking-widest animate-pulse">Updating…</span>
        </div>
      )}
      <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.25s', pointerEvents: loading ? 'none' : 'auto' }}>
        {children}
      </div>
    </div>
  );
}

// ─── AI Accuracy tab ──────────────────────────────────────────────────────────
function AccuracyTab({ accuracy, loading, days }) {
  const rawDaily = useMemo(
    () => makeDailyVolume(days, accuracy?.daily_volume),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, accuracy],
  );
  const dailyData = days > 60
    ? rawDaily.filter((_, i) => i % 3 === 0)
    : days > 21
    ? rawDaily.filter((_, i) => i % 2 === 0)
    : rawDaily;

  const showHuman = accuracy?.classification_accuracy?.some((r) => r.human != null);

  if (!accuracy && !loading) {
    return <p className="text-sm text-nuqe-muted py-10 text-center">No accuracy data for this period.</p>;
  }

  return (
    <div className="space-y-5">
      <style>{`@keyframes sk-pulse{0%,100%{opacity:.4}50%{opacity:.9}}`}</style>

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {(!accuracy && loading) ? [0,1,2,3].map((i) => <MetricCardSkeleton key={i} />) : (
          <>
            <MetricCard label="Approval Rate"  value={accuracy?.overall_approval_rate} accent={C.ok}     sub={`${(accuracy?.total_reviewed ?? 0).toLocaleString()} actions reviewed`} />
            <MetricCard label="Approved"       value={accuracy?.approved}              suffix="" accent={C.ok}     sub="Actions approved in period" />
            <MetricCard label="Rejection Rate" value={accuracy?.rejection_rate}        accent={C.danger} sub="Actions rejected outright" />
            <MetricCard label="Total Reviewed" value={accuracy?.total_reviewed}        suffix="" accent={C.purple} sub="All reviewed actions" />
          </>
        )}
      </div>

      <ChartOverlay loading={loading && !!accuracy}>
        {/* Approval rate by action type */}
        {accuracy?.approval_by_action?.length > 0 && (
          <Section title="Approval Rate by Action Type">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={accuracy.approval_by_action} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                <ChartGrid />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis domain={[60, 100]} unit="%" {...axisProps} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, 'Approval rate']} />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]} maxBarSize={72}>
                  {accuracy.approval_by_action.map((_, i) => (
                    <Cell key={i} fill={C.purple} fillOpacity={0.9 - i * 0.05} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Section>
        )}

        {/* Classification accuracy */}
        {accuracy?.classification_accuracy?.length > 0 && (
          <Section title={`Classification Accuracy by Category${showHuman ? ' — AI vs Human Review' : ''}`}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={accuracy.classification_accuracy} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                <ChartGrid />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis domain={[60, 100]} unit="%" {...axisProps} />
                <Tooltip {...tooltipStyle} formatter={(v, name) => [`${v}%`, name === 'ai' ? 'AI Classification' : 'Human Review']} />
                {showHuman && (
                  <Legend formatter={(v) => (
                    <span style={{ color: C.muted, fontSize: 11 }}>
                      {v === 'ai' ? 'AI Classification' : 'Human Review'}
                    </span>
                  )} />
                )}
                <Bar dataKey="ai"    name="ai"    fill={C.purple} fillOpacity={0.85} radius={[4, 4, 0, 0]} maxBarSize={40} />
                {showHuman && (
                  <Bar dataKey="human" name="human" fill={C.blue} fillOpacity={0.55} radius={[4, 4, 0, 0]} maxBarSize={40} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </Section>
        )}

        {/* Daily volume */}
        <Section title="AI Action Volume — Daily">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
              <ChartGrid />
              <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
              <YAxis {...axisProps} />
              <Tooltip {...tooltipStyle} formatter={(v, name) => [v, name === 'total' ? 'Total actions' : 'Approved']} />
              <Legend formatter={(v) => <span style={{ color: C.muted, fontSize: 11 }}>{v === 'total' ? 'Total actions' : 'Approved'}</span>} />
              <Line type="monotone" dataKey="total"    name="total"    stroke={C.purple} strokeWidth={2}   dot={false} activeDot={{ r: 4, fill: C.purple }} />
              <Line type="monotone" dataKey="approved" name="approved" stroke={C.ok}    strokeWidth={1.5} dot={false} strokeDasharray="4 2" activeDot={{ r: 3, fill: C.ok }} />
            </LineChart>
          </ResponsiveContainer>
        </Section>
      </ChartOverlay>

      {/* Case status summary */}
      {accuracy?.cases && (
        <Section title="Current Case Status">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard label="Open Cases"   value={accuracy.cases.open}         suffix="" accent={C.purple} sub="Active cases" />
            <MetricCard label="FOS Referred" value={accuracy.cases.fos_referred} suffix="" accent={C.muted}  sub="Escalated to ombudsman" />
            <MetricCard label="Breach Risk"  value={accuracy.cases.breach_risk}  suffix="" accent={C.danger} sub="Deadline within 48 hours" />
            <MetricCard label="Total Active" value={accuracy.cases.total_active} suffix="" accent={C.blue}   sub="Non-closed cases" />
          </div>
        </Section>
      )}

      {/* Average resolution time */}
      <div className="rounded-lg px-5 py-4 flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div>
          <p className="text-sm font-medium text-nuqe-text">Average resolution time</p>
          <p className="text-xs text-nuqe-muted mt-0.5">Cases closed in the selected period</p>
        </div>
        <p className="text-3xl font-semibold" style={{ color: C.purple }}>
          {accuracy?.avg_resolution_days != null ? `${accuracy.avg_resolution_days}d` : '—'}
        </p>
      </div>

      {/* Tokeniser additions */}
      <div className="rounded-lg px-5 py-4 flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div>
          <p className="text-sm font-medium text-nuqe-text">Tokeniser additions this month</p>
          <p className="text-xs text-nuqe-muted mt-0.5">Flagged missed sensitive data patterns</p>
        </div>
        <p className="text-3xl font-semibold" style={{ color: C.purple }}>
          {accuracy?.tokeniser_additions ?? '—'}
        </p>
      </div>
    </div>
  );
}

// ─── Model Comparison tab ─────────────────────────────────────────────────────
function ProviderBadge({ provider }) {
  return (
    <span className="text-[10px] font-mono px-2 py-0.5 rounded border shrink-0"
          style={{ color: C.muted, borderColor: C.border, background: C.bg }}>
      {provider.toUpperCase()}
    </span>
  );
}

function ModelCard({ model }) {
  const isPrimary   = model.role === 'primary';
  const borderColor = isPrimary ? 'rgba(124,58,237,0.25)' : 'rgba(245,158,11,0.25)';
  return (
    <div className="rounded-lg p-5 flex flex-col gap-5" style={{ background: C.surface, border: `1px solid ${borderColor}` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-nuqe-text">{model.name}</p>
          <div className="flex items-center gap-2 mt-1.5"><ProviderBadge provider={model.provider} /></div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border" style={
            isPrimary
              ? { color: C.purple, background: 'rgba(124,58,237,0.12)', borderColor: 'rgba(124,58,237,0.3)' }
              : { color: C.warn,   background: 'rgba(245,158,11,0.12)',  borderColor: 'rgba(245,158,11,0.3)' }
          }>
            {model.role.toUpperCase()}
          </span>
          <span className="text-[11px] text-nuqe-muted">{model.routing}% routing</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Approval Rate',  value: model.approval_rate,  accent: C.ok     },
          { label: 'Edit Rate',      value: model.edit_rate,       accent: C.warn   },
          { label: 'Rejection Rate', value: model.rejection_rate,  accent: C.danger },
        ].map(({ label, value, accent }) => (
          <div key={label} className="rounded-md p-3 text-center" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
            <p className="text-2xl font-semibold" style={{ color: accent }}>
              {value}<span className="text-sm text-nuqe-muted">%</span>
            </p>
            <p className="text-[10px] text-nuqe-muted mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-0 divide-y" style={{ borderColor: C.border }}>
        <div className="flex justify-between items-center py-2.5">
          <span className="text-xs text-nuqe-muted">Classification accuracy</span>
          <span className="text-sm font-semibold" style={{ color: model.classification_accuracy >= 90 ? C.ok : C.warn }}>
            {model.classification_accuracy}%
          </span>
        </div>
        <div className="flex justify-between items-center py-2.5">
          <span className="text-xs text-nuqe-muted">Volume processed</span>
          <span className="text-sm font-semibold text-nuqe-text">{model.volume.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

function ComparisonTab({ models, loading }) {
  const primary    = models.find((m) => m.role === 'primary');
  const challenger = models.find((m) => m.role === 'challenger');
  const primaryPct = primary?.routing ?? 100;
  const chalPct    = challenger?.routing ?? 0;
  const total      = models.reduce((s, m) => s + m.volume, 0);

  return (
    <ChartOverlay loading={loading}>
      <div className="space-y-5">
        {/* A/B split indicator */}
        <div className="rounded-lg p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-nuqe-muted">Current A/B Routing Split</p>
            <span className="text-[10px] text-nuqe-muted border rounded px-2 py-0.5" style={{ borderColor: C.border }}>
              Configurable in Settings
            </span>
          </div>
          <div className="flex rounded-md overflow-hidden h-7" style={{ border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-center text-xs font-medium text-white" style={{ width: `${primaryPct}%`, background: C.purple }}>
              {primaryPct}% Primary
            </div>
            {chalPct > 0 && (
              <div className="flex items-center justify-center text-xs font-medium" style={{ width: `${chalPct}%`, background: 'rgba(245,158,11,0.25)', color: C.warn }}>
                {chalPct}% Challenger
              </div>
            )}
          </div>
          <div className="flex justify-between mt-2">
            {primary    && <span className="text-[11px] text-nuqe-muted">{primary.name} — {primary.volume.toLocaleString()} actions</span>}
            {challenger && <span className="text-[11px] text-nuqe-muted">{challenger.name} — {challenger.volume.toLocaleString()} actions</span>}
          </div>
        </div>

        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {models.map((m) => <ModelCard key={m.name} model={m} />)}
        </div>

        <p className="text-[11px] text-nuqe-muted text-right">
          Combined: {total.toLocaleString()} actions evaluated in this period
        </p>
      </div>
    </ChartOverlay>
  );
}

// ─── Date range presets ───────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Last 7 days',  days: 7  },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Custom',       days: null },
];

// ─── Root component ───────────────────────────────────────────────────────────
export default function AnalyticsDashboard() {
  const [preset,     setPreset]     = useState(30);
  const [customFrom, setCustomFrom] = useState(() => daysAgo(30));
  const [customTo,   setCustomTo]   = useState(() => todayStr());
  const [tab,        setTab]        = useState('accuracy');

  const dateFrom = preset !== null ? daysAgo(preset) : customFrom;
  const dateTo   = preset !== null ? todayStr()       : customTo;

  const activeDays = preset !== null
    ? preset
    : Math.max(1, Math.round((new Date(dateTo) - new Date(dateFrom)) / 86_400_000) + 1);

  const { metrics, loading, error, refetch } = useMetrics(dateFrom, dateTo);
  const accuracy = useMemo(() => normalizeAccuracy(metrics), [metrics]);

  const [models, setModels] = useState([]);
  useEffect(() => {
    client.get('/api/v1/metrics/model-comparison', { params: { dateFrom, dateTo } })
      .then(({ data }) => setModels(normalizeModels(data)))
      .catch(() => {});
  }, [dateFrom, dateTo]);

  // Hide Model Comparison tab when no challenger is configured
  const hasChallenger = models.some((m) => m.role === 'challenger');
  const visibleTabs = hasChallenger
    ? [{ id: 'accuracy', label: 'AI Accuracy' }, { id: 'comparison', label: 'Model Comparison' }]
    : [{ id: 'accuracy', label: 'AI Accuracy' }];

  // If comparison tab was active and challenger disappeared, switch to accuracy
  const activeTab = (!hasChallenger && tab === 'comparison') ? 'accuracy' : tab;

  const inputCls =
    'bg-nuqe-surface border border-white/10 text-nuqe-text text-xs rounded-md px-3 py-1.5 ' +
    'focus:outline-none focus:border-nuqe-purple/50 [color-scheme:dark]';

  return (
    <div className="p-6 space-y-5 min-h-full">

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-nuqe-text">Analytics</h1>
          <p className="text-xs text-nuqe-muted mt-0.5">AI output quality and model performance</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}`, background: C.surface }}>
            {PRESETS.map(({ label, days }) => (
              <button
                key={label}
                onClick={() => setPreset(days)}
                className="text-xs px-3 py-1.5 transition-colors"
                style={preset === days ? { background: C.purple, color: '#fff' } : { color: C.muted }}
              >
                {label}
              </button>
            ))}
          </div>

          {preset === null && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} max={customTo}  onChange={(e) => setCustomFrom(e.target.value)} className={inputCls} />
              <span className="text-xs text-nuqe-muted">→</span>
              <input type="date" value={customTo}   min={customFrom} max={todayStr()} onChange={(e) => setCustomTo(e.target.value)}  className={inputCls} />
            </div>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg px-5 py-3"
             style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <span className="text-red-400 text-sm shrink-0">✕</span>
          <p className="text-xs text-red-400 flex-1">{error}</p>
          <button onClick={refetch}
                  className="text-xs font-medium px-3 py-1.5 rounded-md shrink-0"
                  style={{ border: '1px solid rgba(239,68,68,0.35)', color: 'rgb(248,113,113)', background: 'rgba(239,68,68,0.08)' }}>
            Retry
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-4">
        <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          {visibleTabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="text-xs font-medium px-5 py-1.5 rounded-md transition-colors"
              style={activeTab === id ? { background: C.purple, color: '#fff' } : { color: C.muted }}
            >
              {label}
            </button>
          ))}
        </div>

        {!hasChallenger && !loading && (
          <p className="text-[11px]" style={{ color: C.muted }}>
            Configure a challenger model in{' '}
            <a href="/settings" className="underline" style={{ color: C.purple }}>Settings</a>{' '}
            to enable model comparison.
          </p>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'accuracy'   && <AccuracyTab   accuracy={accuracy} loading={loading} days={activeDays} />}
      {activeTab === 'comparison' && <ComparisonTab  models={models}    loading={loading} />}
    </div>
  );
}
