import { useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCase }           from '../hooks/useCase';
import { useCommunications } from '../hooks/useCommunications';
import { useAiActions }      from '../hooks/useAiActions';
import client                from '../api/client';
import ErrorBanner           from './shared/ErrorBanner';
import EmailComposer         from './EmailComposer';

// ─── Data normalisers (API snake_case ↔ component camelCase) ─────────────────

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function relativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return fmtTime(iso);
}

function normalizeMilestone(raw, idx) {
  const dueSrc   = raw.due_date  ?? raw.due_at;
  const metSrc   = raw.met_date  ?? raw.met_at;
  const daysLeft = dueSrc
    ? Math.ceil((new Date(dueSrc) - new Date()) / 86400000)
    : (raw.days_left ?? raw.daysLeft ?? null);
  const status = metSrc ? 'met'
    : (raw.breached || (daysLeft !== null && daysLeft <= 0)) ? 'breached'
    : (raw.status ?? 'pending');
  return {
    id:        raw.id        ?? `m${idx}`,
    label:     raw.label     ?? raw.milestone_type ?? raw.deadline_type ?? '—',
    rule:      raw.rule      ?? raw.ruleset_ref    ?? '',
    dueDate:   dueSrc ? fmtTime(dueSrc)  : (raw.dueDate  ?? '—'),
    status,
    metDate:   metSrc ? fmtTime(metSrc)  : (raw.metDate  ?? null),
    daysLeft,
    daysTotal: raw.days_total ?? raw.daysTotal ?? null,
    note:      raw.note      ?? null,
  };
}

function normalizeCase(raw) {
  if (!raw) return null;
  return {
    id:           raw.case_id ?? raw.id,
    caseRef:      raw.case_ref ?? raw.caseRef,
    customer: {
      name:          raw.customer_name  ?? raw.customer?.name  ?? '—',
      ref:           raw.customer_ref   ?? raw.account_ref     ?? raw.customer?.ref   ?? '—',
      loanRef:       raw.loan_ref       ?? raw.customer?.loanRef ?? '—',
      email:         raw.customer_email ?? raw.customer?.email ?? null,
      vulnerableFlag: raw.vulnerable_flag ?? raw.customer?.vulnerableFlag ?? false,
    },
    category:        raw.category        ?? raw.issue          ?? '—',
    jurisdiction:    raw.jurisdiction    ?? 'UK / FCA',
    status:          raw.status          ?? 'open',
    handler:         raw.handler         ?? raw.assigned_handler ?? '—',
    openedAt:        raw.opened_at ? fmtTime(raw.opened_at) : (raw.openedAt ?? '—'),
    channelReceived: raw.channel_received ?? raw.channelReceived ?? '—',
    notes:           raw.notes           ?? '',
    milestones:      (raw.deadlines ?? raw.milestones ?? []).map(normalizeMilestone),
  };
}

function normalizeAiAction(raw) {
  return {
    id:         raw.id,
    type:       raw.action_type ?? raw.type       ?? '',
    status:     raw.status      ?? 'pending',
    model:      raw.ai_model    ?? raw.model       ?? '—',
    confidence: raw.confidence  ?? 0,
    summary:    raw.ai_output   ?? raw.summary     ?? '',
    createdAt:  raw.created_at ? fmtTime(raw.created_at) : (raw.createdAt ?? '—'),
  };
}

