import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchTeam,
  fetchWorkspaceSettings,
  inviteTeamAgent,
  removeTeamInvite,
  updateWorkspaceSettings,
  type MeResponse,
  type TeamMemberSummary,
  type TeamRole,
  type WorkspaceSettingsPayload,
} from '../api';
import {
  clearStoredWorkspaceKey,
  generateWorkspaceKey,
  setStoredWorkspaceKey,
} from '../crypto';

type SettingsSection =
  | 'profile'
  | 'members'
  | 'channels'
  | 'notifications'
  | 'security'
  | 'integrations';

interface WorkspaceSettingsViewProps {
  me: MeResponse;
  workspace: string;
  workspaceKey: string;
  keyId: string | null;
  wsConnected: boolean;
  lastSeq: number | undefined;
  onWorkspaceKeyChange: (nextKey: string) => void;
}

const SECTIONS: Array<{
  id: SettingsSection;
  title: string;
  subtitle: string;
  quickSubtitle: string;
  icon: string;
}> = [
  {
    id: 'profile',
    title: 'Workspace Profile',
    subtitle: 'Basic info, branding, and workspace details',
    quickSubtitle: 'Update workspace details',
    icon: '🏪',
  },
  {
    id: 'members',
    title: 'Workspace Members',
    subtitle: 'Manage members and their roles',
    quickSubtitle: 'Add, remove, and manage team access',
    icon: '👥',
  },
  {
    id: 'channels',
    title: 'Messaging Channels',
    subtitle: 'Connect and manage channels (WhatsApp, Email, etc.)',
    quickSubtitle: 'Connect WhatsApp, Email, and more',
    icon: '💬',
  },
  {
    id: 'notifications',
    title: 'Notification Settings',
    subtitle: 'Configure alerts and updates',
    quickSubtitle: 'Control what updates you receive',
    icon: '🔔',
  },
  {
    id: 'security',
    title: 'Security Settings',
    subtitle: 'Access, authentication, and policies',
    quickSubtitle: 'Manage access, SSO, and security policies',
    icon: '🛡',
  },
  {
    id: 'integrations',
    title: 'API & Integrations',
    subtitle: 'API keys, webhooks, and third-party apps',
    quickSubtitle: 'API keys, webhooks, and third-party integrations',
    icon: '🧩',
  },
];

const TIMEZONES = [
  '(UTC+05:30) Asia/Kolkata',
  '(UTC+00:00) UTC',
  '(UTC-05:00) America/New_York',
  '(UTC-08:00) America/Los_Angeles',
  '(UTC+01:00) Europe/Berlin',
];

