import React, { useState } from 'react';
import { updateMe, type MeResponse } from '../api';

interface AccountSettingsViewProps {
  me: MeResponse;
  wsConnected: boolean;
  lastSeq: number | undefined;
  onMeUpdated: (next: MeResponse) => void;
  onOpenWorkspaceSecurity: () => void;
}

type AccountSection = 'account' | 'security' | 'notifications' | 'preferences';

export function AccountSettingsView({
  me,
  wsConnected,
  lastSeq,
  onMeUpdated,
  onOpenWorkspaceSecurity,
}: AccountSettingsViewProps) {
  const [section, setSection] = useState<AccountSection>('account');
  const [name, setName] = useState(me.name);
  const [email, setEmail] = useState(me.email);
  const [theme, setTheme] = useState<'light' | 'system'>(me.theme ?? 'light');
  const [language, setLanguage] = useState(me.language ?? 'English');
  const [desktopNotifs, setDesktopNotifs] = useState(true);
  const [mentionAlerts, setMentionAlerts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const updated = await updateMe({ name, email, theme, language });
      onMeUpdated(updated);
      setFeedback({ kind: 'ok', text: 'Account settings saved.' });
    } catch (err) {
      setFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Failed to save account settings',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#f6f7fc] p-4 sm:p-6 pb-16 lg:pb-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-[210px_1fr] gap-5 items-start">
          {/* Compact Left Menu */}
          <nav className="bg-white rounded-2xl border border-slate-200/80 p-2 shadow-2xs flex md:flex-col gap-1 overflow-x-auto">
            {(
              [
                ['account', '👤', 'Account'],
                ['security', '🛡', 'Security'],
                ['notifications', '🔔', 'Notifications'],
                ['preferences', '🎛', 'Preferences'],
              ] as const
            ).map(([id, icon, label]) => {
              const active = section === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-violet-50 text-[#602ee0]'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Panel */}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
            {feedback && (
              <div
                className={`rounded-xl px-4 py-2 text-xs border ${
                  feedback.kind === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {feedback.text}
              </div>
            )}

            {(section === 'account' || section === 'preferences') && (
              <form onSubmit={(e) => void handleSave(e)} className="space-y-4 text-xs">
                <div>
                  <h2 className="text-base font-bold text-slate-900 m-0">
                    {section === 'account' ? 'Account' : 'Preferences'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 mb-0">
                    Manage your account settings and preferences.
                  </p>
                </div>

                {section === 'account' && (
                  <>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Theme</label>
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as 'light' | 'system')}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <option value="light">Light</option>
                    <option value="system">System Default</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <option value="English">English</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Spanish">Spanish</option>
                  </select>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-gradient-to-r from-[#6532eb] to-[#5624d6] text-white px-4 py-2 font-semibold shadow-sm cursor-pointer"
                  >
                    ✓ Save Changes
                  </button>
                </div>
              </form>
            )}

            {section === 'security' && (
              <div className="space-y-4 text-xs">
                <div>
                  <h2 className="text-base font-bold text-slate-900 m-0">Security</h2>
                  <p className="text-xs text-slate-500 mt-0.5 mb-0">
                    Session and authentication details.
                  </p>
                </div>
                <dl className="divide-y divide-slate-100 m-0">
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">Auth Protocol</dt>
                    <dd className="m-0 font-semibold text-slate-900">OpenID Connect + PKCE (S256)</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">Real-Time Socket</dt>
                    <dd className="m-0 font-semibold text-emerald-700">
                      {wsConnected ? 'Connected' : 'Reconnecting'}
                      {typeof lastSeq === 'number' ? ` (seq #${lastSeq})` : ''}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={onOpenWorkspaceSecurity}
                  className="rounded-xl border border-slate-200 bg-slate-50 hover:border-[#602ee0] px-3.5 py-2 font-semibold text-[#602ee0] cursor-pointer"
                >
                  Manage E2E Encryption Keys &rarr;
                </button>
              </div>
            )}

            {section === 'notifications' && (
              <div className="space-y-3 text-xs">
                <div>
                  <h2 className="text-base font-bold text-slate-900 m-0">
                    Personal Notifications
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 mb-0">
                    Control alerts shown in your browser session.
                  </p>
                </div>
                <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3 cursor-pointer">
                  <span>Desktop alerts for new inbound messages</span>
                  <input
                    type="checkbox"
                    checked={desktopNotifs}
                    onChange={(e) => setDesktopNotifs(e.target.checked)}
                    className="accent-[#602ee0]"
                  />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3 cursor-pointer">
                  <span>Alert when a private note is added on my chats</span>
                  <input
                    type="checkbox"
                    checked={mentionAlerts}
                    onChange={(e) => setMentionAlerts(e.target.checked)}
                    className="accent-[#602ee0]"
                  />
                </label>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
