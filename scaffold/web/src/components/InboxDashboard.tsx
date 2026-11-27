import React, { useState } from 'react';
import type { ConversationSummary, InboxStats, MeResponse, TimelineItem } from '../api';
import { PrivateNotesPanel } from './PrivateNotesPanel';

export type InboxFilter = 'open' | 'mine' | 'unassigned' | 'closed' | 'all';

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
  decryptedNotes: Record<string, string>;
  workspaceKey: string;
  keyId: string | null;
  busy: boolean;
  onSendReply: (text: string) => Promise<void>;
  onAddEncryptedNote: (plaintext: string) => Promise<void>;
  onClaim: () => Promise<void>;
  onRelease: () => Promise<void>;
  onToggleStatus: (action: 'close' | 'reopen') => Promise<void>;
  onOpenSettings: () => void;
}

function contactInitials(contact: string): string {
  const digits = contact.replace(/\D/g, '');
  if (digits.length >= 2) return digits.slice(-2);
  return contact.slice(0, 2).toUpperCase();
}

const STATUS_BADGE_CLASSES: Record<'queued' | 'sent' | 'delivered' | 'failed', string> = {
  delivered: 'bg-emerald-100 text-emerald-800',
  sent: 'bg-blue-100 text-blue-800',
  queued: 'bg-slate-200 text-slate-700',
  failed: 'bg-red-100 text-red-800',
};

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
  decryptedNotes,
  workspaceKey,
  keyId,
  busy,
  onSendReply,
  onAddEncryptedNote,
  onClaim,
  onRelease,
  onToggleStatus,
  onOpenSettings,
}: InboxDashboardProps) {
  const [replyDraft, setReplyDraft] = useState('');
  const [showNotesPanel, setShowNotesPanel] = useState(true);

  const notes = messages.filter(
    (m): m is Extract<TimelineItem, { kind: 'note' }> => m.kind === 'note'
  );
  const chatMessages = messages.filter(
    (m): m is Exclude<TimelineItem, { kind: 'note' }> => m.kind !== 'note'
  );

  async function handleReplySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!replyDraft.trim() || busy) return;
    await onSendReply(replyDraft.trim());
    setReplyDraft('');
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <section
        className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 px-4 py-2.5 bg-slate-50 border-b border-slate-200"
        aria-label="Inbox overview"
      >
        {(
          [
            ['open', 'Open', stats?.open ?? 0],
            ['mine', 'Mine', stats?.mine ?? 0],
            ['unassigned', 'Unassigned', stats?.unassigned ?? 0],
            ['closed', 'Closed', stats?.closed ?? 0],
          ] as const
        ).map(([key, label, value]) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilterChange(key)}
            className={`rounded-xl border px-3.5 py-2 text-left transition-colors cursor-pointer ${
              filter === key
                ? 'border-blue-500 bg-blue-50/70'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="text-xl font-bold text-slate-900 leading-tight">{value}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </button>
        ))}
      </section>

      <div
        className={`flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[300px_1fr] ${
          selectedContact && showNotesPanel ? 'lg:grid-cols-[300px_1fr_310px]' : ''
        }`}
      >
        <aside className="flex flex-col min-h-0 bg-white border-r border-slate-200">
          <div className="flex gap-1 p-2 border-b border-slate-200">
            {(['open', 'mine', 'unassigned', 'closed', 'all'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => onFilterChange(tab)}
                className={`flex-1 py-1 px-1.5 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                  filter === tab
                    ? 'bg-blue-50 text-blue-600 border border-blue-200'
                    : 'text-slate-500 hover:text-slate-800 border border-transparent'
                }`}
              >
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No conversations match this filter.
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.contact}
                  type="button"
                  onClick={() => onSelectContact(c.contact)}
                  className={`w-full text-left px-3 py-2.5 border-b border-slate-100 flex items-start gap-2.5 cursor-pointer transition-colors ${
                    selectedContact === c.contact ? 'bg-blue-50/80' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-800 grid place-items-center text-xs font-bold shrink-0">
                    {contactInitials(c.contact)}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs text-slate-900 truncate">
                        {c.contact}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          c.status === 'open'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {c.lastMessagePreview || 'No messages yet'}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      {c.assignee ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            c.assignee === me.sub
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {c.assignee === me.sub ? 'Mine' : c.assignee}
                        </span>
                      ) : (
                        <span>Unassigned</span>
                      )}
                      <span>· {new Date(c.lastActivityAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </button>
              ))
            )}
            {nextCursor && (
              <div className="p-2.5 text-center">
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

        <section className="flex flex-col min-h-0 bg-slate-50">
          {!selectedContact ? (
            <div className="flex-1 grid place-items-center p-6 text-sm text-slate-500">
              Select a conversation to view messages and reply.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-800 grid place-items-center text-xs font-bold shrink-0">
                    {contactInitials(selectedContact)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-sm text-slate-900">{selectedContact}</strong>
                      {activeConversation && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            activeConversation.status === 'open'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {activeConversation.status}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {activeConversation?.assignee
                        ? `Assigned to ${
                            activeConversation.assignee === me.sub
                              ? 'you'
                              : activeConversation.assignee
                          }`
                        : 'Unassigned'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {activeConversation?.assignee !== me.sub ? (
                    <button
                      type="button"
                      disabled={busy || Boolean(activeConversation?.assignee)}
                      onClick={() => void onClaim()}
                      className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 px-2.5 py-1 text-xs font-medium text-slate-700 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Claim
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onRelease()}
                      className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 px-2.5 py-1 text-xs font-medium text-slate-700 cursor-pointer"
                    >
                      Release
                    </button>
                  )}

                  {activeConversation?.status === 'closed' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onToggleStatus('reopen')}
                      className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 px-2.5 py-1 text-xs font-medium text-slate-700 cursor-pointer"
                    >
                      Reopen
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onToggleStatus('close')}
                      className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 px-2.5 py-1 text-xs font-medium text-slate-700 cursor-pointer"
                    >
                      Close
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowNotesPanel((v) => !v)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium cursor-pointer ${
                      showNotesPanel
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Notes ({notes.length})
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
                {chatMessages.length === 0 ? (
                  <div className="flex-1 grid place-items-center text-xs text-slate-500">
                    No customer or agent messages yet.
                  </div>
                ) : (
                  chatMessages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[76%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed shadow-2xs flex flex-col gap-1 ${
                        m.kind === 'inbound'
                          ? 'self-start bg-white border border-slate-200 text-slate-900'
                          : 'self-end bg-blue-100 text-slate-900'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.text}</div>
                      <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1.5">
                          {m.kind === 'inbound' && 'Customer'}
                          {m.kind === 'outbound' && (
                            <>
                              Agent reply
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE_CLASSES[m.status]}`}
                              >
                                {m.status}
                              </span>
                            </>
                          )}
                        </span>
                        <span>{new Date(m.at).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form
                className="p-3 bg-white border-t border-slate-200"
                onSubmit={(e) => void handleReplySubmit(e)}
              >
                <div className="flex items-end gap-2.5">
                  <textarea
                    rows={2}
                    placeholder="Write a reply to the customer (Ctrl+Enter to send)…"
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && replyDraft.trim()) {
                        e.preventDefault();
                        void handleReplySubmit(e);
                      }
                    }}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 resize-y min-h-[52px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={busy || !replyDraft.trim()}
                    className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    Send Reply
                  </button>
                </div>
              </form>
            </>
          )}
        </section>

        {selectedContact && showNotesPanel && (
          <PrivateNotesPanel
            workspace={workspace}
            contact={selectedContact}
            notes={notes}
            decryptedNotes={decryptedNotes}
            workspaceKey={workspaceKey}
            keyId={keyId}
            busy={busy}
            onAddEncryptedNote={onAddEncryptedNote}
            onOpenSettings={onOpenSettings}
          />
        )}
      </div>
    </div>
  );
}
