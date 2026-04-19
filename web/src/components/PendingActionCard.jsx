import { useState } from 'react';
import { usePendingActions } from '../context/PendingActionsContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const CLASSIFICATION_CATEGORIES = [
  'complaint',
  'implicit_complaint',
  'query',
  'dispute',
  'acknowledgement',
];

const CLASSIFICATION_ACTION_TYPES = new Set([
  'complaint_classification',
  'implicit_complaint_detection',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function actionTypeLabel(type) {
  return type.replace(/_/g, ' ');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfidenceBadge({ score }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  const colour =
    score >= 0.8 ? 'text-nuqe-ok bg-nuqe-ok/10 border-nuqe-ok/30' :
    score >= 0.5 ? 'text-nuqe-warn bg-nuqe-warn/10 border-nuqe-warn/30' :
                   'text-nuqe-danger bg-nuqe-danger/10 border-nuqe-danger/30';
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${colour}`}>
      {pct}%
    </span>
  );
}

function OutcomePill({ status, wasEdited }) {
  const colour = status === 'approved'
    ? 'text-nuqe-ok bg-nuqe-ok/10 border-nuqe-ok/30'
    : 'text-nuqe-danger bg-nuqe-danger/10 border-nuqe-danger/30';
  const label = status === 'approved'
    ? wasEdited ? 'Approved (edited)' : 'Approved'
    : 'Rejected';
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${colour}`}>
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin"
      aria-hidden
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PendingActionCard
//
// Props:
//   action      — full ai_actions row from the API
//   reviewerId  — UUID of the currently logged-in staff member (pass from auth)
//   onReviewed  — callback(updatedAction) fired after a successful review
// ─────────────────────────────────────────────────────────────────────────────
export default function PendingActionCard({ action, reviewerId, onReviewed }) {
  const { refresh: refreshPending } = usePendingActions();
  const isClassify = CLASSIFICATION_ACTION_TYPES.has(action.action_type);
  const parsed = safeJson(action.ai_output);

  // Derive display text and initial editable value depending on action type
  const aiBody = isClassify
    ? (parsed?.reason ?? action.ai_output)
    : (parsed?.body ?? action.ai_output);

  const initialClass = isClassify
    ? (parsed?.classification ?? null)
    : null;

  // ── State ─────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState('view');           // 'view' | 'edit'
  const [selectedClass, setSelectedClass] = useState(initialClass);
  const [editText, setEditText] = useState(aiBody);
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState(null);       // null | { status, was_edited }
  const [error, setError] = useState(null);

  // ── API call ──────────────────────────────────────────────────────────────
  async function submit(status, humanOutput) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/ai-actions/${action.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, human_output: humanOutput, reviewer_id: reviewerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setOutcome({ status, was_edited: data.was_edited });
      setMode('view');
      refreshPending();
      onReviewed?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Button handlers ───────────────────────────────────────────────────────
  function handleApprove() {
    // For classification actions the human_output is the chosen label
    const humanOutput = isClassify ? selectedClass : action.ai_output;
    submit('approved', humanOutput);
  }

  function handleSaveEdit() {
    const humanOutput = isClassify ? selectedClass : editText;
    submit('approved', humanOutput);
  }

  function handleReject() {
    submit('rejected', null);
  }

  function openEdit() {
    setEditText(aiBody);
    setMode('edit');
  }

  function cancelEdit() {
    setEditText(aiBody);
    setMode('view');
  }

  // ── Derived card appearance ───────────────────────────────────────────────
  const cardBase = 'rounded-lg border p-4 transition-all duration-300';
  const cardVariant = outcome
    ? outcome.status === 'approved'
      ? 'border-nuqe-ok/30 bg-nuqe-ok/5'
      : 'border-nuqe-danger/30 bg-nuqe-danger/5'
    : 'border-white/8 bg-nuqe-surface/70';

  return (
    <div className={`${cardBase} ${cardVariant}`}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-nuqe-purple/20 text-nuqe-purple border border-nuqe-purple/20">
            {actionTypeLabel(action.action_type)}
          </span>
          <ConfidenceBadge score={action.confidence_score} />
          {outcome && <OutcomePill status={outcome.status} wasEdited={outcome.was_edited} />}
        </div>

        <div className="text-right shrink-0 space-y-0.5">
          <p className="text-[11px] text-nuqe-muted font-mono">
            {action.ai_model ?? '—'}
          </p>
          <p className="text-[11px] text-nuqe-muted">
            {action.ai_provider ?? 'claude'}
          </p>
        </div>
      </div>

      {/* ── Classification selector ─────────────────────────────────────── */}
      {isClassify && !outcome && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {CLASSIFICATION_CATEGORIES.map((cat) => {
            const isSelected = selectedClass === cat;
            return (
              <button
                key={cat}
                disabled={loading}
                onClick={() => setSelectedClass(cat)}
                className={[
                  'text-[11px] px-2.5 py-1 rounded-full border transition-all',
                  isSelected
                    ? 'border-nuqe-purple bg-nuqe-purple/25 text-nuqe-text font-medium'
                    : 'border-white/10 text-nuqe-muted hover:border-white/25 hover:text-nuqe-text',
                  loading ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
                ].join(' ')}
              >
                {cat.replace(/_/g, ' ')}
              </button>
            );
          })}
        </div>
      )}

      {/* ── AI classification result (read-only label on outcome) ───────── */}
      {isClassify && outcome && parsed?.classification && (
        <p className="text-xs text-nuqe-muted mb-2">
          AI classified as{' '}
          <span className="text-nuqe-text font-medium">
            {parsed.classification.replace(/_/g, ' ')}
          </span>
          {outcome.was_edited && selectedClass !== parsed.classification && (
            <>
              {' '}→ changed to{' '}
              <span className="text-nuqe-ok font-medium">
                {selectedClass?.replace(/_/g, ' ')}
              </span>
            </>
          )}
        </p>
      )}

      {/* ── Content area ────────────────────────────────────────────────── */}
      {/* pending-ai applied while the action awaits human review — removed once an outcome is set */}
      <div className={!outcome ? 'pending-ai rounded-md p-2 -mx-2' : 'rounded-md p-2 -mx-2'}>
        {mode === 'edit' ? (
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            disabled={loading}
            rows={8}
            className="w-full rounded-md bg-nuqe-bg border border-white/10 text-nuqe-text text-sm p-3 resize-y focus:outline-none focus:border-nuqe-purple/50 disabled:opacity-50 font-mono leading-relaxed"
          />
        ) : (
          <p className="text-sm text-nuqe-text/80 whitespace-pre-wrap line-clamp-6 leading-relaxed">
            {aiBody}
          </p>
        )}
      </div>

      {/* AI reason line for classification (italicised, below content) */}
      {isClassify && parsed?.reason && !outcome && (
        <p className="text-xs text-nuqe-muted mt-2 italic leading-snug">
          "{parsed.reason}"
        </p>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <p className="text-xs text-nuqe-danger mt-2 flex items-center gap-1">
          <span>⚠</span> {error}
        </p>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
        <time className="text-[11px] text-nuqe-muted" dateTime={action.created_at}>
          {relativeTime(action.created_at)}
        </time>

        {!outcome && (
          <div className="flex items-center gap-2">
            {mode === 'edit' ? (
              <>
                <button
                  onClick={cancelEdit}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 rounded-md border border-white/10 text-nuqe-muted hover:text-nuqe-text hover:border-white/20 disabled:opacity-40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={loading || (!isClassify && !editText.trim())}
                  className="text-xs px-3 py-1.5 rounded-md bg-nuqe-warn/15 text-nuqe-warn border border-nuqe-warn/30 hover:bg-nuqe-warn/25 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                >
                  {loading ? <><Spinner /> Saving…</> : 'Save & Approve'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleReject}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 rounded-md bg-nuqe-danger/10 text-nuqe-danger border border-nuqe-danger/25 hover:bg-nuqe-danger/20 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                >
                  {loading ? <Spinner /> : null}
                  Reject
                </button>
                <button
                  onClick={openEdit}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 rounded-md bg-nuqe-warn/10 text-nuqe-warn border border-nuqe-warn/25 hover:bg-nuqe-warn/20 disabled:opacity-40 transition-colors"
                >
                  Edit & Approve
                </button>
                <button
                  onClick={handleApprove}
                  disabled={loading || (isClassify && !selectedClass)}
                  className="text-xs px-3 py-1.5 rounded-md bg-nuqe-ok/10 text-nuqe-ok border border-nuqe-ok/25 hover:bg-nuqe-ok/20 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                >
                  {loading ? <><Spinner /> Approving…</> : 'Approve'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
