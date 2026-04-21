// Pulse skeleton matching the ComplaintsDashboard 7-column table structure.
const COLS = [100, 140, 160, 70, 90, 130, 70]; // approximate widths per column

function SkeletonCell({ width }) {
  return (
    <td className="px-4 py-3.5">
      <div
        className="h-3 rounded"
        style={{
          width,
          background:  'rgba(255,255,255,0.06)',
          animation:   'skeleton-pulse 1.6s ease-in-out infinite',
        }}
      />
    </td>
  );
}

export default function LoadingSkeleton({ rows = 5 }) {
  return (
    <>
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 0.9; }
        }
      `}</style>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr
            key={i}
            className="border-b border-white/5 last:border-0"
            style={{ opacity: 1 - i * 0.12 }}
          >
            {COLS.map((w, j) => (
              <SkeletonCell key={j} width={`${w}px`} />
            ))}
          </tr>
        ))}
      </tbody>
    </>
  );
}
