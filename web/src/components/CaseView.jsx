import { useState } from 'react';
import { Link } from 'react-router-dom';

// ─── Mock data ────────────────────────────────────────────────────────────────

const CASE = {
  id:              'COMP-2024-0041',
  customer:        { name: 'Sarah Mitchell', ref: 'ACC-88412', loanRef: 'LN-2023-55821', vulnerableFlag: true },
  category:        'Irresponsible lending',
  jurisdiction:    'UK / FCA',
  status:          'breach_risk',
  handler:         'James Elliot',
  openedAt:        '14 Feb 2024, 09:22',
  channelReceived: 'Email',
  notes:           'Customer disclosed financial distress and health impact during live chat (01 Mar). Vulnerability protocol applied. Affordability assessment under review by compliance — do not close without senior sign-off.',
  milestones: [
    {
      id:        'm1',
      label:     'Acknowledge by',
      rule:      'DISP 1.6.1',
      dueDate:   '17 Feb 2024',
      status:    'met',
      metDate:   '15 Feb 2024',
      daysLeft:  null,
      daysTotal: null,
      note:      null,
    },
    {
      id:        'm2',
      label:     'Final response by',
      rule:      'DISP 1.6.2',
      dueDate:   '10 Apr 2024',
      status:    'pending',
      metDate:   null,
      daysLeft:  1,
      daysTotal: 56,
      note:      null,
    },
    {
      id:        'm3',
      label:     'FOS referral eligible',
      rule:      'DISP 2.8',
      dueDate:   '10 Apr 2024',
      status:    'pending',
      metDate:   null,
      daysLeft:  1,
      daysTotal: null,
      note:      'Eligible if no final response by deadline',
    },
  ],
  aiActions: [
    {
      id:         'ai-1',
      type:       'complaint_classification',
      status:     'approved',
      model:      'claude-sonnet-4-6',
      confidence: 0.94,
      summary:    'Classified as complaint. Explicit dissatisfaction with lending decision; financial harm alleged.',
      createdAt:  '14 Feb 2024, 09:25',
    },
    {
      id:         'ai-2',
      type:       'implicit_complaint_detection',
      status:     'approved',
      model:      'claude-sonnet-4-6',
      confidence: 0.88,
      summary:    'Vulnerability signals detected in live chat: financial distress, health impact, FOS escalation intent.',
      createdAt:  '01 Mar 2024, 11:17',
    },
    {
      id:         'ai-3',
      type:       'response_draft',
      status:     'pending',
      model:      'claude-sonnet-4-6',
      confidence: 0.91,
      summary:    'Final response draft generated. Complaint upheld. Redress: £1,247.80 refund + balance write-off.',
      createdAt:  '09 Apr 2024, 16:03',
    },
  ],
};

