export default function ErrorBanner({ message, onRetry }) {
  return (
    <div className="flex items-start gap-3 rounded-lg px-4 py-3.5"
         style={{ background: 'var(--nuqe-danger-dim)', border: '1px solid var(--nuqe-danger-ring)' }}>
      <svg className="w-4 h-4 mt-0.5 shrink-0 text-nuqe-danger" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 5v3.5M8 10.5v.5" strokeLinecap="round" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-nuqe-danger">Failed to load data</p>
        {message && <p className="text-[12px] text-nuqe-danger/70 mt-0.5 break-words">{message}</p>}
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-danger shrink-0" style={{ padding: '4px 12px', fontSize: '12px' }}>
          Retry
        </button>
      )}
    </div>
  );
}
