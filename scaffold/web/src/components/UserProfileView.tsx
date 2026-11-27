import React, { useState } from 'react';
import { updateMe, type MeResponse } from '../api';
import { workspaceDisplayName } from './workspaceMeta';

interface UserProfileViewProps {
  me: MeResponse;
  workspace: string;
  onMeUpdated: (next: MeResponse) => void;
  onOpenAccountSettings: () => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function UserProfileView({
  me,
  workspace,
  onMeUpdated,
  onOpenAccountSettings,
}: UserProfileViewProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.name);
  const [email, setEmail] = useState(me.email);
  const [phone, setPhone] = useState(me.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const currentRole = me.workspaces.find((w) => w.id === workspace)?.role ?? 'agent';

  function startEdit() {
    setName(me.name);
    setEmail(me.email);
    setPhone(me.phone ?? '');
    setEditing((v) => !v);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const updated = await updateMe({ name, email, phone });
      onMeUpdated(updated);
      setEditing(false);
      setMsg({ kind: 'ok', text: 'Profile updated successfully.' });
    } catch (err) {
      setMsg({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Failed to update profile',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#f5f6fc] p-4 sm:p-6 pb-16 lg:pb-6">
      <div className="max-w-4xl mx-auto space-y-5">
        {msg && (
          <div
            className={`rounded-xl px-4 py-2.5 text-xs font-medium border flex items-center gap-2 ${
              msg.kind === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* Avatar & Summary Hero Card */}
        <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative shrink-0">
              <span className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-gradient-to-br from-[#7342f6] to-[#5625d6] text-white grid place-items-center text-xl sm:text-2xl font-bold shadow-md shadow-indigo-500/20">
                {initials(me.name)}
              </span>
              <button
                type="button"
                onClick={startEdit}
                title="Edit profile"
                aria-label="Edit profile"
                className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-xs grid place-items-center text-[#602ee0] hover:bg-violet-50 cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" strokeLinecap="round" />
                  <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <strong className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  {me.name}
                </strong>
                <span className="rounded-full bg-violet-100 text-[#602ee0] px-2.5 py-0.5 text-[11px] font-semibold capitalize">
                  {currentRole}
                </span>
              </div>
              <div className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">
                {me.email || me.sub}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenAccountSettings}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:border-[#602ee0] hover:text-[#602ee0] px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth="1.9">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            Account Settings
          </button>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-5 items-start">
          {/* Profile Information Card */}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
                Profile Information
              </h2>
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:border-[#602ee0] hover:text-[#602ee0] px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                {!editing && (
                  <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-[#602ee0]" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" strokeLinecap="round" />
                    <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" strokeLinejoin="round" />
                  </svg>
                )}
                {editing ? 'Cancel' : 'Edit Profile'}
              </button>
            </div>

            {editing ? (
              <form onSubmit={(e) => void handleSave(e)} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:border-[#602ee0]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:border-[#602ee0]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:border-[#602ee0]"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-xl border border-slate-200 px-3.5 py-2 font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#6532eb] to-[#5624d6] text-white px-4 py-2 font-semibold shadow-xs cursor-pointer disabled:opacity-60"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth="2.4">
                      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {busy ? 'Saving…' : 'Save Profile'}
                  </button>
                </div>
              </form>
            ) : (
              <dl className="divide-y divide-slate-100 text-xs sm:text-[13px] m-0">
                <div className="py-3.5 flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2.5 text-slate-500">
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-slate-400 shrink-0" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" strokeLinecap="round" />
                    </svg>
                    Full Name
                  </dt>
                  <dd className="m-0 font-semibold text-slate-900">{me.name}</dd>
                </div>
                <div className="py-3.5 flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2.5 text-slate-500">
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-slate-400 shrink-0" stroke="currentColor" strokeWidth="1.8">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="m3 7 9 6 9-6" strokeLinejoin="round" />
                    </svg>
                    Email
                  </dt>
                  <dd className="m-0 font-medium text-slate-800">{me.email || '—'}</dd>
                </div>
                <div className="py-3.5 flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2.5 text-slate-500">
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-slate-400 shrink-0" stroke="currentColor" strokeWidth="1.8">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92Z" />
                    </svg>
                    Phone
                  </dt>
                  <dd className="m-0 font-medium text-slate-800">{me.phone || 'Not set'}</dd>
                </div>
                <div className="py-3.5 flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2.5 text-slate-500">
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-slate-400 shrink-0" stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" strokeLinejoin="round" />
                    </svg>
                    Role ({workspaceDisplayName(workspace)})
                  </dt>
                  <dd className="m-0 font-semibold capitalize text-[#602ee0]">{currentRole}</dd>
                </div>
                <div className="py-3.5 flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2.5 text-slate-500">
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-slate-400 shrink-0" stroke="currentColor" strokeWidth="1.8">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    OIDC Subject
                  </dt>
                  <dd className="m-0 font-mono text-xs text-slate-700">{me.sub}</dd>
                </div>
              </dl>
            )}
          </section>

          {/* Workspace Access & Identity Card */}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
                Workspace Access
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-0">
                Tenants and roles granted by your OIDC identity.
              </p>
            </div>

            <div className="space-y-2.5">
              {me.workspaces.map((ws) => {
                const isCurrent = ws.id === workspace;
                return (
                  <div
                    key={ws.id}
                    className={`rounded-xl border px-3.5 py-2.5 flex items-center justify-between gap-2 ${
                      isCurrent
                        ? 'border-violet-200 bg-violet-50/60'
                        : 'border-slate-200/80 bg-slate-50/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {workspaceDisplayName(ws.id)}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">{ws.id}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isCurrent && (
                        <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-semibold">
                          Active
                        </span>
                      )}
                      <span className="rounded-full bg-violet-100 text-[#602ee0] px-2.5 py-0.5 text-[11px] font-semibold capitalize">
                        {ws.role}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5 text-xs text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-emerald-600" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" strokeLinejoin="round" />
                </svg>
                Authenticated via OIDC + PKCE
              </div>
              <p className="m-0 text-[11px] text-slate-500 leading-relaxed">
                Workspace permissions are tenant-isolated and verified on every API and WebSocket request.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