const INITIAL_COMMS = [
  {
    id:        'c1',
    direction: 'inbound',
    channel:   'email',
    sender:    'Sarah Mitchell',
    time:      '14 Feb 2024, 09:22',
    subject:   'Complaint regarding loan approval — Ref LN-2023-55821',
    body:      'Dear Meridian Digital Finance,\n\nI am writing to formally complain about the loan I was approved for in August 2023 (reference LN-2023-55821). At the time of application, I clearly stated that my income was £1,400 per month after tax. The monthly repayment of £340 represents nearly 25% of my take-home pay and I am now struggling significantly.\n\nI do not believe an adequate affordability assessment was carried out. I have missed two payments and incurred additional charges as a result. I am requesting a full review of how this lending decision was made and appropriate redress.\n\nYours sincerely,\nSarah Mitchell',
    state:     'normal',
    aiModel:   null,
    confidence: null,
  },
  {
    id:        'c2',
    direction: 'outbound',
    channel:   'email',
    sender:    'James Elliot',
    time:      '15 Feb 2024, 14:30',
    subject:   'Re: Your complaint — Ref COMP-2024-0041',
    body:      'Dear Ms Mitchell,\n\nThank you for contacting us. We have received and registered your complaint under reference COMP-2024-0041.\n\nYour complaint will be handled by our specialist team. We aim to provide a full response within 8 weeks in line with DISP 1.6 of the FCA Dispute Resolution Sourcebook. If we are unable to do so, we will write to you with an update and a revised timescale.\n\nIf you are experiencing financial difficulty in the meantime, please do not hesitate to contact us to discuss your options.\n\nYours sincerely,\nJames Elliot\nComplaints Handler',
    state:     'normal',
    aiModel:   null,
    confidence: null,
  },
  {
    id:        'c3',
    direction: 'inbound',
    channel:   'chat',
    sender:    'Sarah Mitchell',
    time:      '01 Mar 2024, 11:15',
    subject:   null,
    body:      "Hi — I sent a formal complaint about my loan three weeks ago and haven't heard anything other than the initial acknowledgement. I'm really struggling financially and the stress is starting to affect my health. Is there any update on my case? I'm seriously considering going to the financial ombudsman if I don't hear something more concrete soon.",
    state:     'normal',
    aiModel:   null,
    confidence: null,
  },
  {
    id:        'c4',
    direction: 'outbound',
    channel:   'email',
    sender:    'James Elliot',
    time:      '02 Mar 2024, 09:45',
    subject:   'Update on your complaint COMP-2024-0041',
    body:      'Dear Ms Mitchell,\n\nThank you for getting in touch. We can confirm your complaint is under active investigation. Our team is reviewing the affordability assessment process applied to your application and is taking your concerns very seriously.\n\nWe anticipate being in a position to provide our full response by 10 April 2024. Should we require further information in the meantime, we will contact you promptly.\n\nWe understand this has been a stressful experience and we appreciate your patience.\n\nYours sincerely,\nJames Elliot',
    state:     'normal',
    aiModel:   null,
    confidence: null,
  },
  {
    id:         'c5',
    direction:  'outbound',
    channel:    'email',
    sender:     'AI Draft',
    time:       '09 Apr 2024, 16:03',
    subject:    'Final response to your complaint — COMP-2024-0041',
    body:       'Dear Ms Mitchell,\n\nWe write with our final response to your complaint of 14 February 2024 (reference COMP-2024-0041).\n\nHaving reviewed your case in full, including the original affordability assessment and your account history, we uphold your complaint. Our investigation found that the assessment did not adequately account for your stated income relative to your financial commitments, and did not meet the standards required under CONC 7 of the FCA Consumer Credit Sourcebook.\n\nAs redress, we will:\n\n1. Refund all interest and charges paid to date: £1,247.80\n2. Write off the outstanding balance in full\n3. Notify credit reference agencies to remove any adverse entries related to this account\n\nWe are sorry for the distress this has caused. A separate letter confirming these steps will follow within 5 business days.\n\nIf you are not satisfied with this response, you have the right to refer your complaint to the Financial Ombudsman Service (FOS) within 6 months. Contact FOS at www.financial-ombudsman.org.uk or 0800 023 4567 (free of charge).\n\nYours sincerely,\n[Pending handler approval]',
    state:      'pending_ai',
    aiModel:    'claude-sonnet-4-6',
    confidence: 0.91,
  },
];

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
    met:     { icon: '✓', colour: 'text-nuqe-ok',     bar: 'bg-nuqe-ok',     desc: `Met ${m.metDate}` },
    pending: { icon: '◐', colour: 'text-nuqe-warn',   bar: 'bg-nuqe-warn',   desc: `${m.daysLeft} day${m.daysLeft !== 1 ? 's' : ''} remaining` },
    breached:{ icon: '!', colour: 'text-nuqe-danger',  bar: 'bg-nuqe-danger', desc: `${Math.abs(m.daysLeft)} days overdue` },
  }[m.status];

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

