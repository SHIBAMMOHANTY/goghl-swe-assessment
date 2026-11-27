import React, { useState } from 'react';
import { updateMe, type MeResponse } from '../api';

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const updated = await updateMe({ name, email, phone });
      onMeUpdated(updated);
      setEditing(false);
      setMsg({ kind: 'ok', text: 'Profile updated.' });
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
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#f6f7fc] p-4 sm:p-6 pb-16 lg:pb-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 m-0">User Profile</h1>
          <button
            type="button"
            onClick={onOpenAccountSettings}
            className="rounded-xl border border-slate-200 bg-white hover:border-[#602ee0] hover:text-[#602ee0] px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            Account Settings &rarr;
          </button>
        </div>

        {msg && (
          <div
            className={`rounded-xl px-4 py-2 text-xs border ${
              msg.kind === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* Avatar & Summary Header */}
        <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs flex flex-wrap items-center gap-4">
          <div className="relative">
            <span className="w-16 h-16 rounded-full bg-gradient-to-br from-[#7342f6] to-[#5625d6] text-white grid place-items-center text-xl font-bold shadow-md">
              {initials(me.name)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <strong className="text-lg text-slate-900">{me.name}</strong>
              <span className="rounded-full bg-violet-100 text-[#602ee0] px-2.5 py-0.5 text-xs font-semibold capitalize">
                {currentRole}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{me.email || me.sub}</div>
          </div>
        </section>

        {/* Profile Information Card */}
        <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
              Profile Information
            </h2>
            <button
              type="button"
              onClick={() => {
                setName(me.name);
                setEmail(me.email);
                setPhone(me.phone ?? '');
                setEditing((v) => !v);
              }}
              className="rounded-xl border border-slate-200 bg-white hover:border-[#602ee0] hover:text-[#602ee0] px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              {editing ? 'Cancel' : '✎ Edit Profile'}
            </button>
          </div>

          {editing ? (
            <form onSubmit={(e) => void handleSave(e)} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
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
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phone</label>
                <input
                  type="text"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-gradient-to-r from-[#6532eb] to-[#5624d6] text-white px-4 py-2 font-semibold cursor-pointer"
                >
                  ✓ Save Profile
                </button>
              </div>
            </form>
          ) : (
            <dl className="divide-y divide-slate-100 text-xs m-0">
              <div className="py-3 flex justify-between gap-3">
                <dt className="text-slate-500">Full Name</dt>
                <dd className="m-0 font-semibold text-slate-900">{me.name}</dd>
              </div>
              <div className="py-3 flex justify-between gap-3">
                <dt className="text-slate-500">Email</dt>
                <dd className="m-0 font-medium text-slate-800">{me.email || '—'}</dd>
              </div>
              <div className="py-3 flex justify-between gap-3">
                <dt className="text-slate-500">Phone</dt>
                <dd className="m-0 font-medium text-slate-800">{me.phone || 'Not set'}</dd>
              </div>
              <div className="py-3 flex justify-between gap-3">
                <dt className="text-slate-500">Role ({workspace})</dt>
                <dd className="m-0 font-semibold capitalize text-[#602ee0]">{currentRole}</dd>
              </div>
              <div className="py-3 flex justify-between gap-3">
                <dt className="text-slate-500">OIDC Subject</dt>
                <dd className="m-0 font-mono text-slate-700">{me.sub}</dd>
              </div>
            </dl>
          )}
        </section>
      </div>
    </div>
  );
}
