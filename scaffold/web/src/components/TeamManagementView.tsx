import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchTeam,
  inviteTeamAgent,
  type ConversationSummary,
  type MeResponse,
  type TeamMemberSummary,
  type TeamResponse,
  type TeamRole,
} from '../api';
import { formatRelativeTime } from './workspaceMeta';

interface TeamManagementViewProps {
  me: MeResponse;
  workspace: string;
  conversations: ConversationSummary[];
  busy: boolean;
  onClaim: (contact: string) => Promise<void>;
  onRelease: (contact: string) => Promise<void>;
  onOpenConversation: (contact: string) => void;
}

const ROLE_DEFINITIONS: Array<{
  role: TeamRole;
  title: string;
  summary: string;
  badgeClass: string;
  iconBg: string;
  permissions: string[];
}> = [
  {
    role: 'admin',
    title: 'Admin',
    summary: 'Full access to workspace, team, and settings',
    badgeClass: 'bg-violet-100 text-violet-800',
    iconBg: 'bg-amber-100 text-amber-700',
    permissions: [
      'Manage workspace settings & encryption keys',
      'Invite agents and assign roles',
      'Claim, release, close & reopen any conversation',
      'Reply to customers & write E2E private notes',
    ],
  },
  {
    role: 'manager',
    title: 'Manager',
    summary: 'Manage agents, conversations, and reports',
    badgeClass: 'bg-sky-100 text-sky-800',
    iconBg: 'bg-sky-100 text-sky-700',
    permissions: [
      'View team performance and conversation analytics',
      'Claim, release, close & reopen conversations',
      'Reply to customers & write E2E private notes',
    ],
  },
  {
    role: 'agent',
    title: 'Agent',
    summary: 'Handle conversations and manage assigned chats',
    badgeClass: 'bg-indigo-100 text-indigo-800',
    iconBg: 'bg-indigo-100 text-indigo-700',
    permissions: [
      'Claim unassigned conversations & release own chats',
      'Close and reopen conversations',
      'Reply to customers & write E2E private notes',
    ],
  },
  {
    role: 'viewer',
    title: 'Viewer',
    summary: 'Read-only access to conversations and reports',
    badgeClass: 'bg-slate-200 text-slate-700',
    iconBg: 'bg-slate-200 text-slate-600',
    permissions: [
      'Read workspace conversations & message history',
      'View team dashboard & performance metrics',
    ],
  },
];

