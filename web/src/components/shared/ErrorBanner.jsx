export default function ErrorBanner({ message, onRetry }) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg px-5 py-4"
      style={{
        background:   'rgba(239,68,68,0.06)',
        border:       '1px solid rgba(239,68,68,0.25)',
      }}
    >
      <span className="text-red-400 text-base mt-0.5 shrink-0">✕</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-400">Failed to load data</p>
        <p className="text-xs text-red-400/70 mt-0.5 break-words">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
          style={{
            border:      '1px solid rgba(239,68,68,0.35)',
            color:       'rgb(248,113,113)',
            background:  'rgba(239,68,68,0.08)',
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
