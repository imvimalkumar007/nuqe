import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend, LineChart, Line,
} from 'recharts';

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
const MOCK_ACCURACY = {
  overall_approval_rate: 84,
  edit_rate:             11,
  rejection_rate:         5,
  open_knowledge_gaps:    7,
  total_reviewed:      1210,
  approval_by_action: [
    { label: 'Complaint Classification', rate: 91 },
    { label: 'Response Drafting',        rate: 82 },
    { label: 'Risk Flagging',            rate: 88 },
    { label: 'FOS Pack Generation',      rate: 76 },
  ],
  classification_accuracy: [
    { label: 'Complaint',           ai: 91, human: 94 },
    { label: 'Implicit Complaint',  ai: 78, human: 88 },
    { label: 'Query',               ai: 95, human: 97 },
    { label: 'Dispute',             ai: 83, human: 91 },
  ],
  tokeniser_additions: 14,
};

const MOCK_MODELS = [
  {
    name:                    'Claude Sonnet',
    provider:                'Anthropic',
    role:                    'primary',
    routing:                 70,
    approval_rate:           84,
    edit_rate:               11,
    rejection_rate:           5,
    classification_accuracy: 91,
    volume:                 847,
  },
  {
    name:                    'GPT-4o',
    provider:                'OpenAI',
    role:                    'challenger',
    routing:                 30,
    approval_rate:           78,
    edit_rate:               15,
    rejection_rate:           7,
    classification_accuracy: 86,
    volume:                 363,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function generateDailyVolume(days) {
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
  contentStyle: {
    background:   C.surface,
    border:       `1px solid ${C.border}`,
    borderRadius: '8px',
    fontSize:     '12px',
    color:        C.text,
  },
  labelStyle: { color: C.muted, marginBottom: 4 },
  cursor:     { fill: 'rgba(255,255,255,0.03)' },
};

const axisProps = {
  tick:     { fill: C.muted, fontSize: 11 },
  axisLine: { stroke: C.border },
  tickLine: { stroke: 'transparent' },
};

function ChartGrid() {
  return <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />;
}

// ─── Shared UI pieces ─────────────────────────────────────────────────────────
function MetricCard({ label, value, suffix = '%', accent, sub }) {
  return (
    <div
      className="rounded-lg p-5 flex flex-col gap-1"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      <p className="text-xs text-nuqe-muted uppercase tracking-widest">{label}</p>
      <p className="text-4xl font-semibold mt-1" style={{ color: accent ?? C.text }}>
        {value}
        <span className="text-2xl text-nuqe-muted ml-0.5">{suffix}</span>
      </p>
      {sub && <p className="text-xs text-nuqe-muted mt-0.5">{sub}</p>}
    </div>
  );
}

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

// ─── AI Accuracy tab ──────────────────────────────────────────────────────────
function AccuracyTab({ days }) {
  const d = MOCK_ACCURACY;

  const rawDaily = useMemo(() => generateDailyVolume(days), [days]);
  const dailyData = days > 60
    ? rawDaily.filter((_, i) => i % 3 === 0)
    : days > 21
    ? rawDaily.filter((_, i) => i % 2 === 0)
    : rawDaily;

  return (
    <div className="space-y-5">

      {/* Summary metric cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Overall Approval Rate"
          value={d.overall_approval_rate}
          accent={C.ok}
          sub={`${d.total_reviewed.toLocaleString()} actions reviewed`}
        />
        <MetricCard
          label="Edit Rate"
          value={d.edit_rate}
          accent={C.warn}
          sub="Approved after human edits"
        />
        <MetricCard
          label="Rejection Rate"
          value={d.rejection_rate}
          accent={C.danger}
          sub="Actions rejected outright"
        />
        <MetricCard
          label="Open Knowledge Gaps"
          value={d.open_knowledge_gaps}
          suffix=""
          accent={C.purple}
          sub="Pending knowledge base review"
        />
      </div>

      {/* Approval rate by action type */}
      <Section title="Approval Rate by Action Type">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={d.approval_by_action}
            margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
          >
            <ChartGrid />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis domain={[60, 100]} unit="%" {...axisProps} />
            <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, 'Approval rate']} />
            <Bar dataKey="rate" radius={[4, 4, 0, 0]} maxBarSize={72}>
              {d.approval_by_action.map((_, i) => (
                <Cell key={i} fill={C.purple} fillOpacity={0.9 - i * 0.05} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Classification accuracy — grouped bars */}
      <Section title="Classification Accuracy by Category — AI vs Human Review">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={d.classification_accuracy}
            margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
          >
            <ChartGrid />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis domain={[60, 100]} unit="%" {...axisProps} />
            <Tooltip
              {...tooltipStyle}
              formatter={(v, name) => [`${v}%`, name === 'ai' ? 'AI Classification' : 'Human Review']}
            />
            <Legend
              formatter={(v) => (
                <span style={{ color: C.muted, fontSize: 11 }}>
                  {v === 'ai' ? 'AI Classification' : 'Human Review'}
                </span>
              )}
            />
            <Bar dataKey="ai"    name="ai"    fill={C.purple}  fillOpacity={0.85} radius={[4, 4, 0, 0]} maxBarSize={40} />
            <Bar dataKey="human" name="human" fill={C.blue}    fillOpacity={0.55} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Daily volume line chart */}
      <Section title="AI Action Volume — Daily">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart
            data={dailyData}
            margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
          >
            <ChartGrid />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} />
            <Tooltip
              {...tooltipStyle}
              formatter={(v, name) => [v, name === 'total' ? 'Total actions' : 'Approved']}
            />
            <Legend
              formatter={(v) => (
                <span style={{ color: C.muted, fontSize: 11 }}>
                  {v === 'total' ? 'Total actions' : 'Approved'}
                </span>
              )}
            />
            <Line
              type="monotone"
              dataKey="total"
              name="total"
              stroke={C.purple}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: C.purple }}
            />
            <Line
              type="monotone"
              dataKey="approved"
              name="approved"
              stroke={C.ok}
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 2"
              activeDot={{ r: 3, fill: C.ok }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      {/* Tokeniser additions */}
      <div
        className="rounded-lg px-5 py-4 flex items-center justify-between"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
      >
        <div>
          <p className="text-sm font-medium text-nuqe-text">Tokeniser additions this month</p>
          <p className="text-xs text-nuqe-muted mt-0.5">Flagged missed sensitive data patterns</p>
        </div>
        <p className="text-3xl font-semibold" style={{ color: C.purple }}>
          {d.tokeniser_additions}
        </p>
      </div>

    </div>
  );
}

