import type { DashboardResponse, MeResponse } from '../api';
import heroInboxImg from '../assets/hero-inbox.png';
import type { InboxFilter } from './InboxDashboard';
import { formatRelativeTime, workspaceDisplayName } from './workspaceMeta';

interface DashboardViewProps {
  me: MeResponse;
  workspace: string;
  dashboard: DashboardResponse | null;
  onOpenInboxFilter: (filter: InboxFilter) => void;
  onOpenConversation: (contact: string) => void;
}

const AVATAR_TONES = [
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-800',
  'bg-sky-100 text-sky-700',
];

function contactInitials(contact: string): string {
  const digits = contact.replace(/\D/g, '');
  if (digits.length >= 2) return digits.slice(-2);
  return contact.slice(0, 2).toUpperCase();
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

function formatDuration(sec: number | null): string {
  if (sec === null) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function describeEvent(ev: DashboardResponse['recentEvents'][number]): {
  text: string;
  dot: string;
} {
  if (ev.type === 'message.inbound') {
    return { text: `New message from ${ev.contact ?? 'customer'}`, dot: 'bg-emerald-500' };
  }
  if (ev.type === 'conversation.assigned') {
    return {
      text: ev.assignee
        ? `Conversation ${ev.contact ?? ''} claimed by ${ev.assignee}`
        : `Conversation ${ev.contact ?? ''} released`,
      dot: 'bg-violet-600',
    };
  }
  if (ev.type === 'message.status') {
    return {
      text: `Message ${ev.status ?? 'updated'} for ${ev.contact ?? 'contact'}`,
      dot: ev.status === 'failed' ? 'bg-red-500' : 'bg-sky-500',
    };
  }
  if (ev.type === 'note.created') {
    return { text: `Encrypted note added on ${ev.contact ?? 'thread'}`, dot: 'bg-amber-500' };
  }
  return { text: `${ev.type} · ${ev.contact ?? ''}`.trim(), dot: 'bg-slate-400' };
}

export function DashboardView({
  me,
  workspace,
  dashboard,
  onOpenInboxFilter,
  onOpenConversation,
}: DashboardViewProps) {
  const firstName = me.name.split(' ')[0] || me.name;
  const stats = dashboard?.stats ?? { open: 0, mine: 0, unassigned: 0, closed: 0 };
  const activity =
    dashboard?.activity ??
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({
      day,
      conversations: 0,
      messages: 0,
    }));

  // SVG chart geometry
  const W = 520;
  const H = 165;
  const padL = 32;
  const padR = 14;
  const padT = 14;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxVal = Math.max(
    10,
    ...activity.flatMap((a) => [a.conversations, a.messages])
  );
  const stepX = activity.length > 1 ? plotW / (activity.length - 1) : plotW;

  const msgPoints = activity.map((a, i) => ({
    x: padL + i * stepX,
    y: padT + plotH - (a.messages / maxVal) * plotH,
  }));
  const convPoints = activity.map((a, i) => ({
    x: padL + i * stepX,
    y: padT + plotH - (a.conversations / maxVal) * plotH,
  }));

  const msgLine = buildSmoothPath(msgPoints);
  const convLine = buildSmoothPath(convPoints);
  const msgArea =
    msgPoints.length > 0
      ? `${msgLine} L ${msgPoints[msgPoints.length - 1].x} ${padT + plotH} L ${msgPoints[0].x} ${padT + plotH} Z`
      : '';
  const convArea =
    convPoints.length > 0
      ? `${convLine} L ${convPoints[convPoints.length - 1].x} ${padT + plotH} L ${convPoints[0].x} ${padT + plotH} Z`
      : '';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#f5f6fc] p-4 sm:p-6 space-y-5">
      {/* Welcome Banner + 4 Pastel KPI Cards + Floating 3D Inbox Graphic */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#f8f9fe] via-white to-[#f0ebff] border border-slate-200/80 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight m-0">
                Welcome back, {firstName}!
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 mb-0">
                Here&apos;s what&apos;s happening in {workspaceDisplayName(workspace)} today.
              </p>
            </div>

            {/* 4 Dashboard Overview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => onOpenInboxFilter('open')}
                className="rounded-xl bg-[#f1ecfe] hover:bg-[#eae2fe] border border-violet-200/60 p-3 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-white/80 text-[#6d28d9] grid place-items-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.9">
                      <path d="M21 12c0 4.4-4 8-9 8a9.8 9.8 0 0 1-4.3-1L3 20l1.4-3.6C3.5 15.1 3 13.6 3 12c0-4.4 4-8 9-8s9 3.6 9 8Z" />
                    </svg>
                  </span>
                  <div>
                    <div className="text-lg sm:text-xl font-bold text-[#4c1d95] leading-none">
                      {stats.open}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">Open Conversations</div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onOpenInboxFilter('mine')}
                className="rounded-xl bg-[#eaf8f0] hover:bg-[#dff4e8] border border-emerald-200/60 p-3 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-white/80 text-emerald-600 grid place-items-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.9">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </span>
                  <div>
                    <div className="text-lg sm:text-xl font-bold text-emerald-700 leading-none">
                      {stats.mine}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">Mine</div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onOpenInboxFilter('unassigned')}
                className="rounded-xl bg-[#fef4e4] hover:bg-[#fcecd3] border border-amber-200/70 p-3 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-white/80 text-amber-600 grid place-items-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.9">
                      <path d="M12 2H2v10l9.3 9.3a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8L12 2Z" />
                      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
                    </svg>
                  </span>
                  <div>
                    <div className="text-lg sm:text-xl font-bold text-amber-700 leading-none">
                      {stats.unassigned}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">Unassigned</div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onOpenInboxFilter('closed')}
                className="rounded-xl bg-[#eaf4fd] hover:bg-[#dceefb] border border-sky-200/70 p-3 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-white/80 text-sky-600 grid place-items-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.9">
                      <circle cx="12" cy="12" r="9" />
                      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div>
                    <div className="text-lg sm:text-xl font-bold text-sky-700 leading-none">
                      {stats.closed}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">Closed</div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 3D Inbox Graphic */}
          <div className="hidden md:flex shrink-0 w-44 xl:w-52 justify-end">
            <img
              src={heroInboxImg}
              alt="Switchboard inbox graphic"
              className="w-full h-auto drop-shadow-[0_14px_24px_rgba(79,38,214,0.22)] select-none"
            />
          </div>
        </div>
      </section>

      {/* Middle Row: Conversation Activity Chart + Recent Conversations */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-4 sm:gap-5">
        <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
                Conversation Activity
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-0">
                Messages and conversations over time
              </p>
            </div>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
              Last 7 days
            </span>
          </div>

          <div className="w-full overflow-hidden">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44 sm:h-48">
              <defs>
                <linearGradient id="dashMsgFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="dashConvFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const y = padT + plotH - t * plotH;
                const val = Math.round(t * maxVal);
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
                    <text
                      x={padL - 6}
                      y={y + 3}
                      textAnchor="end"
                      fontSize="10"
                      fill="#94a3b8"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {msgArea && <path d={msgArea} fill="url(#dashMsgFill)" />}
              {convArea && <path d={convArea} fill="url(#dashConvFill)" />}
              {msgLine && (
                <path d={msgLine} fill="none" stroke="#38bdf8" strokeWidth="2.4" strokeLinecap="round" />
              )}
              {convLine && (
                <path d={convLine} fill="none" stroke="#7c3aed" strokeWidth="2.4" strokeLinecap="round" />
              )}

              {activity.map((a, i) => (
                <text
                  key={`${a.day}_${i}`}
                  x={padL + i * stepX}
                  y={H - 6}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#64748b"
                >
                  {a.day}
                </text>
              ))}
            </svg>
          </div>

          <div className="flex items-center justify-center gap-6 pt-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#7c3aed]" />
              Conversations
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8]" />
              Messages
            </span>
          </div>
        </section>

        {/* Recent Conversations Card */}
        <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
              Recent Conversations
            </h2>
            <button
              type="button"
              onClick={() => onOpenInboxFilter('open')}
              className="text-xs font-semibold text-[#602ee0] hover:text-[#4c1ec4] cursor-pointer"
            >
              View all &rarr;
            </button>
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {!dashboard || dashboard.recentConversations.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                No conversations in {workspaceDisplayName(workspace)} yet.
              </div>
            ) : (
              dashboard.recentConversations.slice(0, 4).map((c, idx) => (
                <button
                  key={c.contact}
                  type="button"
                  onClick={() => onOpenConversation(c.contact)}
                  className="w-full py-2.5 px-1.5 -mx-1.5 rounded-xl hover:bg-slate-50 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-9 h-9 rounded-full grid place-items-center text-xs font-bold shrink-0 ${
                        AVATAR_TONES[idx % AVATAR_TONES.length]
                      }`}
                    >
                      {contactInitials(c.contact)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                        {c.contact}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {c.lastMessagePreview || 'No messages yet'}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[11px] text-slate-400">
                      {formatRelativeTime(c.lastActivityAt)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        c.status === 'open'
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Bottom Row: Team Activity + Real-time Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 mt-0 mb-4">
            Team Activity
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xl sm:text-2xl font-bold text-[#602ee0]">
                {dashboard?.teamActivity.activeAgents ?? 0}
              </div>
              <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Active Agents</div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-sky-600">
                {dashboard?.teamActivity.handledToday ?? 0}
              </div>
              <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                Conversations Handled Today
              </div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-emerald-600">
                {formatDuration(dashboard?.teamActivity.avgFirstResponseSec ?? null)}
              </div>
              <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                Avg. First Response
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 mt-0 mb-3">
            Real-time Events
          </h2>
          <div className="space-y-2.5">
            {!dashboard || dashboard.recentEvents.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">
                Waiting for live messages or status updates…
              </div>
            ) : (
              dashboard.recentEvents.slice(0, 4).map((ev) => {
                const info = describeEvent(ev);
                return (
                  <div
                    key={ev.seq}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${info.dot}`} />
                      <span className="text-slate-700 truncate">{info.text}</span>
                    </span>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {formatRelativeTime(ev.at)} ago
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
