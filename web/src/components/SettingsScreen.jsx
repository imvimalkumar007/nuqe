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

// ─── Mock tokeniser additions ─────────────────────────────────────────────────
const INITIAL_TOKENS = [
  {
    id:      't1',
    pattern: String.raw`\b[A-Z]{2}\d{6}[A-Z]\b`,
    type:    'NI Number',
    label:   'National Insurance reference',
    scope:   'organisation',
    status:  'active',
    addedBy: 'Sarah Jennings',
    addedAt: '2026-03-10',
    active:  true,
  },
  {
    id:      't2',
    pattern: String.raw`\b\d{13,19}\b`,
    type:    'Payment Card',
    label:   'Card number (PAN)',
    scope:   'organisation',
    status:  'active',
    addedBy: 'Michael Thornton',
    addedAt: '2026-02-14',
    active:  true,
  },
  {
    id:      't3',
    pattern: String.raw`\bACC-\d{5,6}\b`,
    type:    'Account Ref',
    label:   'Internal account reference',
    scope:   'organisation',
    status:  'active',
    addedBy: 'System',
    addedAt: '2026-01-08',
    active:  true,
  },
  {
    id:      't4',
    pattern: String.raw`(?i)\bvulnerable\s+customer\b`,
    type:    'Vulnerability Flag',
    label:   'Sensitive case context marker',
    scope:   'global',
    status:  'pending_review',
    addedBy: 'Amanda Kovacs',
    addedAt: '2026-04-18',
    active:  false,
  },
];