const STATUS_STYLE: Record<'active' | 'away' | 'offline', { pill: string; dot: string; label: string }> = {
  active: { pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', label: 'Active' },
  away: { pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500', label: 'Away' },
  offline: { pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400', label: 'Offline' },
};

const AVATAR_TONES = [
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-800',
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

function formatSec(sec: number | null): string {
  if (sec === null) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function TeamManagementView({
  me,
  workspace,
  conversations,
  busy,
  onClaim,
  onRelease,
  onOpenConversation,
}: TeamManagementViewProps) {
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'roles' | 'queue'>('overview');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'away' | 'offline'>('all');
  const [selectedAgent, setSelectedAgent] = useState<TeamMemberSummary | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'activity' | 'permissions'>('overview');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('agent');
  const [inviteMsg, setInviteMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const loadTeam = () => {
    void fetchTeam(workspace)
      .then((res) => {
        setTeam(res);
        setSelectedAgent((prev) =>
          prev ? (res.members.find((m) => m.id === prev.id) ?? null) : null
        );
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadTeam();
  }, [workspace]);

  const members = team?.members ?? [];
  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q)
      );
    });
  }, [members, search, statusFilter]);

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteMsg(null);
    try {
      await inviteTeamAgent(workspace, inviteEmail.trim(), inviteRole);
      setInviteMsg({ kind: 'ok', text: `Invitation saved for ${inviteEmail.trim()}` });
      setInviteEmail('');
      loadTeam();
    } catch (err) {
      setInviteMsg({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Failed to invite agent',
      });
    }
  }

  // Team Activity chart geometry
  const activity =
    team?.activity ??
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({
      day,
      conversations: 0,
    }));
  const W = 460;
  const H = 145;
  const padL = 28;
  const padR = 14;
  const padT = 18;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxConv = Math.max(5, ...activity.map((a) => a.conversations));
  const stepX = activity.length > 1 ? plotW / (activity.length - 1) : plotW;
  const points = activity.map((a, i) => ({
    x: padL + i * stepX,
    y: padT + plotH - (a.conversations / maxConv) * plotH,
    ...a,
  }));
  const linePath = buildSmoothPath(points);
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${padT + plotH} L ${points[0].x} ${padT + plotH} Z`
      : '';

  const myRole = me.workspaces.find((w) => w.id === workspace)?.role ?? 'agent';

  const renderAgentsTable = (limit?: number) => {
    const list = typeof limit === 'number' ? filteredMembers.slice(0, limit) : filteredMembers;
    return (
      <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
              Agents ({filteredMembers.length})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <input
              type="search"
              placeholder="Search agents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 sm:w-48 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | 'active' | 'away' | 'offline')
              }
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="away">Away</option>
              <option value="offline">Offline</option>
            </select>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="py-2.5 font-semibold">Agent</th>
                <th className="py-2.5 font-semibold">Role</th>
                <th className="py-2.5 font-semibold">Status</th>
                <th className="py-2.5 font-semibold">Conversations</th>
                <th className="py-2.5 font-semibold">Last Active</th>
                <th className="py-2.5 text-right font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No agents match your search.
                  </td>
                </tr>
              ) : (
                list.map((m, idx) => {
                  const st = STATUS_STYLE[m.status];
                  const roleDef =
                    ROLE_DEFINITIONS.find((r) => r.role === m.role) ?? ROLE_DEFINITIONS[2];
                  return (
                    <tr
                      key={m.id}
                      onClick={() => {
                        setSelectedAgent(m);
                        setDetailTab('overview');
                      }}
                      className="hover:bg-violet-50/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-8 h-8 rounded-full grid place-items-center text-xs font-bold shrink-0 ${
                              AVATAR_TONES[idx % AVATAR_TONES.length]
                            }`}
                          >
                            {initials(m.name)}
                          </span>
                          <div>
                            <div className="font-semibold text-slate-900">{m.name}</div>
                            <div className="text-[11px] text-slate-500">{m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${roleDef.badgeClass}`}
                        >
                          {m.role}
                        </span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.pill}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="py-3 font-semibold text-slate-800">{m.conversations}</td>
                      <td className="py-3 text-slate-500">
                        {m.lastActiveAt ? formatRelativeTime(m.lastActiveAt) + ' ago' : '—'}
                      </td>
                      <td className="py-3 text-right text-slate-400">•••</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List */}
        <div className="md:hidden space-y-2.5">
          {list.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">No matching agents.</div>
          ) : (
            list.map((m, idx) => {
              const st = STATUS_STYLE[m.status];
              const roleDef =
                ROLE_DEFINITIONS.find((r) => r.role === m.role) ?? ROLE_DEFINITIONS[2];
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedAgent(m);
                    setDetailTab('overview');
                  }}
                  className="w-full text-left rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-9 h-9 rounded-full grid place-items-center text-xs font-bold shrink-0 ${
                        AVATAR_TONES[idx % AVATAR_TONES.length]
                      }`}
                    >
                      {initials(m.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">{m.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{m.email}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${roleDef.badgeClass}`}
                        >
                          {m.role}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${st.pill}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-slate-900">{m.conversations}</div>
                    <div className="text-[10px] text-slate-400">chats</div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#f5f6fc] p-4 sm:p-6 pb-16 lg:pb-6 space-y-5">
      {/* Sub-navigation tabs + Invite Agent CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-5 overflow-x-auto">
          {(
            [
              ['overview', 'Overview'],
              ['agents', 'Agents'],
              ['roles', 'Roles & Permissions'],
              ['queue', 'Conversation Queue'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`pb-2 text-xs sm:text-[13px] font-semibold border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === id
                  ? 'border-[#602ee0] text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            setInviteMsg(null);
            setShowInviteModal(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#6532eb] to-[#5624d6] hover:from-[#5726d8] hover:to-[#471bb8] text-white text-xs font-semibold px-3.5 py-1.5 shadow-sm shadow-indigo-600/20 cursor-pointer"
        >
          <span>+ Invite Agent</span>
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.75fr_1fr] gap-5 items-start">
          {/* Left Main Column: Status KPIs + Activity + Performance + Agents List */}
          <div className="space-y-5 min-w-0">
            {/* 4 Pastel Status Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl bg-[#f1ecfe] border border-violet-200/70 p-3.5 flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-white/80 text-[#602ee0] grid place-items-center shrink-0">
                  👥
                </span>
                <div>
                  <div className="text-xl font-bold text-[#4c1d95] leading-none">
                    {team?.summary.totalAgents ?? 0}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">Total Agents</div>
                </div>
              </div>

              <div className="rounded-2xl bg-[#eaf8f0] border border-emerald-200/70 p-3.5 flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-white/80 text-emerald-600 grid place-items-center shrink-0">
                  ●
                </span>
                <div>
                  <div className="text-xl font-bold text-emerald-700 leading-none">
                    {team?.summary.active ?? 0}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">Active</div>
                </div>
              </div>

              <div className="rounded-2xl bg-[#fef4e4] border border-amber-200/70 p-3.5 flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-white/80 text-amber-600 grid place-items-center shrink-0">
                  ◷
                </span>
                <div>
                  <div className="text-xl font-bold text-amber-700 leading-none">
                    {team?.summary.away ?? 0}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">Away</div>
                </div>
              </div>

              <div className="rounded-2xl bg-[#fdeded] border border-rose-200/70 p-3.5 flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-white/80 text-rose-600 grid place-items-center shrink-0">
                  ⊘
                </span>
                <div>
                  <div className="text-xl font-bold text-rose-700 leading-none">
                    {team?.summary.offline ?? 0}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">Offline</div>
                </div>
              </div>
            </div>

            {/* Team Activity Chart + Performance Card */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
              <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
                <h2 className="text-sm font-bold text-slate-900 m-0">Team Activity</h2>
                <p className="text-[11px] text-slate-500 mt-0.5 mb-2">
                  Conversations handled by team
                </p>

                <div className="relative">
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-36">
                    <defs>
                      <linearGradient id="teamActFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {[0, 0.5, 1].map((t) => {
                      const y = padT + plotH - t * plotH;
                      return (
                        <g key={t}>
                          <line
                            x1={padL}
                            y1={y}
                            x2={W - padR}
                            y2={y}
                            stroke="#e2e8f0"
                            strokeDasharray="3 3"
                          />
                          <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
                            {Math.round(t * maxConv)}
                          </text>
                        </g>
                      );
                    })}

                    {areaPath && <path d={areaPath} fill="url(#teamActFill)" />}
                    {linePath && (
                      <path
                        d={linePath}
                        fill="none"
                        stroke="#6d28d9"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                      />
                    )}

                    {points.map((pt, i) => (
                      <g key={`${pt.day}_${i}`}>
                        <text
                          x={pt.x}
                          y={H - 5}
                          textAnchor="middle"
                          fontSize="10"
                          fill="#64748b"
                        >
                          {pt.day}
                        </text>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={hoveredIdx === i ? 5 : 3.5}
                          fill="#6d28d9"
                          stroke="#ffffff"
                          strokeWidth="1.5"
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredIdx(i)}
                          onMouseLeave={() => setHoveredIdx(null)}
                        />
                      </g>
                    ))}
                  </svg>

                  {hoveredIdx !== null && points[hoveredIdx] && (
                    <div className="absolute top-1 right-2 rounded-lg bg-slate-900 text-white px-2.5 py-1 text-[11px] shadow-md pointer-events-none">
                      {points[hoveredIdx].day}: {points[hoveredIdx].conversations} conversations
                    </div>
                  )}
                </div>
              </section>

              <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 mt-0 mb-3">
                    Performance <span className="text-xs font-normal text-slate-400">(Last 7 days)</span>
                  </h2>
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Avg. First Response</span>
                      <strong className="text-emerald-600">
                        {formatSec(team?.performance.avgFirstResponseSec ?? null)}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Messages Sent</span>
                      <strong className="text-indigo-600">
                        {team?.performance.messagesSent ?? 0}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Conversations Handled</span>
                      <strong className="text-slate-900">
                        {team?.performance.conversationsHandled ?? 0}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Resolution Rate</span>
                      <strong className="text-emerald-600">
                        {team?.performance.resolutionRate ?? 0}%
                      </strong>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {renderAgentsTable()}
          </div>

          {/* Right Column: Team Illustration + Roles & Permissions + Invite Agent Card */}
          <div className="space-y-5">
            {/* Compact Team Illustration Card */}
            <div className="hidden xl:flex rounded-2xl bg-gradient-to-br from-[#f3efff] to-[#e9e4ff] border border-violet-200/60 p-5 items-center justify-center">
              <div className="flex items-center -space-x-3">
                <span className="w-12 h-12 rounded-full bg-pink-200 border-2 border-white grid place-items-center text-sm font-bold text-pink-800 shadow-sm">
                  AR
                </span>
                <span className="w-16 h-16 rounded-full bg-gradient-to-br from-[#7342f6] to-[#5625d6] border-2 border-white grid place-items-center text-base font-bold text-white shadow-md z-10">
                  {initials(me.name)}
                </span>
                <span className="w-12 h-12 rounded-full bg-sky-200 border-2 border-white grid place-items-center text-sm font-bold text-sky-800 shadow-sm">
                  EN
                </span>
              </div>
            </div>

            {/* Roles & Permissions Summary Card */}
            <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 m-0">Roles &amp; Permissions</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('roles')}
                  className="text-xs font-semibold text-[#602ee0] hover:underline cursor-pointer"
                >
                  Details &rarr;
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {ROLE_DEFINITIONS.map((r) => (
                  <button
                    key={r.role}
                    type="button"
                    onClick={() => setActiveTab('roles')}
                    className="w-full py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 rounded-lg px-1 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className={`w-7 h-7 rounded-lg grid place-items-center text-xs font-bold shrink-0 ${r.iconBg}`}
                      >
                        {r.title[0]}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900">{r.title}</div>
                        <div className="text-[11px] text-slate-500 leading-snug">{r.summary}</div>
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-semibold shrink-0">
                      {team?.roleCounts[r.role] ?? 0} agents
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* Quick Invite Agent Card */}
            <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 m-0">Invite Agent</h2>
                <p className="text-[11px] text-slate-500 mt-0.5 mb-0">
                  Add a new agent to <strong>{workspace}</strong>.
                </p>
              </div>

              <form onSubmit={(e) => void handleSendInvite(e)} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="Enter agent's email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Role *
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="agent">Agent</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>

                {inviteMsg && (
                  <div
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] ${
                      inviteMsg.kind === 'ok'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {inviteMsg.text}
                  </div>
                )}

                {myRole !== 'admin' && (
                  <div className="text-[11px] text-slate-400">
                    Note: Only workspace admins can send invitations.
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full rounded-xl bg-gradient-to-r from-[#6532eb] to-[#5624d6] hover:from-[#5726d8] hover:to-[#471bb8] text-white text-xs font-semibold py-2.5 shadow-sm cursor-pointer"
                >
                  Send Invite
                </button>
              </form>
            </section>
          </div>
        </div>
      )}

      {activeTab === 'agents' && renderAgentsTable()}

      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ROLE_DEFINITIONS.map((r) => (
            <section
              key={r.role}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-9 h-9 rounded-xl grid place-items-center text-sm font-bold ${r.iconBg}`}
                  >
                    {r.title[0]}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 m-0">{r.title}</h3>
                    <p className="text-xs text-slate-500 m-0">{r.summary}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.badgeClass}`}>
                  {team?.roleCounts[r.role] ?? 0} agents
                </span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-600 pl-4 m-0 list-disc">
                {r.permissions.map((perm) => (
                  <li key={perm}>{perm}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {activeTab === 'queue' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(
            [
              ['Assigned to Me', conversations.filter((c) => c.assignee === me.sub)],
              [
                'Unassigned Queue',
                conversations.filter((c) => c.assignee === null && c.status === 'open'),
              ],
              [
                'Assigned to Other Agents',
                conversations.filter((c) => c.assignee !== null && c.assignee !== me.sub),
              ],
            ] as const
          ).map(([title, items]) => (
            <div
              key={title}
              className="bg-white border border-slate-200 rounded-2xl flex flex-col min-h-[240px]"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <h3 className="text-xs font-bold text-slate-900 m-0">{title}</h3>
                <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-semibold">
                  {items.length}
                </span>
              </div>
              <div className="p-3 space-y-2.5">
                {items.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">None</div>
                ) : (
                  items.map((c) => (
                    <div
                      key={c.contact}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-xs text-slate-900">{c.contact}</strong>
                        <span className="text-[10px] font-semibold text-slate-500 uppercase">
                          {c.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 truncate">
                        {c.lastMessagePreview || 'No messages yet'}
                      </div>
                      <div className="flex gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => onOpenConversation(c.contact)}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 cursor-pointer"
                        >
                          Open
                        </button>
                        {c.assignee === null && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onClaim(c.contact)}
                            className="rounded-md bg-[#602ee0] px-2 py-1 text-[11px] font-semibold text-white cursor-pointer"
                          >
                            Claim
                          </button>
                        )}
                        {(c.assignee === me.sub ||
                          (c.assignee !== null && myRole === 'admin')) && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onRelease(c.contact)}
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 cursor-pointer"
                          >
                            Release
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agent Details Drawer (Section 3: Overview | Activity | Permissions) */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setSelectedAgent(null)}
          />
          <aside className="relative z-10 w-full max-w-sm bg-white h-full shadow-2xl flex flex-col">
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-11 h-11 rounded-full bg-violet-100 text-violet-700 grid place-items-center text-sm font-bold shrink-0">
                  {initials(selectedAgent.name)}
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900 truncate">
                    {selectedAgent.name}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{selectedAgent.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    STATUS_STYLE[selectedAgent.status].pill
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLE[selectedAgent.status].dot}`} />
                  {STATUS_STYLE[selectedAgent.status].label}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedAgent(null)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex items-center gap-5 px-5 pt-3 border-b border-slate-200">
              {(['overview', 'activity', 'permissions'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDetailTab(t)}
                  className={`pb-2.5 text-xs font-semibold border-b-2 capitalize cursor-pointer ${
                    detailTab === t
                      ? 'border-[#602ee0] text-[#602ee0]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 text-xs">
              {detailTab === 'overview' && (
                <dl className="space-y-3 m-0">
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <dt className="text-slate-500">Role</dt>
                    <dd className="m-0 font-semibold capitalize text-violet-700">
                      {selectedAgent.role}
                    </dd>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <dt className="text-slate-500">Joined</dt>
                    <dd className="m-0 text-slate-800">
                      {new Date(selectedAgent.joinedAt).toLocaleDateString()}
                    </dd>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <dt className="text-slate-500">Conversations Handled</dt>
                    <dd className="m-0 font-semibold text-slate-900">
                      {selectedAgent.conversations}
                    </dd>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <dt className="text-slate-500">Closed Conversations</dt>
                    <dd className="m-0 font-semibold text-emerald-700">
                      {selectedAgent.closedConversations}
                    </dd>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <dt className="text-slate-500">Resolution Rate</dt>
                    <dd className="m-0 font-semibold text-emerald-700">
                      {selectedAgent.conversations > 0
                        ? Math.round(
                            (selectedAgent.closedConversations / selectedAgent.conversations) * 100
                          )
                        : 0}
                      %
                    </dd>
                  </div>
                </dl>
              )}

              {detailTab === 'activity' && (
                <div className="space-y-2.5">
                  {conversations.filter((c) => c.assignee === selectedAgent.id).length === 0 ? (
                    <div className="text-slate-400 py-6 text-center">
                      No assigned conversations in {workspace}.
                    </div>
                  ) : (
                    conversations
                      .filter((c) => c.assignee === selectedAgent.id)
                      .map((c) => (
                        <button
                          key={c.contact}
                          type="button"
                          onClick={() => {
                            setSelectedAgent(null);
                            onOpenConversation(c.contact);
                          }}
                          className="w-full text-left rounded-xl border border-slate-200 p-3 hover:border-violet-500 cursor-pointer"
                        >
                          <div className="flex justify-between font-semibold text-slate-900">
                            <span>{c.contact}</span>
                            <span className="text-slate-400">
                              {formatRelativeTime(c.lastActivityAt)}
                            </span>
                          </div>
                          <div className="text-slate-500 truncate mt-0.5">
                            {c.lastMessagePreview || 'No preview'}
                          </div>
                        </button>
                      ))
                  )}
                </div>
              )}

              {detailTab === 'permissions' && (
                <ul className="space-y-2 pl-4 list-disc text-slate-700 m-0">
                  {(
                    ROLE_DEFINITIONS.find((r) => r.role === selectedAgent.role) ??
                    ROLE_DEFINITIONS[2]
                  ).permissions.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Invite Agent Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div
            className="fixed inset-0 bg-slate-950/45"
            onClick={() => setShowInviteModal(false)}
          />
          <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">Invite Agent</h3>
                <p className="text-xs text-slate-500 mt-0.5 mb-0">
                  Add a new agent to {workspace}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={(e) => void handleSendInvite(e)} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="Enter agent's email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Role *</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="agent">Agent</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>

              {inviteMsg && (
                <div
                  className={`rounded-lg px-3 py-2 text-xs ${
                    inviteMsg.kind === 'ok'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {inviteMsg.text}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-gradient-to-r from-[#6532eb] to-[#5624d6] text-white px-4 py-2 text-xs font-semibold shadow-sm cursor-pointer"
                >
                  Send Invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
