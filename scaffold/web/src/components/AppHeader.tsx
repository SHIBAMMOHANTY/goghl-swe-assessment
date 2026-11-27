import { useEffect, useRef, useState } from 'react';
import type { DashboardResponse, MeResponse } from '../api';
import type { ActiveScreen } from './SidebarNav';
import { formatRelativeTime, workspaceDisplayName } from './workspaceMeta';

interface AppHeaderProps {
  me: MeResponse;
  workspace: string;
  onWorkspaceChange: (ws: string) => void;
  wsConnected: boolean;
  recentEvents: DashboardResponse['recentEvents'];
  onOpenMobileNav: () => void;
  onNavigate: (screen: ActiveScreen) => void;
  onLogout: () => void;
}

function StoreIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.9">
      <path d="M3 9.5 4.5 4h15L21 9.5a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-3 0Z" />
      <path d="M5 12v8h14v-8" />
    </svg>
  );
}

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function AppHeader({
  me,
  workspace,
  onWorkspaceChange,
  wsConnected,
  recentEvents,
  onOpenMobileNav,
  onNavigate,
  onLogout,
}: AppHeaderProps) {
  const [wsOpen, setWsOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const wsRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wsRef.current && !wsRef.current.contains(target)) setWsOpen(false);
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(target)) setUserOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const currentRole = me.workspaces.find((w) => w.id === workspace)?.role ?? 'agent';

  return (
    <header className="relative z-30 flex items-center justify-between gap-2 px-3 sm:px-6 py-2.5 bg-white border-b border-slate-200/80">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Mobile sidebar drawer trigger */}
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
          className="lg:hidden rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>

        {/* Workspace Selector Dropdown (Screen 6) */}
        <div className="relative" ref={wsRef}>
          <button
            type="button"
            aria-label="Workspace selector"
            aria-expanded={wsOpen}
            onClick={() => {
              setWsOpen((v) => !v);
              setNotifOpen(false);
              setUserOpen(false);
            }}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-800 transition-colors cursor-pointer"
          >
            <span className="w-6 h-6 rounded-lg bg-violet-100 text-[#602ee0] grid place-items-center shrink-0">
              <StoreIcon className="w-3.5 h-3.5" />
            </span>
            <span className="truncate max-w-[120px] sm:max-w-[180px]">
              {workspaceDisplayName(workspace)}
            </span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-4 h-4 text-slate-400 shrink-0"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {wsOpen && (
            <div className="absolute left-0 mt-2 w-64 rounded-2xl bg-white border border-slate-200/90 shadow-xl shadow-indigo-950/10 py-2 z-40">
              <div className="px-3.5 py-1.5 text-[11px] font-semibold text-slate-500">
                Switch Workspace
              </div>
              <div className="px-1.5 space-y-0.5">
                {me.workspaces.map((w) => {
                  const selected = w.id === workspace;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => {
                        onWorkspaceChange(w.id);
                        setWsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                        selected
                          ? 'bg-violet-50 text-slate-900 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-lg grid place-items-center shrink-0 ${
                            selected
                              ? 'bg-violet-100 text-[#602ee0]'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <StoreIcon className="w-3.5 h-3.5" />
                        </span>
                        <span className="truncate">
                          {workspaceDisplayName(w.id)}
                          <span className="ml-1.5 text-[10px] text-slate-400 font-normal">
                            ({w.role})
                          </span>
                        </span>
                      </span>
                      {selected && (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          className="w-4 h-4 text-[#602ee0] shrink-0"
                          stroke="currentColor"
                          strokeWidth="2.4"
                        >
                          <path d="m5 12 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1.5 pt-1.5 border-t border-slate-100 px-3.5 text-[11px] text-slate-400">
                Workspaces come from your OIDC claim
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Status, Notifications, User Profile */}
      <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] sm:text-xs font-semibold ${
            wsConnected
              ? 'bg-emerald-50/70 border-emerald-200/70 text-emerald-700'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}
          />
          <span className="hidden xs:inline sm:inline">
            {wsConnected ? 'Real-time' : 'Reconnecting'}
          </span>
        </span>

        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            aria-label="Recent real-time events"
            onClick={() => {
              setNotifOpen((v) => !v);
              setWsOpen(false);
              setUserOpen(false);
            }}
            className="relative rounded-full p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {recentEvents.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-violet-600 ring-2 ring-white" />
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white border border-slate-200 shadow-xl py-2 z-40">
              <div className="px-3.5 py-1.5 text-xs font-semibold text-slate-800 border-b border-slate-100">
                Real-time Events
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                {recentEvents.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">No events yet</div>
                ) : (
                  recentEvents.slice(0, 6).map((ev) => (
                    <div key={ev.seq} className="px-3.5 py-2 text-xs flex justify-between gap-2">
                      <span className="text-slate-700 truncate">
                        {ev.type} {ev.contact ? `· ${ev.contact}` : ''}
                      </span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {formatRelativeTime(ev.at)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="relative" ref={userRef}>
          <button
            type="button"
            onClick={() => {
              setUserOpen((v) => !v);
              setWsOpen(false);
              setNotifOpen(false);
            }}
            className="flex items-center gap-2 rounded-full hover:bg-slate-50 p-0.5 pr-1.5 transition-colors cursor-pointer"
          >
            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7342f6] to-[#5625d6] text-white grid place-items-center text-xs font-bold shrink-0">
              {userInitials(me.name)}
            </span>
            <div className="hidden sm:flex flex-col text-left leading-tight">
              <span className="text-xs font-semibold text-slate-900">{me.name}</span>
              <span className="text-[11px] text-slate-500 capitalize">{currentRole}</span>
            </div>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="hidden sm:block w-3.5 h-3.5 text-slate-400"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {userOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-white border border-slate-200 shadow-xl py-1.5 z-40 text-xs">
              <div className="px-3.5 py-2 border-b border-slate-100">
                <div className="font-semibold text-slate-900 truncate">{me.name}</div>
                <div className="text-[11px] text-slate-500 truncate">{me.email || me.sub}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onNavigate('settings');
                  setUserOpen(false);
                }}
                className="w-full text-left px-3.5 py-2 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Workspace &amp; Profile
              </button>
              <button
                type="button"
                onClick={() => {
                  setUserOpen(false);
                  onLogout();
                }}
                className="w-full text-left px-3.5 py-2 text-red-600 hover:bg-red-50 font-medium cursor-pointer"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
