import { useEffect, useState } from 'react';
import type { InboxStats, MeResponse } from '../api';
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
  me: MeResponse;
  workspace: string;
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function SidebarNav({
  me,
  workspace,
  activeScreen,
  inboxFilter,
  stats,
  mobileOpen,
  onCloseMobile,
  onNavigate,
  onSelectInboxFilter,
}: SidebarNavProps) {
  const [inboxOpen, setInboxOpen] = useState(activeScreen === 'inbox');

  useEffect(() => {
    if (activeScreen === 'inbox') {
      setInboxOpen(true);
    }
  }, [activeScreen]);

  const role = me.workspaces.find((w) => w.id === workspace)?.role ?? 'agent';

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
        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-all cursor-pointer ${
          active
            ? 'bg-gradient-to-r from-[#7342f6] to-[#5a28db] text-white shadow-md shadow-indigo-950/40'
            : 'text-violet-100/80 hover:text-white hover:bg-white/10'
        }`}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-4 h-4 shrink-0 opacity-90">{icon}</span>
          <span className="truncate">{label}</span>
        </span>
        {typeof badge === 'number' && badge > 0 && (
          <span className="rounded-full bg-sky-500 text-white px-2 py-0.5 text-[10px] font-bold leading-none shrink-0">
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
    <div className="relative h-full w-[228px] flex flex-col justify-between overflow-hidden bg-gradient-to-b from-[#1a0f42] via-[#281663] to-[#341a7e] text-white px-3 py-3.5">
      {/* Subtle bottom purple wave */}
      <svg
        viewBox="0 0 260 120"
        preserveAspectRatio="none"
        className="pointer-events-none absolute bottom-0 left-0 w-full h-24 opacity-65"
        aria-hidden="true"
      >
        <path
          d="M0,70 C60,20 125,95 190,45 C225,20 245,45 260,35 L260,120 L0,120 Z"
          fill="#6d28d9"
          fillOpacity="0.45"
        />
        <path
          d="M0,90 C75,55 150,115 260,70 L260,120 L0,120 Z"
          fill="#7c3aed"
          fillOpacity="0.35"
        />
      </svg>

      {/* Top Brand + Nav (scrollable fallback with hidden native scrollbar) */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-1 pb-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#7c4dff] to-[#4f26d6] shadow-md shadow-indigo-950/50 grid place-items-center text-white shrink-0">
              <BrandIcon />
            </div>
            <div>
              <div className="font-bold text-[15px] leading-tight tracking-tight">Switchboard</div>
              <div className="text-[10.5px] text-violet-200/75 leading-tight">
                Shared Team Inbox
              </div>
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
        <nav className="flex flex-col gap-0.5" aria-label="Main navigation">
          <div className="px-2.5 text-[10px] font-semibold tracking-wider uppercase text-violet-300/60 mb-0.5">
            Workspace
          </div>
          {navBtn(
            'dashboard',
            'Dashboard',
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z" />
            </svg>
          )}

          {/* Inbox + collapsible sub-items */}
          <div className="flex flex-col">
            <div
              className={`w-full flex items-center justify-between rounded-lg transition-all ${
                activeScreen === 'inbox'
                  ? 'bg-gradient-to-r from-[#7342f6] to-[#5a28db] text-white shadow-md shadow-indigo-950/40'
                  : 'text-violet-100/80 hover:text-white hover:bg-white/10'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  onNavigate('inbox');
                  setInboxOpen(true);
                  onCloseMobile();
                }}
                className="flex-1 flex items-center gap-2.5 px-2.5 py-1.5 text-[12.5px] font-medium text-left cursor-pointer min-w-0"
              >
                <span className="w-4 h-4 shrink-0 opacity-90">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path d="M3 13l2.4-6.4A2 2 0 0 1 7.3 5h9.4a2 2 0 0 1 1.9 1.6L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" />
                    <path d="M3 13h5l1.5 2.5h5L16 13h5" />
                  </svg>
                </span>
                <span className="truncate">Inbox</span>
              </button>

              <div className="flex items-center gap-1 pr-2">
                {(stats?.open ?? 0) > 0 && (
                  <span className="rounded-full bg-sky-500 text-white px-2 py-0.5 text-[10px] font-bold leading-none">
                    {stats?.open}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={inboxOpen ? 'Collapse inbox filters' : 'Expand inbox filters'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setInboxOpen((v) => !v);
                  }}
                  className="p-0.5 rounded hover:bg-white/15 text-violet-200/80 cursor-pointer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className={`w-3.5 h-3.5 transition-transform ${inboxOpen ? 'rotate-180' : ''}`}
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>

            {inboxOpen && (
              <div className="pl-3 pr-0.5 pt-1 pb-0.5 space-y-0.5">
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
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1 rounded-md text-[11.5px] transition-colors cursor-pointer ${
                        active
                          ? 'bg-white/15 text-white font-semibold'
                          : 'text-violet-200/70 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <span className="truncate">{sub.label}</span>
                      {typeof sub.badge === 'number' && sub.badge > 0 && (
                        <span className="rounded-full bg-white/15 text-violet-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                          {sub.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
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
        <div className="flex flex-col gap-0.5 border-t border-white/10 pt-2.5">
          <div className="px-2.5 text-[10px] font-semibold tracking-wider uppercase text-violet-300/60 mb-0.5">
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
              <path
                d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                strokeLinecap="round"
              />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </div>

        {/* Settings Section */}
        <div className="flex flex-col gap-0.5 border-t border-white/10 pt-2.5">
          <div className="px-2.5 text-[10px] font-semibold tracking-wider uppercase text-violet-300/60 mb-0.5">
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
              <path
                d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
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

      {/* Bottom User Card over Purple Wave */}
      <div className="relative z-10 pt-2.5 mt-1 shrink-0">
        <button
          type="button"
          onClick={() => {
            onNavigate('profile');
            onCloseMobile();
          }}
          className="w-full flex items-center justify-between gap-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-2.5 py-2 text-left transition-colors cursor-pointer backdrop-blur-xs"
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7c4dff] to-[#5a28db] text-white grid place-items-center text-[11px] font-bold shrink-0">
              {initials(me.name)}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-white truncate leading-tight">
                {me.name}
              </span>
              <span className="block text-[10.5px] text-violet-200/75 capitalize leading-tight">
                {role}
              </span>
            </span>
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-3.5 h-3.5 text-violet-200/70 shrink-0"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
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

      {/* Mobile bottom navigation bar */}
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