// ─── Model Comparison tab ─────────────────────────────────────────────────────
function ProviderBadge({ provider }) {
  return (
    <span
      className="text-[10px] font-mono px-2 py-0.5 rounded border shrink-0"
      style={{ color: C.muted, borderColor: C.border, background: C.bg }}
    >
      {provider.toUpperCase()}
    </span>
  );
}

function ModelCard({ model }) {
  const isPrimary = model.role === 'primary';
  const borderColor = isPrimary ? 'rgba(124,58,237,0.25)' : 'rgba(245,158,11,0.25)';

  return (
    <div
      className="rounded-lg p-5 flex flex-col gap-5"
      style={{ background: C.surface, border: `1px solid ${borderColor}` }}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-nuqe-text">{model.name}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <ProviderBadge provider={model.provider} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
            style={
              isPrimary
                ? { color: C.purple, background: 'rgba(124,58,237,0.12)', borderColor: 'rgba(124,58,237,0.3)' }
                : { color: C.warn,   background: 'rgba(245,158,11,0.12)',  borderColor: 'rgba(245,158,11,0.3)' }
            }
          >
            {model.role.toUpperCase()}
          </span>
          <span className="text-[11px] text-nuqe-muted">{model.routing}% routing</span>
        </div>
      </div>

      {/* KPI trio */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Approval Rate',  value: model.approval_rate,  accent: C.ok     },
          { label: 'Edit Rate',      value: model.edit_rate,       accent: C.warn   },
          { label: 'Rejection Rate', value: model.rejection_rate,  accent: C.danger },
        ].map(({ label, value, accent }) => (
          <div
            key={label}
            className="rounded-md p-3 text-center"
            style={{ background: C.bg, border: `1px solid ${C.border}` }}
          >
            <p className="text-2xl font-semibold" style={{ color: accent }}>
              {value}<span className="text-sm text-nuqe-muted">%</span>
            </p>
            <p className="text-[10px] text-nuqe-muted mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Secondary metrics */}
      <div className="space-y-0 divide-y" style={{ borderColor: C.border }}>
        <div className="flex justify-between items-center py-2.5">
          <span className="text-xs text-nuqe-muted">Classification accuracy</span>
          <span
            className="text-sm font-semibold"
            style={{ color: model.classification_accuracy >= 90 ? C.ok : C.warn }}
          >
            {model.classification_accuracy}%
          </span>
        </div>
        <div className="flex justify-between items-center py-2.5">
          <span className="text-xs text-nuqe-muted">Volume processed</span>
          <span className="text-sm font-semibold text-nuqe-text">
            {model.volume.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function ComparisonTab() {
  const total = MOCK_MODELS.reduce((s, m) => s + m.volume, 0);

  return (
    <div className="space-y-5">

      {/* Routing indicator */}
      <div
        className="rounded-lg p-4"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-nuqe-muted">
            Current A/B Routing Split
          </p>
          <span
            className="text-[10px] text-nuqe-muted border rounded px-2 py-0.5"
            style={{ borderColor: C.border }}
          >
            Configurable in Settings
          </span>
        </div>

        {/* Split bar */}
        <div
          className="flex rounded-md overflow-hidden h-7"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div
            className="flex items-center justify-center text-xs font-medium text-white"
            style={{ width: '70%', background: C.purple }}
          >
            70% Primary
          </div>
          <div
            className="flex items-center justify-center text-xs font-medium"
            style={{ width: '30%', background: 'rgba(245,158,11,0.25)', color: C.warn }}
          >
            30% Challenger
          </div>
        </div>

        <div className="flex justify-between mt-2">
          <span className="text-[11px] text-nuqe-muted">
            Claude Sonnet — {MOCK_MODELS[0].volume.toLocaleString()} actions
          </span>
          <span className="text-[11px] text-nuqe-muted">
            GPT-4o — {MOCK_MODELS[1].volume.toLocaleString()} actions
          </span>
        </div>
      </div>

      {/* Model cards */}
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
      >
        {MOCK_MODELS.map((m) => (
          <ModelCard key={m.name} model={m} />
        ))}
      </div>

      {/* Aggregate note */}
      <p className="text-[11px] text-nuqe-muted text-right">
        Combined: {total.toLocaleString()} actions evaluated in this period
      </p>
    </div>
  );
}

// ─── Date range presets ───────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Last 7 days',  days: 7  },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Custom',       days: null },
];

const TABS = [
  { id: 'accuracy',   label: 'AI Accuracy'      },
  { id: 'comparison', label: 'Model Comparison'  },
];

// ─── Root component ───────────────────────────────────────────────────────────
export default function AnalyticsDashboard() {
  const [preset,     setPreset]     = useState(30);
  const [customFrom, setCustomFrom] = useState(() => daysAgo(30));
  const [customTo,   setCustomTo]   = useState(() => todayStr());
  const [tab,        setTab]        = useState('accuracy');

  const activeDays = preset !== null
    ? preset
    : Math.max(1, Math.round((new Date(customTo) - new Date(customFrom)) / 86_400_000) + 1);

  const inputCls =
    'bg-nuqe-surface border border-white/10 text-nuqe-text text-xs rounded-md px-3 py-1.5 ' +
    'focus:outline-none focus:border-nuqe-purple/50 [color-scheme:dark]';

  return (
    <div className="p-6 space-y-5 min-h-full">

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-nuqe-text">Analytics</h1>
          <p className="text-xs text-nuqe-muted mt-0.5">
            AI output quality and model performance
          </p>
        </div>

        {/* Date range selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: `1px solid ${C.border}`, background: C.surface }}
          >
            {PRESETS.map(({ label, days }) => (
              <button
                key={label}
                onClick={() => setPreset(days)}
                className="text-xs px-3 py-1.5 transition-colors"
                style={
                  preset === days
                    ? { background: C.purple, color: '#fff' }
                    : { color: C.muted }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {preset === null && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className={inputCls}
              />
              <span className="text-xs text-nuqe-muted">→</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={todayStr()}
                onChange={(e) => setCustomTo(e.target.value)}
                className={inputCls}
              />
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 p-1 rounded-lg w-fit"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="text-xs font-medium px-5 py-1.5 rounded-md transition-colors"
            style={tab === id ? { background: C.purple, color: '#fff' } : { color: C.muted }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'accuracy'   && <AccuracyTab days={activeDays} />}
      {tab === 'comparison' && <ComparisonTab />}
    </div>
  );
}