export function WorkspaceSettingsView({
  me,
  workspace,
  workspaceKey,
  keyId,
  wsConnected,
  lastSeq,
  onWorkspaceKeyChange,
}: WorkspaceSettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>('profile');
  // Mobile starts on settings list first, then opens each section full-screen
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const [payload, setPayload] = useState<WorkspaceSettingsPayload | null>(null);
  const [members, setMembers] = useState<TeamMemberSummary[]>([]);

  // Editable Profile form
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [timezone, setTimezone] = useState(TIMEZONES[0]);

  // Channels / Notifications / Security toggles
  const [pigeonEnabled, setPigeonEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [newMessageAlerts, setNewMessageAlerts] = useState(true);
  const [assignmentAlerts, setAssignmentAlerts] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [dailyDigest, setDailyDigest] = useState(false);
  const [enforcePkce, setEnforcePkce] = useState(true);
  const [strictTenantIsolation, setStrictTenantIsolation] = useState(true);

  // Members quick invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('agent');

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const isAdmin = me.workspaces.find((w) => w.id === workspace)?.role === 'admin';

  const loadAll = useCallback(async () => {
    try {
      const [settingsRes, teamRes] = await Promise.all([
        fetchWorkspaceSettings(workspace),
        fetchTeam(workspace),
      ]);
      setPayload(settingsRes);
      setMembers(teamRes.members);

      const s = settingsRes.settings;
      setName(s.name);
      setSlug(s.slug);
      setDescription(s.description);
      setTimezone(s.timezone);
      setPigeonEnabled(s.channels.pigeonEnabled);
      setEmailEnabled(s.channels.emailEnabled);
      setNewMessageAlerts(s.notifications.newMessageAlerts);
      setAssignmentAlerts(s.notifications.assignmentAlerts);
      setSoundEnabled(s.notifications.soundEnabled);
      setDailyDigest(s.notifications.dailyDigest);
      setEnforcePkce(s.security.enforcePkce);
      setStrictTenantIsolation(s.security.strictTenantIsolation);
    } catch (e) {
      setFeedback({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Failed to load settings',
      });
    }
  }, [workspace]);

  useEffect(() => {
    setFeedback(null);
    void loadAll();
  }, [loadAll]);

  async function savePatch(patch: Partial<WorkspaceSettingsPayload['settings']>) {
    setSaving(true);
    setFeedback(null);
    try {
      await updateWorkspaceSettings(workspace, patch);
      setFeedback({ kind: 'ok', text: 'Changes saved.' });
      await loadAll();
    } catch (e) {
      setFeedback({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Failed to save settings',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleInviteMember(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSaving(true);
    setFeedback(null);
    try {
      await inviteTeamAgent(workspace, inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      setFeedback({ kind: 'ok', text: 'Member invited.' });
      await loadAll();
    } catch (e) {
      setFeedback({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Failed to invite member',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveInvite(email: string) {
    setSaving(true);
    setFeedback(null);
    try {
      await removeTeamInvite(workspace, email);
      setFeedback({ kind: 'ok', text: `Removed invitation for ${email}` });
      await loadAll();
    } catch (e) {
      setFeedback({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Failed to remove member',
      });
    } finally {
      setSaving(false);
    }
  }

  const toggleRow = (
    label: string,
    desc: string,
    checked: boolean,
    onChange: (v: boolean) => void
  ) => (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3 cursor-pointer">
      <div>
        <div className="text-xs font-semibold text-slate-900">{label}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-[#602ee0] cursor-pointer"
      />
    </label>
  );

  const openSection = (id: SettingsSection) => {
    setSection(id);
    setMobileShowDetail(true);
    setFeedback(null);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#f6f7fc] p-4 sm:p-6 pb-16 lg:pb-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Top Title */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight m-0">
            Workspace Settings
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 mb-0">
            Manage your workspace, team, channels, notifications, security, and integrations.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[270px_1fr] gap-5 items-start">
          {/* Left Settings Navigation (List first on mobile) */}
          <nav
            aria-label="Workspace settings sections"
            className={`${
              mobileShowDetail ? 'hidden lg:flex' : 'flex'
            } flex-col gap-2 bg-white rounded-2xl border border-slate-200/80 p-2.5 shadow-2xs`}
          >
            {SECTIONS.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openSection(item.id)}
                  className={`w-full text-left rounded-xl px-3.5 py-3 flex items-start gap-3 transition-all cursor-pointer ${
                    active
                      ? 'bg-violet-50/90 border border-violet-200 border-l-4 border-l-[#602ee0]'
                      : 'border border-transparent hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-lg grid place-items-center text-sm shrink-0 ${
                      active ? 'bg-violet-100 text-[#602ee0]' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-xs font-bold ${
                        active ? 'text-[#5b21b6]' : 'text-slate-900'
                      }`}
                    >
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                      {item.subtitle}
                    </div>
                  </div>
                  <span className="lg:hidden text-slate-400 text-xs self-center">&rsaquo;</span>
                </button>
              );
            })}
          </nav>

          {/* Right Active Section Content (Full-screen page on mobile when opened) */}
          <div
            className={`${
              mobileShowDetail ? 'block' : 'hidden lg:block'
            } space-y-5 min-w-0`}
          >
            {/* Mobile Back Bar */}
            <div className="lg:hidden flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMobileShowDetail(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                &larr; Workspace Settings
              </button>
              <span className="text-xs font-semibold text-slate-500">
                {SECTIONS.find((s) => s.id === section)?.title}
              </span>
            </div>

            {feedback && (
              <div
                className={`rounded-xl px-4 py-2.5 text-xs font-medium border ${
                  feedback.kind === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {feedback.text}
              </div>
            )}

            {/* 1. Workspace Profile */}
            {section === 'profile' && (
              <>
                <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 m-0">
                        Workspace Profile
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5 mb-0">
                        Update your workspace information and branding.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={saving || !isAdmin}
                      onClick={() =>
                        void savePatch({ name, slug, description, timezone })
                      }
                      className="rounded-xl bg-gradient-to-r from-[#6532eb] to-[#5624d6] hover:from-[#5726d8] hover:to-[#471bb8] disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 shadow-sm cursor-pointer disabled:cursor-not-allowed"
                    >
                      ✓ Save Changes
                    </button>
                  </div>

                  {/* Storefront Logo + Summary */}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-violet-100 border border-violet-200 grid place-items-center text-2xl shrink-0">
                      🏪
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-base text-slate-900 truncate">
                        {name || workspace}
                      </div>
                      <span className="inline-block rounded-full bg-violet-100 text-[#602ee0] px-2.5 py-0.5 text-[11px] font-semibold mt-0.5">
                        {slug || workspace}
                      </span>
                      <p className="text-xs text-slate-500 mt-1 mb-0 truncate">
                        {description}
                      </p>
                    </div>
                  </div>

                  {/* Form Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Workspace Name *
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Workspace Slug *
                      </label>
                      <input
                        type="text"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Description
                    </label>
                    <textarea
                      rows={2}
                      maxLength={200}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <div className="text-right text-[11px] text-slate-400 mt-0.5">
                      {description.length} / 200
                    </div>
                  </div>

                  {/* Metadata & Timezone Strip */}
                  <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <div className="text-[11px] text-slate-400">Created</div>
                      <div className="font-semibold text-slate-800 mt-0.5">
                        {payload
                          ? new Date(payload.settings.createdAt).toLocaleDateString()
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Members</div>
                      <div className="font-semibold text-slate-800 mt-0.5">
                        {payload?.metrics.members ?? members.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Conversations</div>
                      <div className="font-semibold text-slate-800 mt-0.5">
                        {payload?.metrics.conversations ?? 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Timezone</div>
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-800"
                      >
                        {TIMEZONES.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                {/* Quick Access Cards */}
                <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 m-0">Quick Access</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5 mb-0">
                      Manage other workspace settings.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SECTIONS.filter((s) => s.id !== 'profile').map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => openSection(s.id)}
                        className="rounded-xl border border-slate-200/80 hover:border-violet-400 bg-slate-50/50 hover:bg-violet-50/40 px-3.5 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-8 h-8 rounded-lg bg-violet-100 text-[#602ee0] grid place-items-center text-sm shrink-0">
                            {s.icon}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900">{s.title}</div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {s.quickSubtitle}
                            </div>
                          </div>
                        </div>
                        <span className="text-slate-400 text-sm">&rarr;</span>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* 2. Workspace Members */}
            {section === 'members' && (
              <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-5">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 m-0">
                    Workspace Members
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 mb-0">
                    Add, remove, and view member roles in <strong>{workspace}</strong>.
                  </p>
                </div>

                <form onSubmit={(e) => void handleInviteMember(e)} className="flex flex-wrap gap-2">
                  <input
                    type="email"
                    required
                    placeholder="teammate@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1 min-w-[180px] rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  >
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="agent">Agent</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    type="submit"
                    disabled={saving || !isAdmin}
                    className="rounded-xl bg-[#602ee0] hover:bg-[#4f22c4] disabled:opacity-50 text-white px-4 py-2 text-xs font-semibold cursor-pointer"
                  >
                    + Add Member
                  </button>
                </form>

                <div className="divide-y divide-slate-100">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{m.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">{m.email}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded-full bg-violet-100 text-[#602ee0] px-2.5 py-0.5 text-[11px] font-semibold capitalize">
                          {m.role}
                        </span>
                        {m.source === 'invite' && isAdmin && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleRemoveInvite(m.email)}
                            className="text-red-600 hover:underline text-[11px] font-medium cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 3. Messaging Channels */}
            {section === 'channels' && (
              <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 m-0">
                      Messaging Channels
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5 mb-0">
                      Connected customer messaging channels for {workspace}.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={saving || !isAdmin}
                    onClick={() =>
                      void savePatch({ channels: { pigeonEnabled, emailEnabled } })
                    }
                    className="rounded-xl bg-[#602ee0] disabled:opacity-50 text-white px-4 py-2 text-xs font-semibold cursor-pointer"
                  >
                    Save Channels
                  </button>
                </div>

                {toggleRow(
                  'Pigeon Messaging Provider (WhatsApp / SMS)',
                  `Endpoint: ${payload?.integrations.pigeonUrl ?? 'http://localhost:4010'} · Webhook: /webhooks/pigeon`,
                  pigeonEnabled,
                  setPigeonEnabled
                )}
                {toggleRow(
                  'Support Email Channel',
                  'Route inbound support emails into the shared Switchboard inbox',
                  emailEnabled,
                  setEmailEnabled
                )}
              </section>
            )}

            {/* 4. Notification Settings */}
            {section === 'notifications' && (
              <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 m-0">
                      Notification Settings
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5 mb-0">
                      Configure message alerts, assignments, and notification preferences.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={saving || !isAdmin}
                    onClick={() =>
                      void savePatch({
                        notifications: {
                          newMessageAlerts,
                          assignmentAlerts,
                          soundEnabled,
                          dailyDigest,
                        },
                      })
                    }
                    className="rounded-xl bg-[#602ee0] disabled:opacity-50 text-white px-4 py-2 text-xs font-semibold cursor-pointer"
                  >
                    Save Alerts
                  </button>
                </div>

                {toggleRow(
                  'New Customer Message Alerts',
                  'Trigger real-time UI notifications when inbound messages arrive',
                  newMessageAlerts,
                  setNewMessageAlerts
                )}
                {toggleRow(
                  'Conversation Assignment Alerts',
                  'Notify agents when a conversation is claimed or assigned',
                  assignmentAlerts,
                  setAssignmentAlerts
                )}
                {toggleRow(
                  'Audio Chime on Inbound',
                  'Play a subtle chime for incoming customer replies',
                  soundEnabled,
                  setSoundEnabled
                )}
                {toggleRow(
                  'Daily Summary Digest',
                  'Send a daily summary of open and resolved conversations',
                  dailyDigest,
                  setDailyDigest
                )}
              </section>
            )}

            {/* 5. Security Settings (SSO, Session, Access Policies, E2E Key) */}
            {section === 'security' && (
              <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 m-0">
                      Security Settings
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5 mb-0">
                      Authentication, active session, access policies, and E2E note encryption.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={saving || !isAdmin}
                    onClick={() =>
                      void savePatch({
                        security: {
                          enforcePkce,
                          sessionTtlHours: payload?.settings.security.sessionTtlHours ?? 24,
                          strictTenantIsolation,
                        },
                      })
                    }
                    className="rounded-xl bg-[#602ee0] disabled:opacity-50 text-white px-4 py-2 text-xs font-semibold cursor-pointer"
                  >
                    Save Policies
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-xs grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-500">Authenticated User:</span>{' '}
                    <strong>{me.name}</strong> (<code>{me.sub}</code>)
                  </div>
                  <div>
                    <span className="text-slate-500">Real-Time Socket:</span>{' '}
                    <strong>{wsConnected ? 'Connected' : 'Reconnecting'}</strong>
                    {typeof lastSeq === 'number' ? ` (seq #${lastSeq})` : ''}
                  </div>
                </div>

                {toggleRow(
                  'Enforce OpenID Connect + PKCE (S256)',
                  'Require code_challenge verification on every login redirect',
                  enforcePkce,
                  setEnforcePkce
                )}
                {toggleRow(
                  'Strict Multi-Tenant Workspace Isolation',
                  'Verify workspace membership on every API request and WebSocket upgrade',
                  strictTenantIsolation,
                  setStrictTenantIsolation
                )}

                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="text-xs font-bold text-slate-900">
                    End-to-End Encryption Key ({workspace})
                  </div>
                  <p className="text-[11px] text-slate-500 m-0">
                    Stored only in browser <code>localStorage</code> for AES-256-GCM private notes
                    and never sent to the server.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
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
                      className="flex-1 min-w-[220px] rounded-xl border border-slate-200 px-3 py-1.5 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void generateWorkspaceKey().then((k) => {
                          setStoredWorkspaceKey(workspace, k);
                          onWorkspaceKeyChange(k);
                        });
                      }}
                      className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold cursor-pointer"
                    >
                      Generate Key
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearStoredWorkspaceKey(workspace);
                        onWorkspaceKeyChange('');
                      }}
                      className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  {keyId && (
                    <div className="text-[11px] text-emerald-700">
                      Active key fingerprint: <code>{keyId}</code>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* 6. API & Integrations */}
            {section === 'integrations' && (
              <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 m-0">
                    API &amp; Integrations
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 mb-0">
                    Configured API endpoints, masked credentials, and webhook targets.
                  </p>
                </div>

                <dl className="divide-y divide-slate-100 text-xs m-0">
                  <div className="py-3 flex flex-wrap justify-between gap-2">
                    <dt className="text-slate-500">Pigeon API Key ({workspace})</dt>
                    <dd className="m-0 font-mono text-slate-900">
                      {payload?.integrations.maskedPigeonKey ?? '—'}
                    </dd>
                  </div>
                  <div className="py-3 flex flex-wrap justify-between gap-2">
                    <dt className="text-slate-500">Pigeon Base URL</dt>
                    <dd className="m-0 font-mono text-slate-900">
                      {payload?.integrations.pigeonUrl ?? '—'}
                    </dd>
                  </div>
                  <div className="py-3 flex flex-wrap justify-between gap-2">
                    <dt className="text-slate-500">Inbound Webhook Path (HMAC-SHA256)</dt>
                    <dd className="m-0 font-mono text-slate-900">
                      POST {payload?.integrations.webhookPath ?? '/webhooks/pigeon'}
                    </dd>
                  </div>
                  <div className="py-3 flex flex-wrap justify-between gap-2">
                    <dt className="text-slate-500">OIDC Identity Provider</dt>
                    <dd className="m-0 font-mono text-slate-900">
                      {payload?.integrations.oidcIssuer ?? '—'}
                    </dd>
                  </div>
                  <div className="py-3 flex flex-wrap justify-between gap-2">
                    <dt className="text-slate-500">Search Engine (Optional)</dt>
                    <dd className="m-0 font-mono text-slate-900">
                      {payload?.integrations.elasticsearchUrl ?? '—'}
                    </dd>
                  </div>
                </dl>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
