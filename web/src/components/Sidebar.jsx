import { NavLink } from 'react-router-dom';
import { usePendingActions } from '../context/PendingActionsContext';

const NAV = [
  {
    group: 'Casework',
    items: [
      { label: 'Complaints',    to: '/complaints',    icon: <IconFlag /> },
      { label: 'All cases',     to: '/cases',         icon: <IconFolder /> },
      { label: 'FOS referrals', to: '/fos-referrals', icon: <IconArrow /> },
    ],
  },
  {
    group: 'Communications',
    items: [
      { label: 'Inbox',        to: '/inbox',        icon: <IconInbox /> },
      { label: 'Live chat',    to: '/live-chat',    icon: <IconChat /> },
      { label: 'Postal queue', to: '/postal-queue', icon: <IconMail /> },
    ],
  },
  {
    group: 'Compliance',
    items: [
      { label: 'Consumer Duty', to: '/consumer-duty', icon: <IconShield /> },
      { label: 'Audit trail',   to: '/audit-trail',   icon: <IconClock /> },
      { label: 'Reg updates',   to: '/reg-updates',   icon: <IconBell /> },
    ],
  },
  {
    group: 'Analytics',
    items: [
      { label: 'Performance', to: '/analytics', icon: <IconChart /> },
    ],
  },
];

// Routes that should show the pending AI actions badge, mapped to the
// total pending count. Add more route→count mappings here as pages mature.
function badgeFor(to, pendingCount) {
  if (to === '/complaints' && pendingCount > 0) return pendingCount;
  return null;
}

export default function Sidebar() {
  const { pendingCount } = usePendingActions();
  return (
    <aside className="flex flex-col w-56 shrink-0 h-screen bg-nuqe-surface border-r border-white/5 overflow-y-auto">
      {/* Wordmark */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-white/5">
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold"
          style={{ background: 'var(--nuqe-purple)' }}
        >
          N
        </span>
        <span className="text-nuqe-text font-semibold tracking-wide text-sm">Nuqe</span>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 py-4 px-3 space-y-6">
        {NAV.map(({ group, items }) => (
          <div key={group}>
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-nuqe-muted">
              {group}
            </p>
            <ul className="space-y-0.5">
              {items.map(({ label, to, icon }) => {
                const badge = badgeFor(to, pendingCount);
                return (
                  <li key={to}>
                    <NavLink
                      to={to}
                      className={({ isActive }) =>
                        [
                          'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors',
                          isActive
                            ? 'bg-nuqe-purple/20 text-nuqe-purple font-medium'
                            : 'text-nuqe-muted hover:text-nuqe-text hover:bg-white/5',
                        ].join(' ')
                      }
                    >
                      <span className="w-4 h-4 shrink-0">{icon}</span>
                      <span className="flex-1">{label}</span>
                      {badge != null && (
                        <span className="text-[10px] font-semibold min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 tabular-nums">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/5">
        <p className="text-[10px] text-nuqe-muted">v0.1 · RegOps Systems</p>
      </div>
    </aside>
  );
}

/* ── Inline SVG icons (no external dependency) ─────────────────────────────── */

function IconFlag() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 2v12M3 2h8l-2 3.5L11 9H3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconFolder() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4.5A1.5 1.5 0 013.5 3h2.586a1 1 0 01.707.293L8 4.5H12.5A1.5 1.5 0 0114 6v5.5A1.5 1.5 0 0112.5 13h-9A1.5 1.5 0 012 11.5v-7z" strokeLinejoin="round" />
    </svg>
  );
}
function IconArrow() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconInbox() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 9h3l1.5 2h3L11 9h3M2 9V5.5A1.5 1.5 0 013.5 4h9A1.5 1.5 0 0114 5.5V9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v6A1.5 1.5 0 0112.5 11H9l-3 3v-3H3.5A1.5 1.5 0 012 9.5v-6z" strokeLinejoin="round" />
    </svg>
  );
}
function IconMail() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="4" width="12" height="9" rx="1.5" />
      <path d="M2 5l6 4.5L14 5" strokeLinecap="round" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2l5 2v4c0 3-2.5 5-5 6C5.5 13 3 11 3 8V4l5-2z" strokeLinejoin="round" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5.5V8l2 1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2a4 4 0 014 4v2.5l1 1.5H3l1-1.5V6a4 4 0 014-4zM6.5 12a1.5 1.5 0 003 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12V7l3-3 3 3 3-4v9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12h12" strokeLinecap="round" />
    </svg>
  );
}
