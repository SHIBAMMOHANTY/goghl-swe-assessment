import { useMemo, useState } from 'react';
import type {
  ConversationHistoryItem,
  ConversationSummary,
  InboxStats,
  MeResponse,
  TimelineItem,
} from '../api';
import { ConversationThread } from './ConversationThread';
import { CustomerProfilePanel } from './CustomerProfilePanel';
import { formatRelativeTime } from './workspaceMeta';

export type InboxFilter = 'all' | 'mine' | 'unassigned' | 'closed' | 'open';

interface InboxDashboardProps {
  me: MeResponse;
  workspace: string;
  filter: InboxFilter;
  onFilterChange: (f: InboxFilter) => void;
  stats: InboxStats | null;
  conversations: ConversationSummary[];
  nextCursor: string | null;
  onLoadMore: () => void;
  selectedContact: string | null;
  activeConversation: ConversationSummary | null;
  onSelectContact: (contact: string) => void;
  messages: TimelineItem[];
  history: ConversationHistoryItem[];
  decryptedNotes: Record<string, string>;
  workspaceKey: string;
  keyId: string | null;
  busy: boolean;
  onSendReply: (text: string) => Promise<void>;
  onAddEncryptedNote: (plaintext: string) => Promise<void>;
  onClaim: () => Promise<void>;
  onRelease: () => Promise<void>;
  onToggleStatus: (action: 'close' | 'reopen') => Promise<void>;
  onUpdateTags: (tags: string[]) => Promise<void>;
  onOpenSettings: () => void;
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

export function InboxDashboard({
  me,
  workspace,
  filter,
  onFilterChange,
  stats,
  conversations,
  nextCursor,
  onLoadMore,
  selectedContact,
  activeConversation,
  onSelectContact,
  messages,
  history,
  decryptedNotes,
  workspaceKey,
  keyId,
  busy,
  onSendReply,
  onAddEncryptedNote,
  onClaim,
  onRelease,
  onToggleStatus,
  onUpdateTags,
  onOpenSettings,
}: InboxDashboardProps) {
  const [listQuery, setListQuery] = useState('');
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [mobileCustomerDrawer, setMobileCustomerDrawer] = useState(false);

  const filteredList = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.contact.toLowerCase().includes(q) ||
        c.lastMessagePreview.toLowerCase().includes(q)
    );
  }, [conversations, listQuery]);

  const totalCount = (stats?.open ?? 0) + (stats?.closed ?? 0);

  const tabs: Array<{ id: InboxFilter; label: string; count?: number }> = [
    { id: 'all', label: 'All', count: totalCount },
    { id: 'mine', label: 'Mine', count: stats?.mine ?? 0 },
    { id: 'unassigned', label: 'Unassigned', count: stats?.unassigned ?? 0 },
    { id: 'closed', label: 'Closed', count: stats?.closed ?? 0 },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white pb-12 lg:pb-0">
      {/* Filter Tabs (Screens 3, 7, 8, 9, 10) */}
      <div className="px-4 sm:px-5 pt-2.5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-5 overflow-x-auto">
          {tabs.map((t) => {
            const active = filter === t.id || (filter === 'open' && t.id === 'all');
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onFilterChange(t.id)}
                className={`pb-2.5 text-xs sm:text-[13px] font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'border-[#602ee0] text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{t.label}</span>
                {typeof t.count === 'number' && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                      active ? 'bg-violet-100 text-[#602ee0]' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3-Column Inbox Workspace */}
      <div
        className={`flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[290px_1fr] ${
          selectedContact ? 'xl:grid-cols-[290px_1fr_300px]' : ''
        }`}
      >
        {/* Left Conversation List */}
        <aside
          className={`${
            mobileShowThread && selectedContact ? 'hidden md:flex' : 'flex'
          } flex-col min-h-0 bg-white border-r border-slate-200`}
        >
          <div className="p-3 border-b border-slate-100">
            <input
              type="search"
              placeholder="Search conversations…"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No conversations match this filter.
              </div>
            ) : (
              filteredList.map((c, idx) => {
                const selected = selectedContact === c.contact;
                return (
                  <button
                    key={c.contact}
                    type="button"
                    onClick={() => {
                      onSelectContact(c.contact);
                      setMobileShowThread(true);
                    }}
                    className={`w-full text-left px-3.5 py-3 flex items-start gap-2.5 transition-colors cursor-pointer ${
                      selected ? 'bg-violet-50/80' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`w-9 h-9 rounded-full grid place-items-center text-xs font-bold shrink-0 ${
                        AVATAR_TONES[idx % AVATAR_TONES.length]
                      }`}
                    >
                      {contactInitials(c.contact)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs text-slate-900 truncate">
                          {c.contact}
                        </span>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {formatRelativeTime(c.lastActivityAt)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {c.lastMessagePreview || 'No messages yet'}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            c.status === 'open'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {c.status}
                        </span>
                        {c.assignee ? (
                          <span className="text-[10px] text-slate-500 truncate">
                            {c.assignee === me.sub ? 'Mine' : c.assignee}
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-700">Unassigned</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
            {nextCursor && (
              <div className="p-3 text-center">
                <button
                  type="button"
                  onClick={onLoadMore}
                  className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  Load more
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Middle Conversation Thread */}
        <div
          className={`${
            mobileShowThread && selectedContact ? 'flex' : 'hidden md:flex'
          } flex-col min-h-0`}
        >
          {!selectedContact ? (
            <div className="flex-1 grid place-items-center bg-[#f9f9fd] p-6 text-sm text-slate-500">
              Select a conversation from the list to view details, history, and reply.
            </div>
          ) : (
            <ConversationThread
              me={me}
              workspace={workspace}
              selectedContact={selectedContact}
              activeConversation={activeConversation}
              messages={messages}
              decryptedNotes={decryptedNotes}
              workspaceKey={workspaceKey}
              keyId={keyId}
              busy={busy}
              onBackMobile={() => setMobileShowThread(false)}
              onOpenCustomerMobile={() => setMobileCustomerDrawer(true)}
              onSendReply={onSendReply}
              onAddEncryptedNote={onAddEncryptedNote}
              onClaim={onClaim}
              onRelease={onRelease}
              onToggleStatus={onToggleStatus}
            />
          )}
        </div>

        {/* Right Customer Profile, Message History & Private Notes Panel */}
        {selectedContact && (
          <div className="hidden xl:flex flex-col min-h-0">
            <CustomerProfilePanel
              me={me}
              workspace={workspace}
              contact={selectedContact}
              conversation={activeConversation}
              messages={messages}
              history={history}
              decryptedNotes={decryptedNotes}
              workspaceKey={workspaceKey}
              keyId={keyId}
              busy={busy}
              onClaim={onClaim}
              onRelease={onRelease}
              onToggleStatus={onToggleStatus}
              onUpdateTags={onUpdateTags}
              onAddEncryptedNote={onAddEncryptedNote}
              onOpenSettings={onOpenSettings}
            />
          </div>
        )}
      </div>

      {/* Mobile / Tablet Slide-over Customer Profile & History Drawer */}
      {selectedContact && mobileCustomerDrawer && (
        <div className="fixed inset-0 z-50 xl:hidden flex justify-end">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setMobileCustomerDrawer(false)}
          />
          <div className="relative z-10 w-80 max-w-full h-full bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200">
              <strong className="text-xs text-slate-800">Conversation Details</strong>
              <button
                type="button"
                onClick={() => setMobileCustomerDrawer(false)}
                className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <CustomerProfilePanel
                me={me}
                workspace={workspace}
                contact={selectedContact}
                conversation={activeConversation}
                messages={messages}
                history={history}
                decryptedNotes={decryptedNotes}
                workspaceKey={workspaceKey}
                keyId={keyId}
                busy={busy}
                onClaim={onClaim}
                onRelease={onRelease}
                onToggleStatus={onToggleStatus}
                onUpdateTags={onUpdateTags}
                onAddEncryptedNote={onAddEncryptedNote}
                onOpenSettings={() => {
                  setMobileCustomerDrawer(false);
                  onOpenSettings();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