function normalizeComm(raw, normalizedActions) {
  // Derive pending/approved/rejected state by cross-referencing ai_actions
  let state = raw.state ?? 'normal';
  const aiActionId = raw.ai_action_id ?? raw.aiActionId ?? null;

  if (raw.ai_generated || raw.aiGenerated) {
    // If the comm record already carries an approval timestamp, trust it and
    // don't re-derive state from the ai_actions list (prevents a sibling
    // pending action from overriding an already-approved comm).
    if (raw.ai_approved_at) {
      state = 'approved_ai';
    } else {
      const linked = aiActionId
        ? normalizedActions.find((a) => a.id === aiActionId)
        : normalizedActions.find((a) => a.type === 'response_draft');

      if (linked) {
        if (linked.status === 'pending')  state = 'pending_ai';
        else if (linked.status === 'approved') state = 'approved_ai';
        else if (linked.status === 'rejected') state = 'rejected_ai';
      }
    }
  }

  return {
    id:             raw.id,
    direction:      raw.direction,
    channel:        raw.channel,
    isInternal:     raw.is_internal ?? false,
    sender:         raw.author_name   ?? raw.sender ?? (raw.direction === 'inbound' ? 'Customer' : 'Staff'),
    time:           raw.sent_at ? relativeTime(raw.sent_at) : raw.created_at ? relativeTime(raw.created_at) : (raw.time ?? '—'),
    subject:        raw.subject       ?? null,
    body:           raw.body_plain    ?? raw.body ?? '',
    deliveryStatus: raw.delivery_status ?? null,
    state,
    aiModel:        raw.ai_model      ?? raw.aiModel      ?? null,
    confidence:     raw.confidence    ?? null,
    aiActionId,
  };
}

// ─── Channel icons ────────────────────────────────────────────────────────────

function IconEmail() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <rect x="2" y="4" width="12" height="9" rx="1" />
      <path d="M2 5l6 4.5L14 5" strokeLinecap="round" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v5A1.5 1.5 0 0112.5 10H9l-3 3v-3H3.5A1.5 1.5 0 012 8.5v-5z" strokeLinejoin="round" />
    </svg>
  );
}
function IconPostal() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <path d="M3 4h10a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1z" />
      <path d="M8 8L2 4.5M8 8l6-3.5" strokeLinecap="round" />
    </svg>
  );
}

function ChannelIcon({ channel }) {
  const colour = { email: 'text-blue-400', chat: 'text-emerald-400', postal: 'text-amber-400' }[channel] ?? 'text-nuqe-muted';
  return (
    <span className={`shrink-0 ${colour}`}>
      {channel === 'email' ? <IconEmail /> : channel === 'chat' ? <IconChat /> : <IconPostal />}
    </span>
  );
}

// ─── Milestone item ───────────────────────────────────────────────────────────

