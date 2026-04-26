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
        background: C.bg,
        border:     `1px solid ${C.border}`,
        color:      disabled ? C.muted : C.text,
        cursor:     disabled ? 'not-allowed' : undefined,
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
        background: C.bg,
        border:     `1px solid ${C.border}`,
        color:      C.text,
        cursor:     'pointer',
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
    <p className="text-[10px] font-semibold uppercase tracking-widest mb-4" style={{ color: C.muted }}>
      {children}
    </p>
  );
}

function Btn({ children, onClick, variant = 'ghost', disabled, type = 'button', loading }) {
  const base = 'text-sm font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = {
    ghost:   { color: C.muted },
    primary: { background: C.purple, color: '#fff' },
    outline: { border: `1px solid ${C.border}`, color: C.text },
    danger:  { border: `1px solid rgba(239,68,68,0.3)`, color: C.danger },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={base}
      style={styles[variant] ?? styles.ghost}
    >
      {loading ? <span style={{ opacity: 0.7 }}>Loading…</span> : children}
    </button>
  );
}

function InlineBanner({ kind, children }) {
  const s = kind === 'ok'
    ? { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)',  color: C.ok }
    : { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',   color: C.danger };
  return (
    <div
      className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
    >
      <span>{kind === 'ok' ? '✓' : '✕'}</span>
      <span>{children}</span>
    </div>
  );
}

// ─── AI Configuration panel ───────────────────────────────────────────────────
const PROVIDERS = [
  { value: 'Claude',  label: 'Claude (Anthropic)'  },
  { value: 'OpenAI',  label: 'OpenAI'               },
  { value: 'Gemini',  label: 'Gemini (Google)'      },
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

const BLANK_MODEL = { provider: 'Claude', model: '', apiKey: '', endpoint: '' };

function isKeyMasked(key) {
  return key && key.startsWith('****');
}

function buildPayloadKey(key) {
  return isKeyMasked(key) ? undefined : key || undefined;
}

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
        <Label htmlFor={`${prefix}-model`} required>Model name</Label>
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
          placeholder={isKeyMasked(apiKey) ? 'Leave unchanged' : 'sk-…'}
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
  const [primary,    setPrimary]    = useState(BLANK_MODEL);
  const [challenger, setChallenger] = useState(BLANK_MODEL);
  const [routing,    setRouting]    = useState(0);
  const [dataTier,   setDataTier]   = useState('standard');
  const [piiOn,      setPiiOn]      = useState(true);

  const [configLoading, setConfigLoading] = useState(true);
  const [configError,   setConfigError]   = useState(null);

  const [testState,  setTestState]  = useState(null); // null | 'loading' | 'ok' | 'err'
  const [testMsg,    setTestMsg]    = useState('');
  const [saveState,  setSaveState]  = useState(null); // null | 'loading' | 'ok' | 'err'
  const [saveMsg,    setSaveMsg]    = useState('');
  const [validErr,   setValidErr]   = useState('');

  useEffect(() => {
    client.get('/api/v1/settings/ai-config')
      .then(({ data }) => {
        const d = data ?? {};
        setPrimary({
          provider: d.primary_provider            ?? d.ai_provider   ?? d.primary?.provider ?? 'Claude',
          model:    d.primary_model               ?? d.ai_model      ?? d.primary?.model    ?? '',
          apiKey:   d.primary_api_key_encrypted   ?? d.primary_key   ?? d.primary?.api_key  ?? '',
          endpoint: d.primary_endpoint_url        ?? d.endpoint      ?? d.primary?.endpoint ?? '',
        });
        setChallenger({
          provider: d.challenger_provider             ?? d.challenger?.provider ?? 'Claude',
          model:    d.challenger_model                ?? d.challenger?.model    ?? '',
          apiKey:   d.challenger_api_key_encrypted    ?? d.challenger_key       ?? d.challenger?.api_key  ?? '',
          endpoint: d.challenger_endpoint_url         ?? d.challenger_endpoint  ?? d.challenger?.endpoint ?? '',
        });
        setRouting(d.challenger_percentage ?? d.routing_pct  ?? d.ab_split  ?? 0);
        setDataTier(d.data_agreement_tier  ?? d.data_tier    ?? 'standard');
        setPiiOn(d.tokenisation_enabled    ?? d.pii_tokenisation ?? d.pii_enabled ?? true);
      })
      .catch((err) => {
        setConfigError(err.response?.data?.error ?? err.message ?? 'Failed to load config');
      })
      .finally(() => setConfigLoading(false));
  }, []);

  function updatePrimary(field, value) {
    setPrimary((p) => {
      const next = { ...p, [field]: value };
      if (field === 'provider' && value === 'Custom') setDataTier('self_hosted');
      if (field === 'provider' && value !== 'Custom' && dataTier === 'self_hosted')
        setDataTier('standard');
      return next;
    });
  }

  async function handleTest() {
    setTestState('loading');
    setTestMsg('');
    try {
      const { data } = await client.post('/api/v1/settings/ai-config/test');
      const ms    = data.response_time_ms ?? data.latency_ms ?? data.responseTime ?? '—';
      const model = data.model ?? primary.model;
      setTestMsg(`${model} responded in ${ms}ms.`);
      setTestState('ok');
    } catch (err) {
      setTestMsg(err.response?.data?.error ?? 'Check your API key and endpoint.');
      setTestState('err');
    }
  }

  async function handleSave() {
    setValidErr('');
    if (!primary.model.trim()) {
      setValidErr('Primary model name is required.');
      return;
    }
    setSaveState('loading');
    setSaveMsg('');
    try {
      const payload = {
        ai_provider:          primary.provider,
        ai_model:             primary.model,
        challenger_provider:  challenger.provider,
        challenger_model:     challenger.model,
        routing_pct:          routing,
        data_tier:            dataTier,
        pii_tokenisation:     piiOn,
      };
      const pk = buildPayloadKey(primary.apiKey);
      const ck = buildPayloadKey(challenger.apiKey);
      if (pk) payload.primary_key    = pk;
      if (ck) payload.challenger_key = ck;
      if (primary.endpoint)    payload.endpoint             = primary.endpoint;
      if (challenger.endpoint) payload.challenger_endpoint  = challenger.endpoint;

      await client.post('/api/v1/settings/ai-config', payload);
      setSaveMsg('Settings saved.');
      setSaveState('ok');
    } catch (err) {
      setSaveMsg(err.response?.data?.error ?? 'Save failed. Please try again.');
      setSaveState('err');
    }
    setTimeout(() => setSaveState(null), 4000);
  }

  if (configLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg p-6"
            style={{ background: C.surface, border: `1px solid ${C.border}`, opacity: 1 - i * 0.2 }}
          >
            <div className="h-3 w-24 rounded mb-4" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="space-y-3">
              {[1, 2].map((j) => (
                <div key={j} className="h-9 rounded-md" style={{ background: 'rgba(255,255,255,0.05)' }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (configError) {
    return (
      <div
        className="rounded-lg p-6 text-sm"
        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', color: C.danger }}
      >
        Failed to load AI configuration: {configError}
      </div>
    );
  }

  return (
    <div className="space-y-0">

      {validErr && (
        <div
          className="rounded-md px-4 py-3 mb-4 text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: C.danger }}
        >
          {validErr}
        </div>
      )}

      {/* Primary model */}
      <div className="rounded-lg p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <SectionHeading>Primary model</SectionHeading>
        <ModelFieldGroup prefix="primary" {...primary} onChange={updatePrimary} />
      </div>

      <div className="my-4" />

      {/* Challenger model */}
      <div className="rounded-lg p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
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
              background:  `linear-gradient(to right, ${C.purple} ${routing}%, rgba(255,255,255,0.1) ${routing}%)`,
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
      <div className="rounded-lg p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <SectionHeading>Data agreement tier</SectionHeading>
        <div className="space-y-3">
          {DATA_TIERS.map((tier) => {
            const selected = dataTier === tier.id;
            return (
              <label
                key={tier.id}
                className="flex items-start gap-3 rounded-md px-4 py-3 cursor-pointer transition-colors"
                style={{
                  background: selected ? 'rgba(124,58,237,0.08)' : C.bg,
                  border:     `1px solid ${selected ? 'rgba(124,58,237,0.3)' : C.border}`,
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
                  <p className="text-xs mt-0.5" style={{ color: C.muted }}>{tier.desc}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="my-4" />

      {/* PII tokenisation toggle */}
      <div className="rounded-lg p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: C.text }}>
              Enable PII tokenisation before AI calls
            </p>
            <p className="text-xs mt-1" style={{ color: C.muted }}>
              Personally identifiable data is replaced with tokens before leaving Nuqe and restored in the
              response. Recommended for all configurations.
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
          {testState === 'ok'  && <InlineBanner kind="ok">{testMsg}</InlineBanner>}
          {testState === 'err' && <InlineBanner kind="err">{testMsg}</InlineBanner>}
        </div>

        <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: C.border }}>
          <Btn
            variant="primary"
            onClick={handleSave}
            loading={saveState === 'loading'}
            disabled={saveState === 'loading'}
          >
            Save changes
          </Btn>
          {saveState === 'ok'  && <InlineBanner kind="ok">{saveMsg}</InlineBanner>}
          {saveState === 'err' && <InlineBanner kind="err">{saveMsg}</InlineBanner>}
        </div>
      </div>

    </div>
  );
}

// ─── Add Pattern Modal ─────────────────────────────────────────────────────────
const TOKEN_TYPES = ['NI Number', 'Payment Card', 'Account Ref', 'Vulnerability Flag', 'Custom'];
const BLANK_PATTERN = { pattern: '', type: 'Custom', label: '', scope: 'organisation' };

function AddPatternModal({ onClose, onAdded }) {
  const [form,    setForm]    = useState(BLANK_PATTERN);
  const [saving,  setSaving]  = useState(false);
  const [errMsg,  setErrMsg]  = useState('');

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.pattern.trim()) { setErrMsg('Pattern is required.'); return; }
    if (!form.label.trim())   { setErrMsg('Label is required.');   return; }
    setSaving(true);
    setErrMsg('');
    try {
      const { data } = await client.post('/api/v1/tokeniser/additions', {
        pattern: form.pattern,
        type:    form.type,
        label:   form.label,
        scope:   form.scope,
      });
      onAdded(data);
      onClose();
    } catch (err) {
      setErrMsg(err.response?.data?.error ?? 'Failed to add pattern.');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        className="rounded-xl p-6 w-full max-w-md space-y-4"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold" style={{ color: C.text }}>Add tokeniser pattern</p>
          <button type="button" onClick={onClose} className="text-lg leading-none" style={{ color: C.muted }}>×</button>
        </div>

        {errMsg && (
          <div
            className="rounded-md px-3 py-2 text-xs"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: C.danger }}
          >
            {errMsg}
          </div>
        )}

        <div>
          <Label htmlFor="ap-pattern" required>Regex pattern</Label>
          <Input
            id="ap-pattern"
            value={form.pattern}
            onChange={(v) => set('pattern', v)}
            placeholder={String.raw`\bACC-\d{5,6}\b`}
            className="font-mono"
          />
        </div>
        <div>
          <Label htmlFor="ap-type">Token type</Label>
          <Select
            id="ap-type"
            value={form.type}
            onChange={(v) => set('type', v)}
            options={TOKEN_TYPES.map((t) => ({ value: t, label: t }))}
          />
        </div>
        <div>
          <Label htmlFor="ap-label" required>Label</Label>
          <Input
            id="ap-label"
            value={form.label}
            onChange={(v) => set('label', v)}
            placeholder="Human-readable description"
          />
        </div>
        <div>
          <Label htmlFor="ap-scope">Scope</Label>
          <Select
            id="ap-scope"
            value={form.scope}
            onChange={(v) => set('scope', v)}
            options={[
              { value: 'organisation', label: 'Organisation' },
              { value: 'global',       label: 'Global'       },
            ]}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Btn variant="ghost" onClick={onClose} type="button">Cancel</Btn>
          <Btn variant="primary" type="submit" loading={saving} disabled={saving}>Add pattern</Btn>
        </div>
      </form>
    </div>
  );
}

// ─── Tokeniser Additions panel ─────────────────────────────────────────────────
function TypeBadge({ type }) {
  const colors = {
    'NI Number':          { color: C.blue,   bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.25)' },
    'Payment Card':       { color: C.danger, bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)'  },
    'Account Ref':        { color: C.purple, bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.25)' },
    'Vulnerability Flag': { color: C.warn,   bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)' },
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

function SmallToggle({ on, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      className="relative inline-flex items-center w-8 h-4 rounded-full transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: on ? C.purple : 'rgba(255,255,255,0.1)' }}
    >
      <span
        className="inline-block w-3 h-3 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: on ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

function normalizeToken(raw) {
  return {
    id:      raw.id      ?? raw._id,
    pattern: raw.pattern ?? '',
    type:    raw.type    ?? raw.token_type ?? 'Custom',
    label:   raw.label   ?? '',
    scope:   raw.scope   ?? 'organisation',
    status:  raw.status  ?? (raw.active ? 'active' : 'pending_review'),
    addedBy: raw.added_by ?? raw.addedBy ?? 'System',
    addedAt: raw.added_at ?? raw.addedAt ?? raw.created_at ?? '',
    active:  raw.active  ?? (raw.status === 'active'),
  };
}

function TokeniserPanel() {
  const [tokens,     setTokens]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [showModal,  setShowModal]  = useState(false);
  const [toggling,   setToggling]   = useState(new Set());

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.get('/api/v1/tokeniser/additions');
      const raw = Array.isArray(data) ? data : (data.additions ?? data.tokens ?? []);
      setTokens(raw.map(normalizeToken));
    } catch (err) {
      setError(err.response?.data?.error ?? err.message ?? 'Failed to load tokeniser additions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  async function handleToggle(id, value) {
    setToggling((s) => new Set([...s, id]));
    try {
      await client.patch(`/api/v1/tokeniser/additions/${id}`, { active: value });
      setTokens((prev) => prev.map((t) => t.id === id ? { ...t, active: value } : t));
    } catch {
      // revert silently — toggle snaps back
    } finally {
      setToggling((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  function handleAdded(raw) {
    setTokens((prev) => [normalizeToken(raw), ...prev]);
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
    <>
      {showModal && <AddPatternModal onClose={() => setShowModal(false)} onAdded={handleAdded} />}

      <div className="rounded-lg" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.border }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: C.text }}>Tokeniser Additions</p>
            <p className="text-xs mt-0.5" style={{ color: C.muted }}>
              Custom patterns added to the PII tokeniser for this organisation.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-md text-white transition-opacity hover:opacity-90"
            style={{ background: C.purple }}
          >
            + Add pattern
          </button>
        </div>

        {/* States */}
        {loading && (
          <div className="px-5 py-10 text-center text-xs" style={{ color: C.muted }}>
            Loading…
          </div>
        )}
        {!loading && error && (
          <div className="px-5 py-6 text-xs" style={{ color: C.danger }}>
            {error}
            <button onClick={fetchTokens} className="ml-3 underline" style={{ color: C.muted }}>
              Retry
            </button>
          </div>
        )}
        {!loading && !error && tokens.length === 0 && (
          <div className="px-5 py-10 text-center text-xs" style={{ color: C.muted }}>
            No custom tokeniser patterns yet. Add a pattern to get started.
          </div>
        )}

        {/* Table */}
        {!loading && !error && tokens.length > 0 && (
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
                    <TD><span style={{ color: C.text }}>{t.label}</span></TD>
                    <TD><ScopeBadge scope={t.scope} /></TD>
                    <TD><StatusBadge status={t.status} /></TD>
                    <TD>{t.addedBy}</TD>
                    <TD>
                      {t.addedAt
                        ? new Date(t.addedAt).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })
                        : '—'}
                    </TD>
                    <TD right>
                      <SmallToggle
                        on={t.active}
                        onChange={(v) => handleToggle(t.id, v)}
                        disabled={toggling.has(t.id)}
                      />
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Organisation Profile panel ──────────────────────────────────────────────

const JURISDICTIONS = [
  {
    id:    'UK',
    label: 'United Kingdom — FCA',
    desc:  'Financial Conduct Authority. DISP, CONC, PRIN, Consumer Duty, PROD, PSR.',
  },
  {
    id:    'IN',
    label: 'India — RBI',
    desc:  'Reserve Bank of India. Fair Practices Code, NBFC guidelines.',
  },
  {
    id:    'EU',
    label: 'European Union — EBA',
    desc:  'European Banking Authority. ADR Directive, PSD2, MiFID II.',
  },
];

function OrgProfilePanel() {
  const [form,      setForm]      = useState({
    enabled_jurisdictions: ['UK'],
    from_email:            '',
    org_name:              '',
    fca_firm_reference:    '',
  });
  const [loading,   setLoading]   = useState(true);
  const [saveState, setSaveState] = useState(null);
  const [saveMsg,   setSaveMsg]   = useState('');
  const [validErr,  setValidErr]  = useState('');

  useEffect(() => {
    client.get('/api/v1/settings/org-profile')
      .then(({ data }) => {
        setForm({
          enabled_jurisdictions: data.enabled_jurisdictions ?? ['UK'],
          from_email:            data.from_email            ?? '',
          org_name:              data.org_name              ?? '',
          fca_firm_reference:    data.fca_firm_reference    ?? '',
        });
      })
      .catch(() => {/* keep defaults */})
      .finally(() => setLoading(false));
  }, []);

  function toggleJurisdiction(id) {
    setForm((f) => {
      const active = f.enabled_jurisdictions ?? [];
      const next   = active.includes(id)
        ? active.filter((j) => j !== id)
        : [...active, id];
      return { ...f, enabled_jurisdictions: next };
    });
  }

  async function handleSave() {
    setValidErr('');
    if (!form.enabled_jurisdictions?.length) {
      setValidErr('At least one jurisdiction must be enabled.');
      return;
    }
    setSaveState('loading');
    setSaveMsg('');
    try {
      await client.patch('/api/v1/settings/org-profile', {
        enabled_jurisdictions: form.enabled_jurisdictions,
        from_email:            form.from_email  || null,
        org_name:              form.org_name    || null,
        fca_firm_reference:    form.fca_firm_reference || null,
      });
      setSaveMsg('Profile saved.');
      setSaveState('ok');
    } catch (err) {
      setSaveMsg(err.response?.data?.error ?? 'Save failed.');
      setSaveState('err');
    }
    setTimeout(() => setSaveState(null), 4000);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg p-6"
            style={{ background: C.surface, border: `1px solid ${C.border}`, opacity: 1 - i * 0.3 }}
          >
            <div className="h-3 w-32 rounded mb-4" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="space-y-3">
              {[1, 2].map((j) => (
                <div key={j} className="h-9 rounded-md" style={{ background: 'rgba(255,255,255,0.05)' }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0">

      {validErr && (
        <div
          className="rounded-md px-4 py-3 mb-4 text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: C.danger }}
        >
          {validErr}
        </div>
      )}

      {/* Regulatory jurisdictions */}
      <div className="rounded-lg p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <SectionHeading>Regulatory jurisdictions</SectionHeading>
        <p className="text-xs mb-4" style={{ color: C.muted }}>
          Enable the regulatory frameworks active for this organisation. The RAG engine and AI
          suggestions will be scoped to enabled jurisdictions only.
        </p>
        <div className="space-y-3">
          {JURISDICTIONS.map((j) => {
            const enabled = (form.enabled_jurisdictions ?? []).includes(j.id);
            return (
              <div
                key={j.id}
                className="flex items-start gap-4 rounded-md px-4 py-3 transition-colors"
                style={{
                  background: enabled ? 'rgba(124,58,237,0.08)' : C.bg,
                  border:     `1px solid ${enabled ? 'rgba(124,58,237,0.3)' : C.border}`,
                }}
              >
                <Toggle on={enabled} onChange={() => toggleJurisdiction(j.id)} id={`jur-${j.id}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: enabled ? C.text : C.muted }}>
                    {j.label}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: C.muted }}>{j.desc}</p>
                </div>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 mt-0.5"
                  style={
                    enabled
                      ? { color: C.ok,   background: 'rgba(16,185,129,0.10)', borderColor: 'rgba(16,185,129,0.25)' }
                      : { color: C.muted, background: 'rgba(255,255,255,0.04)', borderColor: C.border }
                  }
                >
                  {enabled ? 'Active' : 'Off'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="my-4" />

      {/* Firm details */}
      <div className="rounded-lg p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <SectionHeading>Firm details</SectionHeading>
        <div className="space-y-4">
          <div>
            <Label htmlFor="org-name">Organisation name</Label>
            <Input
              id="org-name"
              value={form.org_name}
              onChange={(v) => setForm((f) => ({ ...f, org_name: v }))}
              placeholder="Acme Financial Services Ltd"
            />
          </div>
          <div>
            <Label htmlFor="fca-ref">FCA firm reference number</Label>
            <Input
              id="fca-ref"
              value={form.fca_firm_reference}
              onChange={(v) => setForm((f) => ({ ...f, fca_firm_reference: v }))}
              placeholder="123456"
            />
            <p className="text-[10px] mt-1" style={{ color: C.muted }}>
              Used in outbound correspondence footers for FCA compliance.
            </p>
          </div>
        </div>
      </div>

      <div className="my-4" />

      {/* Email sending */}
      <div className="rounded-lg p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <SectionHeading>Outbound email</SectionHeading>
        <div>
          <Label htmlFor="from-email">From address</Label>
          <Input
            id="from-email"
            type="email"
            value={form.from_email}
            onChange={(v) => setForm((f) => ({ ...f, from_email: v }))}
            placeholder="complaints@yourfirm.com"
          />
          <p className="text-[10px] mt-1" style={{ color: C.muted }}>
            Outbound case responses are sent from this address via Resend. Must be a verified sender
            domain. Leave blank to use the platform default.
          </p>
        </div>
      </div>

      <div className="my-4" />

      {/* Save */}
      <div className="rounded-lg p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-3">
          <Btn
            variant="primary"
            onClick={handleSave}
            loading={saveState === 'loading'}
            disabled={saveState === 'loading'}
          >
            Save profile
          </Btn>
          {saveState === 'ok'  && <InlineBanner kind="ok">{saveMsg}</InlineBanner>}
          {saveState === 'err' && <InlineBanner kind="err">{saveMsg}</InlineBanner>}
        </div>
      </div>

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
      <div className="mb-6">
        <h1 className="text-lg font-semibold" style={{ color: C.text }}>Settings</h1>
        <p className="text-xs mt-0.5" style={{ color: C.muted }}>
          Organisation-wide configuration for AI, tokenisation, and compliance.
        </p>
      </div>

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
