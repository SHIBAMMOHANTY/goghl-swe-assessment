import type { InboxStats } from '../api';
import type { InboxFilter } from './InboxDashboard';

export type ActiveScreen =
  | 'dashboard'
  | 'inbox'
  | 'contacts'
  | 'assignments'
  | 'reports'
  | 'integrations'
  | 'billing'
  | 'search'
  | 'settings'
  | 'notifications'
  | 'profile'
  | 'account';

interface SidebarNavProps {
  activeScreen: ActiveScreen;
  inboxFilter: InboxFilter;
  stats: InboxStats | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onNavigate: (screen: ActiveScreen) => void;
  onSelectInboxFilter: (filter: InboxFilter) => void;
}

function BrandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden="true">
      <path
        d="M12 3.75c-4.97 0-9 3.47-9 7.75 0 2.13 1 4.06 2.63 5.45-.19 1.24-.75 2.47-1.58 3.45 1.54-.17 3.1-.77 4.26-1.61 1.15.3 2.4.46 3.69.46 4.97 0 9-3.47 9-7.75S16.97 3.75 12 3.75Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="11.5" r="1" fill="currentColor" />
      <circle cx="12" cy="11.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="11.5" r="1" fill="currentColor" />
    </svg>
  );
}

export function SidebarNav({
  activeScreen,
  inboxFilter,
  stats,
  mobileOpen,
  onCloseMobile,
  onNavigate,
  onSelectInboxFilter,
}: SidebarNavProps) {
  const navBtn = (
    id: ActiveScreen,
    label: string,
    icon: React.ReactNode,
    badge?: number
  ) => {
    const active = activeScreen === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => {
          onNavigate(id);
          onCloseMobile();
        }}
        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all cursor-pointer ${
          active
            ? 'bg-gradient-to-r from-[#7342f6] to-[#5a28db] text-white shadow-md shadow-indigo-950/40'
            : 'text-violet-200/80 hover:text-white hover:bg-white/10'
        }`}
      >
        <span className="flex items-center gap-2.5">
          <span className="w-4 h-4 shrink-0">{icon}</span>
          <span>{label}</span>
        </span>
        {typeof badge === 'number' && badge > 0 && (
          <span className="rounded-full bg-sky-500 text-white px-2 py-0.5 text-[10px] font-bold leading-none">
            {badge}
          </span>
        )}
      </button>
    );
  };

  const inboxSubItems: Array<{
    filter: InboxFilter;
    label: string;
    badge?: number;
  }> = [
    { filter: 'all', label: 'All Conversations' },
    { filter: 'mine', label: 'Mine' },
    { filter: 'unassigned', label: 'Unassigned', badge: stats?.unassigned ?? 0 },
    { filter: 'closed', label: 'Closed' },
  ];

  const sidebarContent = (
    <div className="relative h-full w-[240px] flex flex-col justify-between overflow-hidden bg-gradient-to-b from-[#1a0f42] via-[#281663] to-[#341a7e] text-white px-3.5 py-5">
      {/* Subtle bottom purple wave */}
      <svg
        viewBox="0 0 260 120"
        preserveAspectRatio="none"
        className="pointer-events-none absolute bottom-0 left-0 w-full h-24 opacity-60"
        aria-hidden="true"
      >
        <path
          d="M0,70 C60,20 125,95 190,45 C225,20 245,45 260,35 L260,120 L0,120 Z"
          fill="#6d28d9"
          fillOpacity="0.4"
        />
        <path
          d="M0,90 C75,55 150,115 260,70 L260,120 L0,120 Z"
          fill="#7c3aed"
          fillOpacity="0.35"
        />
      </svg>

      <div className="relative z-10 flex flex-col gap-5 overflow-y-auto">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7c4dff] to-[#4f26d6] shadow-md shadow-indigo-950/50 grid place-items-center text-white shrink-0">
              <BrandIcon />
            </div>
            <div>
              <div className="font-bold text-base leading-tight tracking-tight">Switchboard</div>
              <div className="text-[11px] text-violet-200/75">Shared Team Inbox</div>
            </div>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="lg:hidden rounded-lg p-1 text-violet-200 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Workspace Section */}
        <nav className="flex flex-col gap-1" aria-label="Main navigation">
          <div className="px-3 text-[10px] font-semibold tracking-wider uppercase text-violet-300/60 mb-1">
            Workspace
          </div>
          {navBtn(
            'dashboard',
            'Dashboard',
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z" />
            </svg>
          )}

          {navBtn(
            'inbox',
            'Inbox',
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M3 13l2.4-6.4A2 2 0 0 1 7.3 5h9.4a2 2 0 0 1 1.9 1.6L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" />
              <path d="M3 13h5l1.5 2.5h5L16 13h5" />
            </svg>,
            stats?.open ?? 0
          )}

          {/* Nested Inbox Filter Sub-items (Screens 7-10) */}
          <div className="pl-3 pr-1 py-1 space-y-0.5">
            {inboxSubItems.map((sub) => {
              const active = activeScreen === 'inbox' && inboxFilter === sub.filter;
              return (
                <button
                  key={sub.filter}
                  type="button"
                  onClick={() => {
                    onSelectInboxFilter(sub.filter);
                    onCloseMobile();
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                    active
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-violet-200/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className="truncate">{sub.label}</span>
                  {typeof sub.badge === 'number' && sub.badge > 0 && (
                    <span className="rounded-full bg-white/15 text-violet-100 px-1.5 py-0.5 text-[10px] font-semibold">
                      {sub.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {navBtn(
            'contacts',
            'Contacts',
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <circle cx="12" cy="10" r="2.5" />
              <path d="M8.5 16.5c.8-1.6 2-2.5 3.5-2.5s2.7.9 3.5 2.5" strokeLinecap="round" />
            </svg>
          )}

          {navBtn(
            'search',
            'Search',
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
          )}
        </nav>

        {/* Manage Section */}
        <div className="flex flex-col gap-1">
          <div className="px-3 text-[10px] font-semibold tracking-wider uppercase text-violet-300/60 mb-1">
            Manage
          </div>
          {navBtn(
            'assignments',
            'Team & Agents',
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="3.5" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a3.5 3.5 0 0 1 0 6.75" />
            </svg>
          )}
          {navBtn(
            'reports',
            'Reports & Analytics',
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7 16v-4M12 16V8M17 16v-6" strokeLinecap="round" />
            </svg>
          )}
          {navBtn(
            'integrations',
            'Integrations',
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </div>

        {/* Settings Section */}
        <div className="flex flex-col gap-1">
          <div className="px-3 text-[10px] font-semibold tracking-wider uppercase text-violet-300/60 mb-1">
            Settings
          </div>
          {navBtn(
            'settings',
            'Workspace Settings',
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          )}
          {navBtn(
            'notifications',
            'Notifications',
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
            </svg>
          )}
          {navBtn(
            'billing',
            'Billing',
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <path d="M2 10h20" />
            </svg>
          )}
          {navBtn(
            'profile',
            'My Profile',
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" strokeLinecap="round" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside className="hidden lg:block shrink-0 h-full">{sidebarContent}</aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-2xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full shadow-2xl">{sidebarContent}</div>
        </div>
      )}

      {/* Mobile bottom navigation bar matching reference phone UI */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid grid-cols-5 py-1.5 px-1"
      >
        {(
          [
            ['dashboard', 'Home'],
            ['inbox', 'Inbox'],
            ['contacts', 'Contacts'],
            ['assignments', 'Team'],
            ['profile', 'Profile'],
          ] as const
        ).map(([id, label]) => {
          const active = activeScreen === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={`flex flex-col items-center gap-0.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer ${
                active ? 'text-[#602ee0] font-semibold' : 'text-slate-500'
              }`}
            >
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