function CommCard({ comm, expanded, onToggle, onApprove, onReject, onEdit }) {
  const isPending  = comm.state === 'pending_ai';
  const isApproved = comm.state === 'approved_ai';
  const isRejected = comm.state === 'rejected_ai';

  const chColour = { email: 'text-blue-400', chat: 'text-emerald-400', postal: 'text-amber-400' }[comm.channel];
  const isLong   = comm.body.length > PREVIEW;
  const bodyText = isLong && !expanded ? comm.body.slice(0, PREVIEW) + '…' : comm.body;

  const borderCls = isPending
    ? 'border-amber-500/30'
    : isRejected
    ? 'border-white/5 opacity-50'
    : 'border-white/5';

  return (
    <div className={`rounded-lg border ${borderCls} overflow-hidden bg-nuqe-surface`}>

      {/* Card header */}
      <div
        className={`flex items-start justify-between gap-4 px-4 py-3 border-b border-white/5 ${
          isPending ? 'bg-amber-500/[0.04]' : 'bg-white/[0.02]'
        }`}
        style={isPending ? { animation: 'pending-pulse 2.8s ease-in-out infinite' } : undefined}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChannelIcon channel={comm.channel} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-nuqe-text leading-tight">{comm.sender}</span>

              {isPending && (
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
              {comm.confidence && (
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
        <span className="text-[11px] text-nuqe-muted shrink-0 tabular-nums">{comm.time}</span>
      </div>

      {/* Message body */}
      <div
        className={`px-4 py-3 ${isPending ? 'opacity-60' : ''}`}
        style={isPending ? { animation: 'pending-pulse 2.8s ease-in-out infinite' } : undefined}
      >
        <pre className="text-xs text-nuqe-text whitespace-pre-wrap leading-relaxed font-sans">
          {bodyText}
        </pre>
        {isLong && (
          <button
            onClick={onToggle}
            className="mt-2 text-[11px] text-nuqe-purple hover:underline"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* Pending AI action row */}
      {isPending && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-white/5 bg-nuqe-bg/50">
          <button
            onClick={onApprove}
            className="px-3 py-1.5 text-xs font-medium rounded border border-nuqe-ok/30 bg-nuqe-ok/10 text-nuqe-ok hover:bg-nuqe-ok/20 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-xs font-medium rounded border border-nuqe-purple/30 bg-nuqe-purple/10 text-nuqe-purple hover:bg-nuqe-purple/20 transition-colors"
          >
            Edit &amp; Approve
          </button>
          <button
            onClick={onReject}
            className="px-3 py-1.5 text-xs font-medium rounded border border-nuqe-danger/30 bg-nuqe-danger/10 text-nuqe-danger hover:bg-nuqe-danger/20 transition-colors ml-auto"
          >
            Reject
          </button>
        </div>
      )}
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
      <DetailRow label="Assigned handler"  value={caseData.handler} />
      <DetailRow label="Date opened"       value={caseData.openedAt} />
      <DetailRow label="Channel received"  value={caseData.channelReceived} />
      <DetailRow
        label="Vulnerability"
        value={caseData.customer.vulnerableFlag ? '⚠ Flagged' : 'Not flagged'}
        accent={caseData.customer.vulnerableFlag ? 'text-amber-400 font-medium' : 'text-nuqe-muted'}
      />
      <DetailRow label="Loan reference"    value={caseData.customer.loanRef} mono />

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

// ─── Right panel — AI actions tab ─────────────────────────────────────────────

const AI_TYPE_LABELS = {
  complaint_classification:    'Classification',
  implicit_complaint_detection:'Implicit detect',
  response_draft:              'Response draft',
  ruleset_impact_assessment:   'Ruleset impact',
};

const AI_STATUS_CFG = {
  pending:  { cls: 'text-nuqe-warn    border-nuqe-warn/30    bg-nuqe-warn/10',    label: 'Pending'  },
  approved: { cls: 'text-nuqe-ok      border-nuqe-ok/30      bg-nuqe-ok/10',      label: 'Approved' },
  rejected: { cls: 'text-nuqe-danger  border-nuqe-danger/30  bg-nuqe-danger/10',  label: 'Rejected' },
};

function AiActionsTab({ actions }) {
  return (
    <div className="space-y-3">
      {actions.map((a) => {
        const statusCfg = AI_STATUS_CFG[a.status];
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

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_CFG = {
  breach_risk:  { label: 'Breach risk',  cls: 'text-nuqe-danger border-nuqe-danger/30 bg-nuqe-danger/10' },
  under_review: { label: 'Under review', cls: 'text-nuqe-warn   border-nuqe-warn/30   bg-nuqe-warn/10'   },
  fos_referred: { label: 'FOS referred', cls: 'text-purple-300  border-purple-700/40  bg-nuqe-dark/60'   },
  open:         { label: 'Open',         cls: 'text-nuqe-purple border-nuqe-purple/30 bg-nuqe-purple/10' },
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function CaseView() {
  const [comms,          setComms]          = useState(INITIAL_COMMS);
  const [expanded,       setExpanded]       = useState({});
  const [activeTab,      setActiveTab]      = useState('details');
  const [composeChannel, setComposeChannel] = useState('email');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody,    setComposeBody]    = useState('');

  const hasPendingAI = comms.some((c) => c.state === 'pending_ai');

  function toggleExpand(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function approveAI(id) {
    setComms((prev) => prev.map((c) => c.id === id ? { ...c, state: 'approved_ai' } : c));
  }

  function rejectAI(id) {
    setComms((prev) => prev.map((c) => c.id === id ? { ...c, state: 'rejected_ai' } : c));
  }

  function editAI(comm) {
    setComposeChannel(comm.channel);
    setComposeSubject(comm.subject ?? '');
    setComposeBody(comm.body);
    approveAI(comm.id);
  }

  const statusBadge = STATUS_CFG[CASE.status] ?? STATUS_CFG.open;

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Case header ───────────────────────────────────────────────────── */}
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
        <span className="font-mono text-nuqe-purple font-semibold tracking-tight text-sm">{CASE.id}</span>
        <span className="text-white/15">·</span>
        <span className="font-semibold text-nuqe-text text-sm">{CASE.customer.name}</span>
        <span className="font-mono text-xs text-nuqe-muted">{CASE.customer.ref}</span>

        <div className="flex items-center gap-2 ml-1">
          <Badge cls="border-nuqe-purple/30 bg-nuqe-purple/10 text-nuqe-purple">{CASE.category}</Badge>
          <Badge cls="border-blue-700/30 bg-blue-900/20 text-blue-400">{CASE.jurisdiction}</Badge>
          <Badge cls={statusBadge.cls}>{statusBadge.label}</Badge>
          {CASE.customer.vulnerableFlag && (
            <Badge cls="border-amber-600/30 bg-amber-500/10 text-amber-400">⚠ Vulnerable</Badge>
          )}
        </div>
      </header>

      {/* ── DISP milestones strip ─────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-white/5 bg-nuqe-surface">
        <div className="grid grid-cols-3 divide-x divide-white/5">
          {CASE.milestones.map((m) => (
            <MilestoneItem key={m.id} milestone={m} />
          ))}
        </div>
      </div>

      {/* ── Main split layout ─────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: timeline + compose */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-white/5">

          {/* Timeline */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-nuqe-muted">
              Communication timeline — {comms.length} entries
            </p>
            {comms.map((c) => (
              <CommCard
                key={c.id}
                comm={c}
                expanded={!!expanded[c.id]}
                onToggle={() => toggleExpand(c.id)}
                onApprove={() => approveAI(c.id)}
                onReject={() => rejectAI(c.id)}
                onEdit={() => editAI(c)}
              />
            ))}
          </div>

          {/* Compose area */}
          <div className="shrink-0 border-t border-white/5 bg-nuqe-surface px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex gap-1">
                {['email', 'chat', 'postal'].map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setComposeChannel(ch)}
                    className={[
                      'px-3 py-1.5 text-xs font-medium rounded border transition-colors capitalize',
                      composeChannel === ch
                        ? 'bg-nuqe-purple/15 text-nuqe-purple border-nuqe-purple/30'
                        : 'bg-transparent text-nuqe-muted border-white/10 hover:text-nuqe-text hover:border-white/20',
                    ].join(' ')}
                  >
                    {ch.charAt(0).toUpperCase() + ch.slice(1)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-nuqe-muted">Draft outbound</p>
            </div>

            {composeChannel === 'email' && (
              <input
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                placeholder="Subject"
                className="w-full px-3 py-2 mb-2 text-xs bg-nuqe-bg border border-white/10 rounded text-nuqe-text placeholder-nuqe-muted focus:outline-none focus:border-nuqe-purple/40"
              />
            )}

            <textarea
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              placeholder={`Draft ${composeChannel} response…`}
              rows={4}
              className="w-full px-3 py-2 text-xs bg-nuqe-bg border border-white/10 rounded text-nuqe-text placeholder-nuqe-muted focus:outline-none focus:border-nuqe-purple/40 resize-none leading-relaxed"
            />

            <div className="flex items-center justify-between mt-2">
              <button className="px-3 py-1.5 text-xs font-medium rounded border border-nuqe-purple/30 bg-nuqe-purple/10 text-nuqe-purple hover:bg-nuqe-purple/20 transition-colors">
                Request AI draft
              </button>

              <button
                disabled={hasPendingAI || !composeBody.trim()}
                title={hasPendingAI ? 'Review the pending AI draft before sending' : undefined}
                className="px-4 py-1.5 text-xs font-medium rounded border border-white/15 bg-white/5 text-nuqe-text hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>

            {hasPendingAI && (
              <p className="text-[10px] text-amber-400 mt-2">
                Send disabled — review and action the pending AI draft above before proceeding.
              </p>
            )}
          </div>
        </div>

        {/* Right: details/AI-actions panel */}
        <div className="w-[300px] xl:w-[340px] shrink-0 flex flex-col bg-nuqe-surface">

          {/* Tab strip */}
          <div className="flex shrink-0 border-b border-white/5">
            {[['details', 'Case details'], ['ai', 'AI actions']].map(([key, label]) => (
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
            {activeTab === 'details'
              ? <DetailsTab caseData={CASE} />
              : <AiActionsTab actions={CASE.aiActions} />
            }
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Tiny badge helper ────────────────────────────────────────────────────────

function Badge({ children, cls }) {
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${cls}`}>
      {children}
    </span>
  );
}
