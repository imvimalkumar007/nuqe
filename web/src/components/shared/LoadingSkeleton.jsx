const COLS = [100, 140, 160, 70, 90, 130, 70];

export default function LoadingSkeleton({ rows = 8 }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} style={{ borderBottom: '1px solid var(--nuqe-border)', opacity: 1 - i * 0.1 }}>
          {COLS.map((w, j) => (
            <td key={j} className="px-4 py-3.5">
              <div className="skeleton rounded" style={{ height: '11px', width: `${w}px` }} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}
