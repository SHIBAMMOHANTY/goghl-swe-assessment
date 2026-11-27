import type { MeResponse } from '../api';
import {
  clearStoredWorkspaceKey,
  generateWorkspaceKey,
  setStoredWorkspaceKey,
} from '../crypto';

interface ProfileSettingsViewProps {
  me: MeResponse;
  workspace: string;
  workspaceKey: string;
  keyId: string | null;
  wsConnected: boolean;
  lastSeq: number | undefined;
  onWorkspaceKeyChange: (nextKey: string) => void;
}

export function ProfileSettingsView({
  me,
  workspace,
  workspaceKey,
  keyId,
  wsConnected,
  lastSeq,
  onWorkspaceKeyChange,
}: ProfileSettingsViewProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-4 bg-slate-50">
      <div>
        <h2 className="text-lg font-bold text-slate-900 m-0">User Profile &amp; Settings</h2>
        <p className="text-xs text-slate-500 mt-1 mb-0">
          Identity details from OpenID Connect and browser-local E2E encryption settings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 mt-0 mb-3">Agent Profile</h3>
          <dl className="grid grid-cols-[150px_1fr] gap-y-2 gap-x-3 text-xs m-0">
            <dt className="text-slate-500">Name</dt>
            <dd className="m-0 font-medium text-slate-900">{me.name}</dd>
            <dt className="text-slate-500">Subject (sub)</dt>
            <dd className="m-0">
              <code className="text-slate-800">{me.sub}</code>
            </dd>
            <dt className="text-slate-500">Email</dt>
            <dd className="m-0 text-slate-800">{me.email || '—'}</dd>
            <dt className="text-slate-500">Workspaces</dt>
            <dd className="m-0 flex flex-wrap gap-1.5">
              {me.workspaces.map((w) => (
                <span
                  key={w.id}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    w.id === workspace
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {w.id}: {w.role}
                </span>
              ))}
            </dd>
          </dl>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 mt-0 mb-3">Real-Time Connection</h3>
          <dl className="grid grid-cols-[150px_1fr] gap-y-2 gap-x-3 text-xs m-0">
            <dt className="text-slate-500">Active Workspace</dt>
            <dd className="m-0">
              <code className="text-slate-800">{workspace}</code>
            </dd>
            <dt className="text-slate-500">WebSocket Status</dt>
            <dd className="m-0 text-slate-800">
              {wsConnected ? 'Connected (live)' : 'Disconnected / Reconnecting'}
            </dd>
            <dt className="text-slate-500">Last Event Seq</dt>
            <dd className="m-0 text-slate-800">
              {typeof lastSeq === 'number' ? `seq #${lastSeq}` : 'No events received yet'}
            </dd>
          </dl>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900 mt-0 mb-1.5">
            End-to-End Encryption Key ({workspace})
          </h3>
          <p className="text-xs text-slate-500 mt-0 mb-3 leading-relaxed">
            Private notes are encrypted in your browser using <code>AES-256-GCM</code> before
            upload. This key is saved only in <code>localStorage</code> and never sent to the
            Switchboard server. Share it out-of-band with teammates in <strong>{workspace}</strong>
            .
          </p>

          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={workspaceKey}
              placeholder="Paste 256-bit base64url workspace key…"
              onChange={(e) => {
                const next = e.target.value;
                onWorkspaceKeyChange(next);
                if (next.trim()) setStoredWorkspaceKey(workspace, next);
                else clearStoredWorkspaceKey(workspace);
              }}
              className="flex-1 min-w-[240px] rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => {
                void generateWorkspaceKey().then((k) => {
                  setStoredWorkspaceKey(workspace, k);
                  onWorkspaceKeyChange(k);
                });
              }}
              className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
            >
              Generate New Key
            </button>
            <button
              type="button"
              onClick={() => {
                clearStoredWorkspaceKey(workspace);
                onWorkspaceKeyChange('');
              }}
              className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
            >
              Clear
            </button>
          </div>

          {keyId && (
            <div className="mt-2.5 text-xs text-emerald-700">
              Active key fingerprint: <code>{keyId}</code>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
