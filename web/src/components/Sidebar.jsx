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
      { label: 'Consumer Duty',  to: '/consumer-duty',         icon: <IconShield /> },
      { label: 'Audit trail',    to: '/audit-trail',           icon: <IconClock /> },
      { label: 'Reg updates',    to: '/reg-updates',           icon: <IconBell /> },
      { label: 'Reg monitoring', to: '/regulatory-monitoring', icon: <IconRadar /> },
    ],
  },
  {
    group: 'Analytics',
    items: [
      { label: 'Performance', to: '/analytics', icon: <IconChart /> },
    ],
  },
  {
    group: 'Knowledge',
    items: [
      { label: 'Regulatory', to: '/knowledge/regulatory', icon: <IconBook /> },
      { label: 'Product',    to: '/knowledge/product',    icon: <IconDoc /> },
      { label: 'Gaps',       to: '/knowledge/gaps',       icon: <IconGap /> },
    ],
  },
  {
    group: 'Settings',
    items: [
      { label: 'AI configuration', to: '/settings/ai-config', icon: <IconGear /> },
      { label: 'Tokeniser',        to: '/settings/tokeniser', icon: <IconKey /> },
    ],
  },
];

function badgeFor(to, pendingCount, pendingChunksCount) {
  if (to === '/complaints'            && pendingCount       > 0) return pendingCount;
  if (to === '/regulatory-monitoring' && pendingChunksCount > 0) return pendingChunksCount;
  return null;
}

export default function Sidebar() {
  const { pendingCount, pendingChunksCount } = usePendingActions();

  return (
    <aside className="flex flex-col w-[220px] shrink-0 h-screen overflow-y-auto"
           style={{ background: 'var(--nuqe-surface)', borderRight: '1px solid var(--nuqe-border)' }}>

      {/* Wordmark */}
      <div className="flex items-center gap-2.5 px-4 py-4"
           style={{ borderBottom: '1px solid var(--nuqe-border)' }}>
        <div className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
             style={{ background: 'linear-gradient(135deg, #7C3AED, #5B21B6)' }}>
          N
        </div>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold tracking-tight text-nuqe-text leading-none">Nuqe</p>
          <p className="text-[10.5px] text-nuqe-subtle leading-none mt-0.5">RegOps Platform</p>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        {NAV.map(({ group, items }, gi) => (
          <div key={group} className={gi > 0 ? 'mt-5' : ''}>
            <p className="px-2 mb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-nuqe-subtle select-none">
              {group}
            </p>
            <ul className="space-y-px">
              {items.map(({ label, to, icon }) => {
                const badge = badgeFor(to, pendingCount, pendingChunksCount);
                return (
                  <li key={to}>
                    <NavLink
                      to={to}
                      className={({ isActive }) =>
                        'flex items-center gap-2.5 px-2 py-[7px] rounded-md text-[13px] transition-all duration-100 relative ' +
                        (isActive
                          ? 'text-nuqe-purple font-medium'
                          : 'text-nuqe-muted hover:text-nuqe-text')
                      }
                      style={({ isActive }) => isActive ? {
                        background: 'rgba(124,58,237,0.1)',
                        boxShadow: 'inset 2px 0 0 var(--nuqe-purple)',
                      } : {}}
                    >
                      {({ isActive }) => (
                        <>
                          <span className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-nuqe-purple' : ''}`}>
                            {icon}
                          </span>
                          <span className="flex-1 truncate">{label}</span>
                          {badge != null && (
                            <span className="text-[10px] font-semibold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 tabular-nums"
                                  style={{ background: 'var(--nuqe-warn-dim)', color: 'var(--nuqe-warn)', border: '1px solid var(--nuqe-warn-ring)' }}>
                              {badge > 99 ? '99+' : badge}
                            </span>
                          )}
                        </>
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
      <div className="px-4 py-3 text-[10.5px] text-nuqe-subtle"
           style={{ borderTop: '1px solid var(--nuqe-border)' }}>
        <span className="font-medium text-nuqe-muted">{import.meta.env.VITE_FIRM_NAME ?? 'Nuqe Demo'}</span>
        <span className="mx-1.5 opacity-30">·</span>
        v0.4
      </div>
    </aside>
  );
}

/* ── Icons ────────────────────────────────────────────────────────────────────── */

function Svg({ children }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function IconFlag()   { return <Svg><path d="M3 2v12M3 2h8l-2 3.5L11 9H3" /></Svg>; }
function IconFolder() { return <Svg><path d="M2 4.5A1.5 1.5 0 013.5 3h2.586a1 1 0 01.707.293L8 4.5H12.5A1.5 1.5 0 0114 6v5.5A1.5 1.5 0 0112.5 13h-9A1.5 1.5 0 012 11.5v-7z" /></Svg>; }
function IconArrow()  { return <Svg><path d="M3 8h10M9 4l4 4-4 4" /></Svg>; }
function IconInbox()  { return <Svg><path d="M2 9h3l1.5 2h3L11 9h3M2 9V5.5A1.5 1.5 0 013.5 4h9A1.5 1.5 0 0114 5.5V9" /></Svg>; }
function IconChat()   { return <Svg><path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v6A1.5 1.5 0 0112.5 11H9l-3 3v-3H3.5A1.5 1.5 0 012 9.5v-6z" /></Svg>; }
function IconMail()   { return <Svg><rect x="2" y="4" width="12" height="9" rx="1.5" /><path d="M2 5l6 4.5L14 5" /></Svg>; }
function IconShield() { return <Svg><path d="M8 2l5 2v4c0 3-2.5 5-5 6C5.5 13 3 11 3 8V4l5-2z" /></Svg>; }
function IconClock()  { return <Svg><circle cx="8" cy="8" r="5.5" /><path d="M8 5.5V8l2 1.5" /></Svg>; }
function IconBell()   { return <Svg><path d="M8 2a4 4 0 014 4v2.5l1 1.5H3l1-1.5V6a4 4 0 014-4zM6.5 12a1.5 1.5 0 003 0" /></Svg>; }
function IconChart()  { return <Svg><path d="M2 12V7l3-3 3 3 3-4v9" /><path d="M2 12h12" /></Svg>; }
function IconRadar()  { return <Svg><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2.5" /><path d="M8 8L11.5 4.5" /></Svg>; }
function IconBook()   { return <Svg><path d="M3 2.5A1.5 1.5 0 014.5 1h7A1.5 1.5 0 0113 2.5v11l-4.5-2L4 13.5V2.5z" /></Svg>; }
function IconDoc()    { return <Svg><path d="M4 2h5.5L12 4.5V14H4V2z" /><path d="M9 2v3h3M6 7h4M6 9.5h4M6 12h2" /></Svg>; }
function IconGap()    { return <Svg><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.5M8 10.5v.5" /></Svg>; }
function IconGear()   { return <Svg><circle cx="8" cy="8" r="2" /><path d="M8 2v1M8 13v1M2 8h1M13 8h1M3.93 3.93l.71.71M11.36 11.36l.71.71M3.93 12.07l.71-.71M11.36 4.64l.71-.71" /></Svg>; }
function IconKey()    { return <Svg><circle cx="5.5" cy="7.5" r="3" /><path d="M8 8.5l5.5 3.5M11 10.5l1 1.5" /></Svg>; }