// ─── Shared primitives ────────────────────────────────────────────────────────
function Label({ children, htmlFor, required }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-medium mb-1.5"
      style={{ color: C.muted }}
    >
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function Input({ id, value, onChange, type = 'text', placeholder, disabled, className = '' }) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full text-sm rounded-md px-3 py-2 focus:outline-none transition-colors ${className}`}
      style={{
        background:  C.bg,
        border:      `1px solid ${C.border}`,
        color:       disabled ? C.muted : C.text,
        cursor:      disabled ? 'not-allowed' : undefined,
      }}
      onFocus={(e) => !disabled && (e.target.style.borderColor = 'rgba(124,58,237,0.5)')}
      onBlur={(e)  => (e.target.style.borderColor = C.border)}
    />
  );
}

function Select({ id, value, onChange, options }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-sm rounded-md px-3 py-2 focus:outline-none appearance-none"
      style={{
        background:  C.bg,
        border:      `1px solid ${C.border}`,
        color:       C.text,
        cursor:      'pointer',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ background: C.surface }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({ on, onChange, id }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative inline-flex items-center w-10 h-5 rounded-full transition-colors shrink-0"
      style={{ background: on ? C.purple : 'rgba(255,255,255,0.1)' }}
    >
      <span
        className="inline-block w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: on ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

function SectionHeading({ children }) {
  return (
    <p
      className="text-[10px] font-semibold uppercase tracking-widest mb-4"
      style={{ color: C.muted }}
    >
      {children}
    </p>
  );
}

function Divider() {
  return <div className="my-6" style={{ borderTop: `1px solid ${C.border}` }} />;
}

function Btn({ children, onClick, variant = 'ghost', disabled, type = 'button', loading }) {
  const base = 'text-sm font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = {
    ghost:   { color: C.muted },
    primary: { background: C.purple, color: '#fff' },
    outline: { border: `1px solid ${C.border}`, color: C.text },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={base}
      style={styles[variant]}
    >
      {loading ? 'Testing…' : children}
    </button>
  );
}

// ─── AI Configuration panel ───────────────────────────────────────────────────
const PROVIDERS = [
  { value: 'Claude',  label: 'Claude (Anthropic)' },
  { value: 'OpenAI',  label: 'OpenAI'             },
  { value: 'Gemini',  label: 'Gemini (Google)'    },
  { value: 'Custom',  label: 'Custom / Self-hosted' },
];

const DATA_TIERS = [
  {
    id:    'standard',
    label: 'Standard',
    desc:  "Third-party provider standard terms. Data may be used per provider's data processing agreement.",
  },
  {
    id:    'enterprise_zero',
    label: 'Enterprise zero retention',
    desc:  'Provider has contractually committed to zero data retention. Inputs are not stored or used for training.',
  },
  {
    id:    'self_hosted',
    label: 'Self-hosted',
    desc:  'Model runs on your own infrastructure. No data leaves your environment.',
  },
];

function ModelFieldGroup({ prefix, provider, model, apiKey, endpoint, onChange }) {
  const isCustom = provider === 'Custom';
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`${prefix}-provider`}>Provider</Label>
        <Select
          id={`${prefix}-provider`}
          value={provider}
          onChange={(v) => onChange('provider', v)}
          options={PROVIDERS}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-model`}>Model name</Label>
        <Input
          id={`${prefix}-model`}
          value={model}
          onChange={(v) => onChange('model', v)}
          placeholder="e.g. claude-sonnet-4-6"
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-key`}>API key</Label>
        <Input
          id={`${prefix}-key`}
          type="password"
          value={apiKey}
          onChange={(v) => onChange('apiKey', v)}
          placeholder="sk-…"
        />
        <p className="text-[10px] mt-1" style={{ color: C.muted }}>
          Stored encrypted at rest. Only the last four characters are displayed.
        </p>
      </div>
      {isCustom && (
        <div>
          <Label htmlFor={`${prefix}-endpoint`}>Endpoint URL</Label>
          <Input
            id={`${prefix}-endpoint`}
            value={endpoint}
            onChange={(v) => onChange('endpoint', v)}
            placeholder="https://your-model-host/v1/chat/completions"
          />
        </div>
      )}
    </div>
  );
}

function AiConfigPanel() {
  const [primary, setPrimary] = useState({
    provider: 'Claude',
    model:    'claude-sonnet-4-6',
    apiKey:   '****3AED',
    endpoint: '',
  });
  const [challenger, setChallenger] = useState({
    provider: 'OpenAI',
    model:    'gpt-4o',
    apiKey:   '****7F9B',
    endpoint: '',
  });
  const [routing,   setRouting]   = useState(30);
  const [dataTier,  setDataTier]  = useState('enterprise_zero');
  const [piiOn,     setPiiOn]     = useState(true);
  const [testState, setTestState] = useState(null); // null | 'loading' | 'ok' | 'err'
  const [saved,     setSaved]     = useState(false);

  function updatePrimary(field, value) {
    setPrimary((p) => {
      const next = { ...p, [field]: value };
      if (field === 'provider' && value === 'Custom') setDataTier('self_hosted');
      if (field === 'provider' && value !== 'Custom' && dataTier === 'self_hosted')
        setDataTier('standard');
      return next;
    });
  }

  function handleTest() {
    setTestState('loading');
    setTimeout(() => setTestState('ok'), 1500);
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-0">

      {/* Primary model */}
      <div
        className="rounded-lg p-6"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
      >
        <SectionHeading>Primary model</SectionHeading>
        <ModelFieldGroup
          prefix="primary"
          {...primary}
          onChange={updatePrimary}
        />
      </div>

      <div className="my-4" />

      {/* Challenger model */}
      <div
        className="rounded-lg p-6"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
      >
        <SectionHeading>Challenger model</SectionHeading>
        <ModelFieldGroup
          prefix="challenger"
          {...challenger}
          onChange={(field, value) => setChallenger((c) => ({ ...c, [field]: value }))}
        />

        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="routing-slider">
              Route this percentage of AI requests to challenger model for comparison
            </Label>
            <span
              className="text-lg font-semibold tabular-nums shrink-0 ml-4"
              style={{ color: routing > 0 ? C.purple : C.muted }}
            >
              {routing}%
            </span>
          </div>
          <input
            id="routing-slider"
            type="range"
            min={0}
            max={100}
            step={5}
            value={routing}
            onChange={(e) => setRouting(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${C.purple} ${routing}%, rgba(255,255,255,0.1) ${routing}%)`,
              accentColor: C.purple,
            }}
          />
          <div className="flex justify-between text-[10px]" style={{ color: C.muted }}>
            <span>0% — disabled</span>
            <span>100%</span>
          </div>
          {routing > 0 && (
            <p className="text-[11px] mt-1" style={{ color: C.muted }}>
              When set above 0, both models are tracked separately in the Analytics dashboard.
            </p>
          )}
        </div>
      </div>

      <div className="my-4" />

      {/* Data agreement tier */}
      <div
        className="rounded-lg p-6"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
      >
        <SectionHeading>Data agreement tier</SectionHeading>
        <div className="space-y-3">
          {DATA_TIERS.map((tier) => {
            const selected = dataTier === tier.id;
            return (
              <label
                key={tier.id}
                className="flex items-start gap-3 rounded-md px-4 py-3 cursor-pointer transition-colors"
                style={{
                  background:   selected ? 'rgba(124,58,237,0.08)' : C.bg,
                  border:       `1px solid ${selected ? 'rgba(124,58,237,0.3)' : C.border}`,
                }}
              >
                <input
                  type="radio"
                  name="data-tier"
                  value={tier.id}
                  checked={selected}
                  onChange={() => setDataTier(tier.id)}
                  className="mt-0.5 shrink-0"
                  style={{ accentColor: C.purple }}
                />
                <div>
                  <p className="text-sm font-medium" style={{ color: selected ? C.text : C.muted }}>
                    {tier.label}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                    {tier.desc}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="my-4" />

      {/* PII tokenisation toggle */}
      <div
        className="rounded-lg p-6"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-nuqe-text">
              Enable PII tokenisation before AI calls
            </p>
            <p className="text-xs mt-1" style={{ color: C.muted }}>
              When enabled, personally identifiable and sensitive data is replaced with tokens before
              leaving Nuqe and restored in the response. Recommended for all configurations.
            </p>
          </div>
          <Toggle on={piiOn} onChange={setPiiOn} id="pii-toggle" />
        </div>
      </div>

      <div className="my-4" />

      {/* Connection test + Save */}
      <div
        className="rounded-lg p-6 space-y-4"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
      >
        <SectionHeading>Connection</SectionHeading>
        <div className="flex items-center gap-3 flex-wrap">
          <Btn
            variant="outline"
            onClick={handleTest}
            loading={testState === 'loading'}
            disabled={testState === 'loading'}
          >
            Test connection
          </Btn>
          {testState === 'ok' && (
            <div
              className="flex items-center gap-2 rounded-md px-3 py-2"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
            >
              <span className="text-emerald-400 text-sm">✓</span>
              <span className="text-xs text-emerald-400 font-medium">
                Connection verified. {primary.model} responded in 340ms.
              </span>
            </div>
          )}
          {testState === 'err' && (
            <div
              className="flex items-center gap-2 rounded-md px-3 py-2"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <span className="text-red-400 text-sm">✕</span>
              <span className="text-xs text-red-400 font-medium">
                Connection failed. Check your API key and endpoint.
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: C.border }}>
          <Btn variant="primary" onClick={handleSave}>
            Save changes
          </Btn>
          {saved && (
            <span className="text-xs" style={{ color: C.ok }}>
              ✓ Settings saved
            </span>
          )}
        </div>
      </div>

    </div>
  );
}

// ─── Tokeniser Additions panel ─────────────────────────────────────────────────
function TypeBadge({ type }) {
  const colors = {
    'NI Number':        { color: C.blue,   bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.25)' },
    'Payment Card':     { color: C.danger, bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)' },
    'Account Ref':      { color: C.purple, bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.25)' },
    'Vulnerability Flag':{ color: C.warn,  bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)' },
  };
  const s = colors[type] ?? { color: C.muted, bg: 'rgba(255,255,255,0.05)', border: C.border };
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap"
      style={{ color: s.color, background: s.bg, borderColor: s.border }}
    >
      {type}
    </span>
  );
}

function ScopeBadge({ scope }) {
  return scope === 'global' ? (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border"
      style={{ color: C.purple, background: 'rgba(124,58,237,0.12)', borderColor: 'rgba(124,58,237,0.25)' }}
    >
      Global
    </span>
  ) : (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
      style={{ color: C.text, background: 'rgba(255,255,255,0.06)' }}
    >
      Organisation
    </span>
  );
}

function StatusBadge({ status }) {
  return status === 'active' ? (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border"
      style={{ color: C.ok, background: 'rgba(16,185,129,0.10)', borderColor: 'rgba(16,185,129,0.25)' }}
    >
      Active
    </span>
  ) : (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border"
      style={{ color: C.warn, background: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.25)' }}
    >
      Pending review
    </span>
  );
}

function SmallToggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="relative inline-flex items-center w-8 h-4 rounded-full transition-colors shrink-0"
      style={{ background: on ? C.purple : 'rgba(255,255,255,0.1)' }}
    >
      <span
        className="inline-block w-3 h-3 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: on ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

function TokeniserPanel() {
  const [tokens, setTokens] = useState(INITIAL_TOKENS);

  function toggleActive(id, val) {
    setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, active: val } : t)));
  }

  const TH = ({ children, right }) => (
    <th
      className={`px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap ${right ? 'text-right' : ''}`}
      style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}
    >
      {children}
    </th>
  );
  const TD = ({ children, mono, right }) => (
    <td
      className={`px-4 py-3 text-xs align-top ${mono ? 'font-mono' : ''} ${right ? 'text-right' : ''}`}
      style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}
    >
      {children}
    </td>
  );

  return (
    <div
      className="rounded-lg"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      {/* Header row */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: C.border }}
      >
        <div>
          <p className="text-sm font-semibold text-nuqe-text">Tokeniser Additions</p>
          <p className="text-xs mt-0.5" style={{ color: C.muted }}>
            Custom patterns added to the PII tokeniser for this organisation.
          </p>
        </div>
        <button
          className="text-xs font-medium px-3 py-1.5 rounded-md text-white transition-opacity hover:opacity-90"
          style={{ background: C.purple }}
        >
          + Add pattern
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <TH>Pattern</TH>
              <TH>Token type</TH>
              <TH>Label</TH>
              <TH>Scope</TH>
              <TH>Status</TH>
              <TH>Added by</TH>
              <TH>Date added</TH>
              <TH right>Active</TH>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id} style={{ opacity: t.active ? 1 : 0.5 }}>
                <TD mono>
                  <span
                    className="px-1.5 py-0.5 rounded text-[11px]"
                    style={{ background: C.bg, border: `1px solid ${C.border}` }}
                  >
                    {t.pattern}
                  </span>
                </TD>
                <TD><TypeBadge type={t.type} /></TD>
                <TD>
                  <span className="text-nuqe-text">{t.label}</span>
                </TD>
                <TD><ScopeBadge scope={t.scope} /></TD>
                <TD><StatusBadge status={t.status} /></TD>
                <TD>{t.addedBy}</TD>
                <TD>
                  {new Date(t.addedAt).toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })}
                </TD>
                <TD right>
                  <SmallToggle on={t.active} onChange={(v) => toggleActive(t.id, v)} />
                </TD>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Organisation Profile placeholder ────────────────────────────────────────
