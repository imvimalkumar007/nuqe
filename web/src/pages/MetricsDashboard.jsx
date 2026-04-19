import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts';

// ─── Brand tokens (matches CSS variables) ────────────────────────────────────
const C = {
  purple:  '#7C3AED',
  dark:    '#1E1B4B',
  surface: '#111318',
  text:    '#E8EAF0',
  muted:   '#6B7280',
  ok:      '#10B981',
  warn:    '#F59E0B',
  danger:  '#EF4444',
  border:  'rgba(255,255,255,0.07)',
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
function fmt(type) {
  return type.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}
function accuracyColour(pct) {
  if (pct >= 80) return C.ok;
  if (pct >= 50) return C.warn;
  return C.danger;
}

async function fetchMetrics(path, params) {
  const url = new URL(`/api/v1/metrics/${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Shared chart primitives ─────────────────────────────────────────────────

const tooltipStyle = {
  contentStyle: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: '8px',
    fontSize: '12px',
    color: C.text,
  },
  labelStyle: { color: C.muted, marginBottom: 4 },
  cursor:      { fill: 'rgba(255,255,255,0.03)' },
};

const axisProps = {
  tick:  { fill: C.muted, fontSize: 11 },
  axisLine:  { stroke: C.border },
  tickLine:  { stroke: 'transparent' },
};

function ChartGrid() {
  return <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, suffix = '%', accent, sub }) {
  return (
    <div
      className="rounded-lg p-5 flex flex-col gap-1"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      <p className="text-xs text-nuqe-muted uppercase tracking-widest">{label}</p>
      <p className="text-4xl font-semibold mt-1" style={{ color: accent ?? C.text }}>
        {value}<span className="text-2xl text-nuqe-muted">{suffix}</span>
      </p>
      {sub && <p className="text-xs text-nuqe-muted mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div
      className="rounded-lg p-5"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-nuqe-muted mb-4">
        {title}
      </p>
      {children}
    </div>
  );
}

// ─── AI Accuracy Tab ──────────────────────────────────────────────────────────

function AccuracyTab({ data }) {
  if (!data) return <EmptyState message="No accuracy data for this period." />;

  const typeData = (data.approval_rate_by_action_type ?? []).map((r) => ({
    ...r,
    label: fmt(r.action_type),
  }));

  const classData = (data.classification_accuracy ?? []).map((r) => ({
    ...r,
    label: fmt(r.category),
  }));

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Approval Rate"
          value={data.overall_approval_rate}
          accent={C.ok}
          sub={`${data.total_reviewed ?? 0} actions reviewed`}
        />
        <StatCard
          label="Edit Rate"
          value={data.edit_rate}
          accent={C.warn}
          sub="Approved after human edits"
        />
        <StatCard
          label="Rejection Rate"
          value={data.rejection_rate}
          accent={C.danger}
          sub="Actions rejected outright"
        />
      </div>

      {/* Approval rate by action type */}
      <Section title="Approval Rate by Action Type">
        {typeData.length === 0 ? (
          <EmptyState message="No data." inline />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={typeData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
              <ChartGrid />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis domain={[0, 100]} unit="%" {...axisProps} />
              <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, 'Approval rate']} />
              <Bar dataKey="approval_rate" radius={[4, 4, 0, 0]} maxBarSize={56}>
                {typeData.map((_, i) => (
                  <Cell key={i} fill={C.purple} fillOpacity={0.85 - i * 0.04} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* Classification accuracy */}
      <Section title="Classification Accuracy by Category">
        {classData.length === 0 ? (
          <EmptyState message="No classification review data yet." inline />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={classData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
              <ChartGrid />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis domain={[0, 100]} unit="%" {...axisProps} />
              <Tooltip
                {...tooltipStyle}
                formatter={(v, name) => [
                  name === 'accuracy_pct' ? `${v}%` : v,
                  name === 'accuracy_pct' ? 'Accuracy' : 'Total reviewed',
                ]}
              />
              <Legend
                formatter={(v) => (
                  <span style={{ color: C.muted, fontSize: 11 }}>
                    {v === 'accuracy_pct' ? 'Accuracy %' : 'Total reviewed'}
                  </span>
                )}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} fill={C.muted} fillOpacity={0.3} maxBarSize={40} />
              <Bar dataKey="accuracy_pct" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {classData.map((r, i) => (
                  <Cell key={i} fill={accuracyColour(r.accuracy_pct)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* Avg low-confidence flags */}
      <div
        className="rounded-lg px-5 py-3 flex items-center justify-between"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
      >
        <p className="text-xs text-nuqe-muted">
          Avg. tokenisation low-confidence flags / action
        </p>
        <p className="text-sm font-semibold text-nuqe-text">
          {data.average_low_confidence_flags?.toFixed(2) ?? '—'}
        </p>
      </div>
    </div>
  );
}

// ─── Model Comparison Tab ─────────────────────────────────────────────────────

function ModelCard({ model }) {
  const typeData = (model.approval_rate_by_action_type ?? []).map((r) => ({
    label: fmt(r.action_type).replace(' ', '\n'),
    rate:  r.approval_rate,
  }));

  return (
    <div
      className="rounded-lg p-5 flex flex-col gap-4"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-nuqe-text">{model.ai_model ?? '—'}</p>
          <p className="text-xs text-nuqe-muted mt-0.5 capitalize">{model.ai_provider}</p>
        </div>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0"
          style={
            model.ab_split === 'challenger'
              ? { color: C.warn,   background: 'rgba(245,158,11,0.12)',  borderColor: 'rgba(245,158,11,0.3)' }
              : { color: C.purple, background: 'rgba(124,58,237,0.12)', borderColor: 'rgba(124,58,237,0.3)' }
          }
        >
          {model.ab_split}
        </span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Approve', value: model.overall_approval_rate, colour: C.ok },
          { label: 'Edited',  value: model.edit_rate,             colour: C.warn },
          { label: 'Reject',  value: model.rejection_rate,        colour: C.danger },
        ].map(({ label, value, colour }) => (
          <div key={label} className="text-center">
            <p className="text-xl font-semibold" style={{ color: colour }}>
              {value}<span className="text-sm text-nuqe-muted">%</span>
            </p>
            <p className="text-[10px] text-nuqe-muted mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Mini bar chart */}
      {typeData.length > 0 && (
        <ResponsiveContainer width="100%" height={80}>
          <BarChart data={typeData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
            <XAxis dataKey="label" {...axisProps} tick={{ ...axisProps.tick, fontSize: 9 }} />
            <YAxis domain={[0, 100]} hide />
            <Tooltip
              {...tooltipStyle}
              formatter={(v) => [`${v}%`, 'Approval rate']}
            />
            <Bar dataKey="rate" radius={[3, 3, 0, 0]} maxBarSize={32}>
              {typeData.map((_, i) => (
                <Cell key={i} fill={C.purple} fillOpacity={0.7} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      <p className="text-[10px] text-nuqe-muted text-right -mt-2">
        {model.total_reviewed} reviewed
      </p>
    </div>
  );
}

function ComparisonTab({ data }) {
  if (!data || data.length === 0) {
    return <EmptyState message="No model data for this period. Actions need ai_provider set." />;
  }
  return (
    <div className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
      {data.map((m) => (
        <ModelCard key={`${m.ai_provider}-${m.ai_model}`} model={m} />
      ))}
    </div>
  );
}

// ─── Empty / loading states ───────────────────────────────────────────────────

function EmptyState({ message, inline }) {
  if (inline) {
    return <p className="text-xs text-nuqe-muted py-8 text-center">{message}</p>;
  }
  return (
    <div className="flex items-center justify-center py-16">
      <p className="text-sm text-nuqe-muted">{message}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-lg" style={{ background: C.surface }} />
        ))}
      </div>
      <div className="h-64 rounded-lg" style={{ background: C.surface }} />
      <div className="h-64 rounded-lg" style={{ background: C.surface }} />
    </div>
  );
}

// ─── Date range picker ────────────────────────────────────────────────────────

function DateRangePicker({ from, to, onFromChange, onToChange }) {
  const inputClass =
    'bg-nuqe-surface border border-white/10 text-nuqe-text text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-nuqe-purple/50 [color-scheme:dark]';
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-nuqe-muted">From</span>
      <input type="date" value={from} max={to} onChange={(e) => onFromChange(e.target.value)} className={inputClass} />
      <span className="text-xs text-nuqe-muted">to</span>
      <input type="date" value={to}  min={from} max={todayStr()} onChange={(e) => onToChange(e.target.value)} className={inputClass} />
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }) {
  const tabs = [
    { id: 'accuracy',   label: 'AI Accuracy'       },
    { id: 'comparison', label: 'Model Comparison'   },
  ];
  return (
    <div className="flex gap-1 p-1 rounded-lg" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className="flex-1 text-xs font-medium px-4 py-1.5 rounded-md transition-colors"
          style={
            active === id
              ? { background: C.purple, color: '#fff' }
              : { color: C.muted }
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MetricsDashboard — main export
// ─────────────────────────────────────────────────────────────────────────────
export default function MetricsDashboard() {
  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo,   setDateTo]   = useState(todayStr);
  const [tab,      setTab]      = useState('accuracy');
  const [accuracy,   setAccuracy]   = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [acc, comp] = await Promise.all([
        fetchMetrics('ai-accuracy',    { dateFrom, dateTo }),
        fetchMetrics('model-comparison', { dateFrom, dateTo }),
      ]);
      setAccuracy(acc);
      setComparison(comp);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-5 min-h-full">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-nuqe-text">Performance</h1>
          <p className="text-xs text-nuqe-muted mt-0.5">AI output quality and model comparison</p>
        </div>
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onFromChange={setDateFrom}
          onToChange={setDateTo}
        />
      </div>

      {/* Tab selector */}
      <TabBar active={tab} onChange={setTab} />

      {/* Content */}
      {error ? (
        <div className="rounded-lg p-4 text-sm text-nuqe-danger" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          Failed to load metrics: {error}
        </div>
      ) : loading ? (
        <Skeleton />
      ) : (
        <>
          {tab === 'accuracy'   && <AccuracyTab   data={accuracy}   />}
          {tab === 'comparison' && <ComparisonTab data={comparison} />}
        </>
      )}
    </div>
  );
}
