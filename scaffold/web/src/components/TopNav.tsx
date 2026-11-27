import type { MeResponse } from '../api';

export type ActiveScreen = 'inbox' | 'assignments' | 'search' | 'settings';

interface TopNavProps {
  me: MeResponse;
  workspace: string;
  onWorkspaceChange: (ws: string) => void;
  wsConnected: boolean;
  activeScreen: ActiveScreen;
  onNavigate: (screen: ActiveScreen) => void;
  onLogout: () => void;
}

export function TopNav({
  me,
  workspace,
  onWorkspaceChange,
  wsConnected,
  activeScreen,
  onNavigate,
  onLogout,
}: TopNavProps) {
  const currentRole = me.workspaces.find((w) => w.id === workspace)?.role ?? 'agent';

  return (
            <header className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2.5 px-3 sm:px-4 py-2.5 bg-white border-b border-slate-200">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 text-white grid place-items-center font-bold text-sm shrink-0">
                    S
                  </div>
                  <span className="font-bold text-base text-slate-900 tracking-tight">Switchboard</span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${wsConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {wsConnected ? 'Online' : 'Reconnecting'}
                  </span>
                </div>

                  {/* Mobile quick sign out */}
        <button
                  type="button"
                  onClick={onLogout}
                  className="sm:hidden rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 cursor-pointer"
                >
                Sign out
              </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5">
                <label htmlFor="ws-select" className="hidden sm:inline text-xs text-slate-500">
                  Workspace
                </label>
                <select
                  id="ws-select"
                  aria-label="Workspace"
                  value={workspace}
                  onChange={(e) => onWorkspaceChange(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {me.workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.id} ({w.role})
                    </option>
                  ))}
                </select>
            </div>

            <nav
              className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 border border-slate-200 overflow-x-auto max-w-full"
              aria-label="Primary navigation"
            >
              {(
                [
                  ['inbox', 'Inbox'],
                  ['assignments', 'Assignments'],
                  ['search', 'Search'],
                  ['settings', 'Settings'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavigate(id)}
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                      }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="hidden sm:flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 grid place-items-center text-xs font-bold">
            {me.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-semibold text-slate-900">{me.name}</span>
            <span className="text-[11px] text-slate-500">{currentRole}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