function OrgProfilePanel() {
  return (
    <div
      className="rounded-lg p-8 flex flex-col items-center justify-center text-center gap-2"
      style={{ background: C.surface, border: `1px solid ${C.border}`, minHeight: 240 }}
    >
      <p className="text-sm font-medium text-nuqe-text">Organisation Profile</p>
      <p className="text-xs" style={{ color: C.muted }}>
        Organisation name, contact details, and branding configuration.
      </p>
      <p className="text-[11px] mt-2 px-3 py-1 rounded" style={{ color: C.muted, background: C.bg }}>
        Coming soon
      </p>
    </div>
  );
}

// ─── Left nav ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'ai',        label: 'AI Configuration'    },
  { id: 'tokeniser', label: 'Tokeniser Additions'  },
  { id: 'org',       label: 'Organisation Profile' },
];

function SettingsNav({ active, onChange }) {
  return (
    <nav className="flex flex-col gap-0.5 w-48 shrink-0">
      {NAV_ITEMS.map(({ id, label }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="text-left text-sm px-3 py-2.5 rounded-md transition-colors"
            style={
              isActive
                ? { color: C.text, background: 'rgba(124,58,237,0.12)', fontWeight: 500 }
                : { color: C.muted }
            }
          >
            {isActive && (
              <span
                className="inline-block w-1 h-1 rounded-full mr-2 align-middle"
                style={{ background: C.purple }}
              />
            )}
            {label}
          </button>
        );
      })}
    </nav>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const [activePanel, setActivePanel] = useState('ai');

  return (
    <div className="p-6 min-h-full">

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-nuqe-text">Settings</h1>
        <p className="text-xs mt-0.5" style={{ color: C.muted }}>
          Organisation-wide configuration for AI, tokenisation, and compliance.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-8 items-start">
        <SettingsNav active={activePanel} onChange={setActivePanel} />

        <div className="flex-1 min-w-0">
          {activePanel === 'ai'        && <AiConfigPanel />}
          {activePanel === 'tokeniser' && <TokeniserPanel />}
          {activePanel === 'org'       && <OrgProfilePanel />}
        </div>
      </div>

    </div>
  );
}