function MilestoneItem({ milestone: m }) {
  const cfg = {
    met:     { icon: '✓', colour: 'text-nuqe-ok',    bar: 'bg-nuqe-ok',    desc: `Met ${m.metDate}`                         },
    pending: { icon: '◐', colour: 'text-nuqe-warn',  bar: 'bg-nuqe-warn',  desc: `${m.daysLeft} day${m.daysLeft !== 1 ? 's' : ''} remaining` },
    breached:{ icon: '!', colour: 'text-nuqe-danger', bar: 'bg-nuqe-danger',desc: `${Math.abs(m.daysLeft)} days overdue`      },
  }[m.status] ?? { icon: '◐', colour: 'text-nuqe-muted', bar: 'bg-nuqe-muted', desc: '—' };

  const pct = m.daysTotal
    ? Math.min(100, ((m.daysTotal - (m.daysLeft ?? 0)) / m.daysTotal) * 100)
    : m.status === 'met' ? 100 : null;

  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold ${cfg.colour}`}>{cfg.icon}</span>
          <p className="text-xs font-medium text-nuqe-text">{m.label}</p>
        </div>
        <span className="text-[10px] text-nuqe-muted font-mono">{m.rule}</span>
      </div>
      <p className="text-[11px] text-nuqe-muted mb-1">Due: {m.dueDate}</p>
      <p className={`text-[11px] font-semibold ${cfg.colour}`}>{cfg.desc}</p>
      {pct !== null && (
        <div className="mt-2 h-1 bg-white/8 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${cfg.bar}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {m.note && <p className="text-[10px] text-nuqe-muted mt-1.5 italic">{m.note}</p>}
    </div>
  );
}

// ─── Communication card ───────────────────────────────────────────────────────

const PREVIEW = 340;

const DELIVERY_DOT = {
  sent:      { cls: 'bg-nuqe-muted',    title: 'Sent' },
  delivered: { cls: 'bg-blue-400',      title: 'Delivered' },
  opened:    { cls: 'bg-nuqe-ok',       title: 'Opened' },
  bounced:   { cls: 'bg-nuqe-danger',   title: 'Bounced' },
  failed:    { cls: 'bg-nuqe-danger',   title: 'Failed' },
};

function CommCard({ comm, expanded, onToggle, onApprove, onReject, onEdit, submitting }) {
  const isPending  = comm.state === 'pending_ai';
  const isApproved = comm.state === 'approved_ai';
  const isRejected = comm.state === 'rejected_ai';
  const isInternal = comm.isInternal;

  const [detokenised, setDetokenised] = useState(null);
  const [detokenising, setDetokenising] = useState(false);
  async function handleDetokenise() {
    if (detokenised) { setDetokenised(null); return; }
    setDetokenising(true);
    try {
      const { data } = await client.get(`/api/v1/communications/${comm.id}/detokenise`);
      setDetokenised(data.body_plain ?? data.body ?? '');
    } catch { /* silently ignore — user sees tokenised version */ }
    finally { setDetokenising(false); }
  }

  const chColour = { email: 'text-blue-400', chat: 'text-emerald-400', postal: 'text-amber-400' }[comm.channel];
  const displayBody = detokenised ?? comm.body;
  const isLong   = displayBody.length > PREVIEW;
  const bodyText = isLong && !expanded ? displayBody.slice(0, PREVIEW) + '…' : displayBody;

  const borderCls = isInternal
    ? 'border-amber-500/20'
    : isPending
    ? 'border-amber-500/30'
    : isRejected
    ? 'border-white/5 opacity-50'
    : 'border-white/5';

  const deliveryDot = comm.deliveryStatus ? DELIVERY_DOT[comm.deliveryStatus] : null;

  return (
    <div className={`rounded-lg border ${borderCls} overflow-hidden bg-nuqe-surface`}>

      {/* Card header */}
      <div
        className={`flex items-start justify-between gap-4 px-4 py-3 border-b border-white/5 ${
          isInternal ? 'bg-amber-500/[0.04]'
          : isPending ? 'bg-amber-500/[0.04]'
          : 'bg-white/[0.02]'
        }`}
        style={isPending ? { animation: 'pending-pulse 2.8s ease-in-out infinite' } : undefined}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChannelIcon channel={comm.channel} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-nuqe-text leading-tight">{comm.sender}</span>

              {isInternal && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  🔒 Internal note
                </span>
              )}
              {isPending && !isInternal && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Pending review
                </span>
              )}
              {isApproved && (
                <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-nuqe-ok/15 text-nuqe-ok border border-nuqe-ok/30">
                  Approved
                </span>
              )}
              {isRejected && (
                <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-nuqe-danger/15 text-nuqe-danger border border-nuqe-danger/30">
                  Rejected
                </span>
              )}
              {comm.aiModel && (
                <span className="text-[10px] font-mono text-nuqe-muted">{comm.aiModel}</span>
              )}
              {comm.confidence != null && (
                <span className="text-[10px] text-nuqe-muted">{Math.round(comm.confidence * 100)}% confidence</span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${chColour}`}>
                {comm.channel}
              </span>
              <span className="text-[10px] text-nuqe-muted">
                {comm.direction === 'inbound' ? '↙ Inbound' : '↗ Outbound'}
              </span>
              {comm.subject && (
                <span className="text-[10px] text-nuqe-muted truncate">· {comm.subject}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {deliveryDot && (
            <span
              title={deliveryDot.title}
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${deliveryDot.cls}`}
            />
          )}
          <span className="text-[11px] text-nuqe-muted tabular-nums">{comm.time}</span>
        </div>
      </div>

      {/* Message body */}
      <div
        className={`px-4 py-3 ${isPending ? 'opacity-60' : ''}`}
        style={isPending ? { animation: 'pending-pulse 2.8s ease-in-out infinite' } : undefined}
      >
        <pre className="text-xs text-nuqe-text whitespace-pre-wrap leading-relaxed font-sans">
          {bodyText}
        </pre>
        <div className="flex items-center gap-3 mt-2">
          {isLong && (
            <button onClick={onToggle} className="text-[11px] text-nuqe-purple hover:underline">
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
          {comm.direction === 'inbound' && (
            <button
              onClick={handleDetokenise}
              disabled={detokenising}
              className="text-[11px] text-nuqe-muted hover:text-nuqe-text transition-colors disabled:opacity-40"
            >
              {detokenising ? 'Restoring…' : detokenised ? '🔒 Hide PII' : '🔓 Show PII'}
            </button>
          )}
        </div>
      </div>

      {/* Pending AI action row */}
      {isPending && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-white/5 bg-nuqe-bg/50">
          <button
            onClick={onApprove}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium rounded border border-nuqe-ok/30 bg-nuqe-ok/10 text-nuqe-ok hover:bg-nuqe-ok/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting === 'approve' ? 'Approving…' : 'Approve'}
          </button>
          <button
            onClick={onEdit}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium rounded border border-nuqe-purple/30 bg-nuqe-purple/10 text-nuqe-purple hover:bg-nuqe-purple/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Edit &amp; Approve
          </button>
          <button
            onClick={onReject}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium rounded border border-nuqe-danger/30 bg-nuqe-danger/10 text-nuqe-danger hover:bg-nuqe-danger/20 transition-colors ml-auto disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Timeline loading skeleton ────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 0.75, 0.55].map((opacity, i) => (
        <div
          key={i}
          className="rounded-lg border border-white/5 overflow-hidden bg-nuqe-surface"
          style={{ opacity, animation: 'skeleton-pulse 1.6s ease-in-out infinite' }}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
            <div className="w-3.5 h-3.5 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="h-3 w-28 rounded"   style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="h-3 w-16 rounded ml-auto" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <div className="px-4 py-3 space-y-1.5">
            <div className="h-2.5 w-full rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div className="h-2.5 w-4/5 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
            <div className="h-2.5 w-2/3 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Right panel — Case details tab ──────────────────────────────────────────

function DetailRow({ label, value, mono, accent }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-nuqe-muted mb-1">{label}</p>
      <p className={`text-sm leading-snug ${mono ? 'font-mono' : ''} ${accent ?? 'text-nuqe-text'}`}>{value}</p>
    </div>
  );
}

function DetailsTab({ caseData }) {
  const [notes, setNotes] = useState(caseData.notes);
  return (
    <div className="space-y-5">
      <DetailRow label="Assigned handler"  value={caseData.handler}         />
      <DetailRow label="Date opened"       value={caseData.openedAt}        />
      <DetailRow label="Channel received"  value={caseData.channelReceived} />
      <DetailRow
        label="Vulnerability"
        value={caseData.customer.vulnerableFlag ? '⚠ Flagged' : 'Not flagged'}
        accent={caseData.customer.vulnerableFlag ? 'text-amber-400 font-medium' : 'text-nuqe-muted'}
      />
      <DetailRow label="Loan reference" value={caseData.customer.loanRef} mono />

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-nuqe-muted mb-2">
          Internal notes
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={7}
          className="w-full px-3 py-2 text-xs bg-nuqe-bg border border-white/10 rounded text-nuqe-text placeholder-nuqe-muted focus:outline-none focus:border-nuqe-purple/40 resize-none leading-relaxed"
        />
        <button className="mt-2 text-[11px] px-2.5 py-1 rounded border border-white/10 text-nuqe-muted hover:text-nuqe-text transition-colors">
          Save note
        </button>
      </div>
    </div>
  );
}

// ─── Right panel — AI actions tab ────────────────────────────────────────────

const AI_TYPE_LABELS = {
  complaint_classification:     'Classification',
  implicit_complaint_detection: 'Implicit detect',
  response_draft:               'Response draft',
  ruleset_impact_assessment:    'Ruleset impact',
};

const AI_STATUS_CFG = {
  pending:  { cls: 'text-nuqe-warn   border-nuqe-warn/30   bg-nuqe-warn/10',   label: 'Pending'  },
  approved: { cls: 'text-nuqe-ok     border-nuqe-ok/30     bg-nuqe-ok/10',     label: 'Approved' },
  rejected: { cls: 'text-nuqe-danger border-nuqe-danger/30 bg-nuqe-danger/10', label: 'Rejected' },
};

function AiActionsTab({ actions }) {
  if (!actions.length) {
    return <p className="text-xs text-nuqe-muted">No AI actions recorded for this case.</p>;
  }
  return (
    <div className="space-y-3">
      {actions.map((a) => {
        const statusCfg = AI_STATUS_CFG[a.status] ?? AI_STATUS_CFG.pending;
        return (
          <div key={a.id} className="rounded-lg border border-white/5 bg-nuqe-bg/40 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-nuqe-text">
                {AI_TYPE_LABELS[a.type] ?? a.type}
              </span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${statusCfg.cls}`}>
                {statusCfg.label}
              </span>
            </div>
            <p className="text-[11px] text-nuqe-muted leading-snug">{a.summary}</p>
            <div className="flex items-center gap-3 text-[10px] text-nuqe-muted">
              <span className="font-mono">{a.model}</span>
              <span className="tabular-nums">{Math.round(a.confidence * 100)}% confidence</span>
            </div>
            <p className="text-[10px] text-nuqe-muted">{a.createdAt}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function Badge({ children, cls }) {
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${cls}`}>
      {children}
    </span>
  );
}

// ─── Status badge map ─────────────────────────────────────────────────────────

const STATUS_CFG = {
  breach_risk:  { label: 'Breach risk',  cls: 'text-nuqe-danger border-nuqe-danger/30 bg-nuqe-danger/10' },
  under_review: { label: 'Under review', cls: 'text-nuqe-warn   border-nuqe-warn/30   bg-nuqe-warn/10'   },
  fos_referred: { label: 'FOS referred', cls: 'text-purple-300  border-purple-700/40  bg-nuqe-dark/60'   },
  open:         { label: 'Open',         cls: 'text-nuqe-purple border-nuqe-purple/30 bg-nuqe-purple/10' },
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function CaseView() {
  const { id } = useParams();

  // Data hooks
  const { caseData: rawCase,  loading: caseLoading, error: caseError,  refetch: refetchCase }  = useCase(id);
  const { communications: rawComms, loading: commsLoading, error: commsError, refetch: refetchComms } = useCommunications(id);
  const { aiActions: rawActions,    pendingCount,           loading: actionsLoading, refetch: refetchActions }   = useAiActions(id);

  // UI state
  const [expanded,       setExpanded]       = useState({});
  const [activeTab,      setActiveTab]      = useState('details');
  const [composeChannel, setComposeChannel] = useState('email');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody,    setComposeBody]    = useState('');
  const [submittingId,   setSubmittingId]   = useState(null);
  const [isSending,      setIsSending]      = useState(false);
  const [sendError,      setSendError]      = useState(null);
  const [isNoting,       setIsNoting]       = useState(false);

  // Normalise data
  const caseData   = useMemo(() => normalizeCase(rawCase),                              [rawCase]);
  const aiActions  = useMemo(() => rawActions.map(normalizeAiAction),                   [rawActions]);
  const comms      = useMemo(() => rawComms.map((c) => normalizeComm(c, aiActions)),    [rawComms, aiActions]);

  const hasPendingAI = pendingCount > 0;
  const statusBadge  = STATUS_CFG[caseData?.status] ?? STATUS_CFG.open;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function toggleExpand(commId) {
    setExpanded((prev) => ({ ...prev, [commId]: !prev[commId] }));
  }

  async function handleApprove(comm) {
    const actionId = comm.aiActionId
      ?? aiActions.find((a) => a.type === 'response_draft' && a.status === 'pending')?.id;
    if (!actionId) return;
    setSubmittingId(comm.id + '-approve');
    try {
      await client.patch(`/api/v1/ai-actions/${actionId}/approve`);
      await Promise.all([refetchCase(), refetchComms(), refetchActions()]);
    } catch (err) {
      console.error('[approve]', err.message);
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleReject(comm) {
    const actionId = comm.aiActionId
      ?? aiActions.find((a) => a.type === 'response_draft' && a.status === 'pending')?.id;
    if (!actionId) return;
    setSubmittingId(comm.id + '-reject');
    try {
      await client.patch(`/api/v1/ai-actions/${actionId}/reject`);
      await Promise.all([refetchCase(), refetchComms(), refetchActions()]);
    } catch (err) {
      console.error('[reject]', err.message);
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleEditApprove(comm) {
    setComposeChannel(comm.channel);
    setComposeSubject(comm.subject ?? '');
    setComposeBody(comm.body);

    const actionId = comm.aiActionId
      ?? aiActions.find((a) => a.type === 'response_draft' && a.status === 'pending')?.id;
    if (!actionId) return;
    setSubmittingId(comm.id + '-approve');
    try {
      await client.patch(`/api/v1/ai-actions/${actionId}/approve`);
      await Promise.all([refetchCase(), refetchComms(), refetchActions()]);
    } catch (err) {
      console.error('[edit-approve]', err.message);
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleSend({ subject, htmlBody, plainBody, cc, bcc } = {}) {
    const body    = htmlBody ?? composeBody;
    const subj    = subject  ?? (composeChannel === 'email' ? composeSubject : undefined);
    if (hasPendingAI) return;
    if (!body?.trim() && !plainBody?.trim()) return;
    setIsSending(true);
    setSendError(null);
    try {
      await client.post('/api/v1/communications', {
        case_id:    id,
        channel:    composeChannel,
        subject:    subj ?? null,
        body:       body,
        direction:  'outbound',
        author_type: 'staff',
        cc:         cc ?? undefined,
        bcc:        bcc ?? undefined,
        is_internal: false,
      });
      setComposeSubject('');
      setComposeBody('');
      await refetchComms();
    } catch (err) {
      setSendError(err.response?.data?.error ?? err.message ?? 'Send failed');
    } finally {
      setIsSending(false);
    }
  }

  async function handleNote({ body } = {}) {
    if (!body?.trim()) return;
    setIsNoting(true);
    try {
      await client.post('/api/v1/communications', {
        case_id:     id,
        channel:     'email',
        body,
        direction:   'internal',
        author_type: 'staff',
        is_internal: true,
      });
      await refetchComms();
    } catch (err) {
      console.error('[note]', err.message);
    } finally {
      setIsNoting(false);
    }
  }

  // ── Render: case-level loading / error ────────────────────────────────────

  if (caseLoading && !caseData) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <style>{`@keyframes skeleton-pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }`}</style>
        <header className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-white/5 bg-nuqe-surface">
          <Link to="/complaints" className="text-nuqe-muted hover:text-nuqe-text transition-colors p-1 -ml-1 rounded hover:bg-white/5">
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div className="h-4 w-36 rounded" style={{ background: 'rgba(255,255,255,0.08)', animation: 'skeleton-pulse 1.6s ease-in-out infinite' }} />
        </header>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-nuqe-muted text-sm">Loading case…</p>
        </div>
      </div>
    );
  }

  if (caseError && !caseData) {
    return (
      <div className="p-6 space-y-4">
        <Link to="/complaints" className="text-nuqe-muted hover:text-nuqe-text text-xs flex items-center gap-1">
          ← Back to complaints
        </Link>
        <ErrorBanner message={caseError} onRetry={refetchCase} />
      </div>
    );
  }

  // ── Render: full view ─────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">
      <style>{`@keyframes skeleton-pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }`}</style>

      {/* ── Case header ─────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-white/5 bg-nuqe-surface">
        <Link
          to="/complaints"
          className="text-nuqe-muted hover:text-nuqe-text transition-colors shrink-0 p-1 -ml-1 rounded hover:bg-white/5"
          title="Back to complaints"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <span className="text-white/15">|</span>
        <span className="font-mono text-nuqe-purple font-semibold tracking-tight text-sm">{caseData?.caseRef ?? id}</span>
        <span className="text-white/15">·</span>
        <span className="font-semibold text-nuqe-text text-sm">{caseData?.customer.name}</span>
        <span className="font-mono text-xs text-nuqe-muted">{caseData?.customer.ref}</span>

        <div className="flex items-center gap-2 ml-1 flex-wrap">
          {caseData?.category    && <Badge cls="border-nuqe-purple/30 bg-nuqe-purple/10 text-nuqe-purple">{caseData.category}</Badge>}
          {caseData?.jurisdiction && <Badge cls="border-blue-700/30 bg-blue-900/20 text-blue-400">{caseData.jurisdiction}</Badge>}
          {caseData?.status      && <Badge cls={statusBadge.cls}>{statusBadge.label}</Badge>}
          {caseData?.customer.vulnerableFlag && (
            <Badge cls="border-amber-600/30 bg-amber-500/10 text-amber-400">⚠ Vulnerable</Badge>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <select
            value={caseData?.status ?? ''}
            onChange={async (e) => {
              try {
                await client.patch(`/api/v1/cases/${id}`, { status: e.target.value });
                await refetchCase();
              } catch (err) { console.error('[status]', err.message); }
            }}
            className="text-[11px] rounded px-2 py-1 border"
            style={{ background: 'var(--nuqe-surface-hi)', borderColor: 'var(--nuqe-border)', color: 'var(--nuqe-text-muted)' }}
          >
            <option value="open">Open</option>
            <option value="under_review">Under review</option>
            <option value="pending_closure">Pending closure</option>
            <option value="closed_upheld">Closed — upheld</option>
            <option value="closed_not_upheld">Closed — not upheld</option>
            <option value="fos_referred">FOS referred</option>
          </select>
        </div>
      </header>

      {/* ── DISP milestones strip ────────────────────────────────────────── */}
      {caseData?.milestones?.length > 0 && (
        <div className="shrink-0 border-b border-white/5 bg-nuqe-surface">
          <div
            className="grid divide-x divide-white/5"
            style={{ gridTemplateColumns: `repeat(${caseData.milestones.length}, 1fr)` }}
          >
            {caseData.milestones.map((m) => (
              <MilestoneItem key={m.id} milestone={m} />
            ))}
          </div>
        </div>
      )}

      {/* ── Main split layout ────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: timeline + compose */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-white/5">

          {/* Timeline */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-nuqe-muted">
              Communication timeline{!commsLoading && ` — ${comms.length} entries`}
            </p>

            {commsError && <ErrorBanner message={commsError} onRetry={refetchComms} />}

            {commsLoading && comms.length === 0
              ? <TimelineSkeleton />
              : comms.map((c) => (
                  <CommCard
                    key={c.id}
                    comm={c}
                    expanded={!!expanded[c.id]}
                    onToggle={() => toggleExpand(c.id)}
                    onApprove={() => handleApprove(c)}
                    onReject={() => handleReject(c)}
                    onEdit={() => handleEditApprove(c)}
                    submitting={
                      submittingId === c.id + '-approve' ? 'approve'
                      : submittingId === c.id + '-reject'  ? 'reject'
                      : null
                    }
                  />
                ))
            }

            {!commsLoading && !commsError && comms.length === 0 && (
              <p className="text-xs text-nuqe-muted">No communications recorded yet.</p>
            )}
          </div>

          {/* Compose area */}
          <div className="shrink-0 border-t border-white/5 bg-nuqe-surface px-4 py-3">

            {/* Channel selector — only for non-email channels */}
            <div className="flex items-center gap-1 mb-3">
              {['email', 'chat', 'postal'].map((ch) => (
                <button
                  key={ch}
                  onClick={() => setComposeChannel(ch)}
                  className={[
                    'px-3 py-1 text-xs font-medium rounded border transition-colors capitalize',
                    composeChannel === ch
                      ? 'bg-nuqe-purple/15 text-nuqe-purple border-nuqe-purple/30'
                      : 'bg-transparent text-nuqe-muted border-white/10 hover:text-nuqe-text hover:border-white/20',
                  ].join(' ')}
                >
                  {ch.charAt(0).toUpperCase() + ch.slice(1)}
                </button>
              ))}
            </div>

            {/* Email: full Tiptap composer with CC/BCC/subject/internal notes */}
            {composeChannel === 'email' && (
              <EmailComposer
                toEmail={caseData?.customer?.email ?? null}
                subject={composeSubject}
                onSubject={setComposeSubject}
                onSend={handleSend}
                onNote={handleNote}
                onAiDraft={() => {}}
                isSending={isSending || isNoting}
                disabled={hasPendingAI}
                disabledReason={hasPendingAI ? 'Review pending AI actions first' : null}
              />
            )}

            {/* Chat / postal: plain textarea */}
            {composeChannel !== 'email' && (
              <>
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder={`Draft ${composeChannel} response…`}
                  rows={4}
                  className="w-full px-3 py-2 text-xs bg-nuqe-bg border border-white/10 rounded text-nuqe-text placeholder-nuqe-muted focus:outline-none focus:border-nuqe-purple/40 resize-none leading-relaxed"
                />
                <div className="flex items-center justify-between mt-2">
                  <div />
                  <button
                    onClick={() => handleSend({ body: composeBody })}
                    disabled={hasPendingAI || !composeBody.trim() || isSending}
                    title={hasPendingAI ? 'Review all pending AI actions before sending' : undefined}
                    className="px-4 py-1.5 text-xs font-medium rounded border border-white/15 bg-white/5 text-nuqe-text hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isSending ? 'Sending…' : 'Send'}
                  </button>
                </div>
                {hasPendingAI && (
                  <p className="text-[10px] text-amber-400 mt-2">
                    Review all pending AI actions before sending.
                  </p>
                )}
                {sendError && (
                  <p className="text-[10px] text-nuqe-danger mt-2">{sendError}</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: details / AI-actions panel */}
        <div className="w-[300px] xl:w-[340px] shrink-0 flex flex-col bg-nuqe-surface">

          {/* Tab strip */}
          <div className="flex shrink-0 border-b border-white/5">
            {[['details', 'Case details'], ['ai', `AI actions${pendingCount > 0 ? ` (${pendingCount})` : ''}`]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={[
                  'flex-1 py-3 text-xs font-medium tracking-wide transition-colors border-b-2',
                  activeTab === key
                    ? 'text-nuqe-text border-nuqe-purple'
                    : 'text-nuqe-muted border-transparent hover:text-nuqe-text',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {actionsLoading && activeTab === 'ai' ? (
              <p className="text-xs text-nuqe-muted">Loading AI actions…</p>
            ) : activeTab === 'details' && caseData ? (
              <DetailsTab caseData={caseData} />
            ) : activeTab === 'ai' ? (
              <AiActionsTab actions={aiActions} />
            ) : null}
          </div>
        </div>

      </div>
    </div>
  );
}
