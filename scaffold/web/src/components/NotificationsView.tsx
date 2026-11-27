import { useMemo, useState } from 'react';
import type { DashboardResponse } from '../api';
import { formatRelativeTime } from './workspaceMeta';

interface NotificationsViewProps {
  sub: string;
  workspace: string;
  recentEvents: DashboardResponse['recentEvents'];
  onOpenConversation: (contact: string) => void;
}

type NotifTab = 'all' | 'unread' | 'mentions' | 'system';

function readStorageKey(sub: string, workspace: string): string {
  return `sb_read_notifs:${sub}:${workspace}`;
}

function loadReadSeqs(sub: string, workspace: string): Set<number> {
  try {
    const raw = localStorage.getItem(readStorageKey(sub, workspace));
    const arr = raw ? (JSON.parse(raw) as number[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveReadSeqs(sub: string, workspace: string, seqs: Set<number>): void {
  try {
    localStorage.setItem(readStorageKey(sub, workspace), JSON.stringify(Array.from(seqs)));
  } catch {
    // ignore storage quota errors
  }
}

function classifyEvent(ev: DashboardResponse['recentEvents'][number]): {
  category: 'mentions' | 'system' | 'general';
  title: string;
  detail: string;
  icon: string;
  iconBg: string;
} {
  if (ev.type === 'note.created') {
    return {
      category: 'mentions',
      title: 'Private note added',
      detail: `An encrypted note was added on ${ev.contact ?? 'a conversation'}.`,
      icon: '@',
      iconBg: 'bg-violet-100 text-[#602ee0]',
    };
  }
  if (ev.type === 'conversation.assigned') {
    return {
      category: 'general',
      title: ev.assignee ? 'Conversation assigned' : 'Conversation released',
      detail: ev.assignee
        ? `${ev.contact ?? 'Conversation'} was claimed by ${ev.assignee}.`
        : `${ev.contact ?? 'Conversation'} is back in the unassigned queue.`,
      icon: '👥',
      iconBg: 'bg-indigo-100 text-indigo-700',
    };
  }
  if (ev.type === 'message.inbound') {
    return {
      category: 'general',
      title: 'New customer message',
      detail: `New inbound message received from ${ev.contact ?? 'customer'}.`,
      icon: '💬',
      iconBg: 'bg-emerald-100 text-emerald-700',
    };
  }
  return {
    category: 'system',
    title: ev.type === 'message.status' ? `Message ${ev.status ?? 'status update'}` : ev.type,
    detail: ev.contact ? `Delivery status update for ${ev.contact}.` : 'Workspace system event.',
    icon: '🔔',
    iconBg: 'bg-slate-100 text-slate-700',
  };
}

export function NotificationsView({
  sub,
  workspace,
  recentEvents,
  onOpenConversation,
}: NotificationsViewProps) {
  const [tab, setTab] = useState<NotifTab>('all');
  const [readSeqs, setReadSeqs] = useState<Set<number>>(() => loadReadSeqs(sub, workspace));

  const items = useMemo(
    () =>
      recentEvents.map((ev) => ({
        ...ev,
        ...classifyEvent(ev),
        unread: !readSeqs.has(ev.seq),
      })),
    [recentEvents, readSeqs]
  );

  const counts = useMemo(
    () => ({
      all: items.length,
      unread: items.filter((i) => i.unread).length,
      mentions: items.filter((i) => i.category === 'mentions').length,
      system: items.filter((i) => i.category === 'system').length,
    }),
    [items]
  );

  const visible = useMemo(() => {
    if (tab === 'unread') return items.filter((i) => i.unread);
    if (tab === 'mentions') return items.filter((i) => i.category === 'mentions');
    if (tab === 'system') return items.filter((i) => i.category === 'system');
    return items;
  }, [items, tab]);

  const markRead = (seq: number) => {
    const next = new Set(readSeqs);
    next.add(seq);
    setReadSeqs(next);
    saveReadSeqs(sub, workspace, next);
  };

  const markAllRead = () => {
    const next = new Set(readSeqs);
    for (const i of items) next.add(i.seq);
    setReadSeqs(next);
    saveReadSeqs(sub, workspace, next);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#f6f7fc] p-4 sm:p-6 pb-16 lg:pb-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 pb-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 m-0">Notifications</h1>
            <p className="text-xs text-slate-500 mt-0.5 mb-0">
              Real-time alerts and activity for <strong>{workspace}</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={markAllRead}
            className="text-xs font-semibold text-[#602ee0] hover:underline cursor-pointer"
          >
            Mark all as read ✓
          </button>
        </div>

        <div className="flex items-center gap-5 px-5 border-b border-slate-200 overflow-x-auto">
          {(
            [
              ['all', 'All', counts.all],
              ['unread', 'Unread', counts.unread],
              ['mentions', 'Mentions', counts.mentions],
              ['system', 'System', counts.system],
            ] as const
          ).map(([id, label, count]) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  active
                    ? 'border-[#602ee0] text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{label}</span>
                {count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                      active ? 'bg-[#602ee0] text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="divide-y divide-slate-100">
          {visible.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No notifications in this tab.
            </div>
          ) : (
            visible.map((item) => (
              <button
                key={item.seq}
                type="button"
                onClick={() => {
                  markRead(item.seq);
                  if (item.contact) onOpenConversation(item.contact);
                }}
                className={`w-full text-left px-5 py-3.5 flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                  item.unread ? 'bg-violet-50/40 hover:bg-violet-50/80' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`mt-2 w-2 h-2 rounded-full shrink-0 ${
                      item.unread ? 'bg-[#602ee0]' : 'bg-transparent'
                    }`}
                  />
                  <span
                    className={`w-9 h-9 rounded-xl grid place-items-center text-sm shrink-0 ${item.iconBg}`}
                  >
                    {item.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-slate-900">
                      {item.title}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{item.detail}</div>
                  </div>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">
                  {formatRelativeTime(item.at)} ago
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
