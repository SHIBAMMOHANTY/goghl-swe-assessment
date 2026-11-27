import React, { useState } from 'react';
import type { ConversationSummary, MeResponse, TimelineItem } from '../api';
import { workspaceDisplayName } from './workspaceMeta';

interface ConversationThreadProps {
  me: MeResponse;
  workspace: string;
  selectedContact: string;
  activeConversation: ConversationSummary | null;
  messages: TimelineItem[];
  decryptedNotes: Record<string, string>;
  workspaceKey: string;
  keyId: string | null;
  busy: boolean;
  onBackMobile: () => void;
  onOpenCustomerMobile: () => void;
  onSendReply: (text: string) => Promise<void>;
  onAddEncryptedNote: (plaintext: string) => Promise<void>;
  onClaim: () => Promise<void>;
  onRelease: () => Promise<void>;
  onToggleStatus: (action: 'close' | 'reopen') => Promise<void>;
}

function contactInitials(contact: string): string {
  const digits = contact.replace(/\D/g, '');
  if (digits.length >= 2) return digits.slice(-2);
  return contact.slice(0, 2).toUpperCase();
}

function DeliveryTicks({ status }: { status: 'queued' | 'sent' | 'delivered' | 'failed' }) {
  if (status === 'queued') return <span title="Queued">◷</span>;
  if (status === 'sent') return <span title="Sent">✓</span>;
  if (status === 'delivered') return <span title="Delivered">✓✓</span>;
  return (
    <span className="text-red-200 font-bold" title="Failed">
      ! Failed
    </span>
  );
}

export function ConversationThread({
  me,
  workspace,
  selectedContact,
  activeConversation,
  messages,
  decryptedNotes,
  workspaceKey,
  keyId,
  busy,
  onBackMobile,
  onOpenCustomerMobile,
  onSendReply,
  onAddEncryptedNote,
  onClaim,
  onRelease,
  onToggleStatus,
}: ConversationThreadProps) {
  const [composerTab, setComposerTab] = useState<'reply' | 'note'>('reply');
  const [draft, setDraft] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    const text = draft.trim();
    if (composerTab === 'reply') {
      await onSendReply(text);
    } else {
      await onAddEncryptedNote(text);
    }
    setDraft('');
  }

  return (
    <section className="flex flex-col min-h-0 bg-white border-r border-slate-200/80">
      {/* Conversation Details Header (Screen 11) */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBackMobile}
            aria-label="Back to conversation list"
            className="md:hidden rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 cursor-pointer"
          >
            &larr;
          </button>

          <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center text-xs font-bold shrink-0">
            {contactInitials(selectedContact)}
          </span>

          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 truncate">{selectedContact}</div>
            <div className="text-[11px] text-slate-500 truncate">
              {workspaceDisplayName(workspace)} ·{' '}
              {activeConversation?.assignee
                ? `Assigned to ${
                    activeConversation.assignee === me.sub ? 'you' : activeConversation.assignee
                  }`
                : 'Unassigned'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {activeConversation?.status === 'closed' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onToggleStatus('reopen')}
              className="rounded-lg bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Closed · Reopen
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onToggleStatus('close')}
              className="rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 cursor-pointer"
            >
              Open · Close
            </button>
          )}

          <button
            type="button"
            onClick={onOpenCustomerMobile}
            className="xl:hidden rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 cursor-pointer"
          >
            Details
          </button>
        </div>
      </div>

      {/* Message Timeline */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 flex flex-col gap-3 bg-[#f9f9fd]">
        <div className="self-center rounded-full bg-slate-200/70 px-3 py-0.5 text-[11px] font-medium text-slate-600">
          Conversation Timeline
        </div>

        {messages.length === 0 ? (
          <div className="flex-1 grid place-items-center text-xs text-slate-500">
            No messages yet. Send a reply below to start the conversation.
          </div>
        ) : (
          messages.map((m) => {
            if (m.kind === 'inbound') {
              return (
                <div key={m.id} className="flex items-end gap-2 max-w-[85%] sm:max-w-[78%] self-start">
                  <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 grid place-items-center text-[10px] font-bold shrink-0">
                    {contactInitials(selectedContact)}
                  </span>
                  <div className="flex flex-col gap-1">
                    <div className="rounded-2xl rounded-bl-sm bg-[#efeff6] px-3.5 py-2.5 text-xs sm:text-[13px] text-slate-800 leading-relaxed whitespace-pre-wrap">
                      {m.text}
                    </div>
                    <span className="text-[10px] text-slate-400 px-1">
                      {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            }

            if (m.kind === 'outbound') {
              return (
                <div
                  key={m.id}
                  className="max-w-[85%] sm:max-w-[78%] self-end flex flex-col items-end gap-1"
                >
                  <div className="rounded-2xl rounded-br-sm bg-gradient-to-r from-[#6532eb] to-[#5624d6] px-3.5 py-2.5 text-xs sm:text-[13px] text-white leading-relaxed shadow-sm shadow-indigo-600/20 whitespace-pre-wrap">
                    <div>{m.text}</div>
                    <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-violet-100/90">
                      <span>
                        {new Date(m.at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <DeliveryTicks status={m.status} />
                    </div>
                  </div>
                </div>
              );
            }

            // Encrypted Private Note in timeline
            return (
              <div
                key={m.id}
                className="max-w-[90%] self-center w-full rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-950"
              >
                <div className="flex items-center justify-between text-[11px] font-semibold text-amber-800 mb-1">
                  <span>🔒 Private Note · {m.authorName}</span>
                  <span className="font-normal text-amber-700">
                    {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">
                  {workspaceKey
                    ? (decryptedNotes[m.id] ?? 'Decrypting…')
                    : `[Encrypted · key ${m.keyId}]`}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Dual-Mode Reply & Private Notes Composer (Screen 14) */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="border-t border-slate-200 bg-white px-3 sm:px-4 pt-2 pb-3"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setComposerTab('reply')}
              className={`pb-1 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                composerTab === 'reply'
                  ? 'border-[#602ee0] text-[#602ee0]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Reply
            </button>
            <button
              type="button"
              onClick={() => setComposerTab('note')}
              className={`pb-1 text-xs font-semibold border-b-2 flex items-center gap-1 transition-colors cursor-pointer ${
                composerTab === 'note'
                  ? 'border-amber-500 text-amber-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>🔒</span> Private Note
            </button>
          </div>

          {composerTab === 'note' && (
            <span className="text-[11px] text-amber-700">
              {keyId ? `E2E Key ${keyId}` : 'Auto-generates E2E key'}
            </span>
          )}
        </div>

        <textarea
          rows={2}
          placeholder={
            composerTab === 'reply'
              ? 'Type your reply… (Ctrl+Enter to send)'
              : 'Write an end-to-end encrypted internal note…'
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && draft.trim()) {
              e.preventDefault();
              void handleSubmit(e);
            }
          }}
          className={`w-full rounded-xl border px-3 py-2 text-xs sm:text-sm resize-y min-h-[54px] focus:outline-none focus:ring-2 ${
            composerTab === 'note'
              ? 'bg-amber-50/40 border-amber-200 focus:ring-amber-400'
              : 'bg-slate-50/60 border-slate-200 focus:ring-violet-500'
          }`}
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {activeConversation?.assignee !== me.sub ? (
              <button
                type="button"
                disabled={busy || Boolean(activeConversation?.assignee)}
                onClick={() => void onClaim()}
                className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 cursor-pointer disabled:cursor-not-allowed"
              >
                {activeConversation?.assignee
                  ? `Held by ${activeConversation.assignee}`
                  : 'Claim to me'}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRelease()}
                className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Release
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              composerTab === 'note'
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-gradient-to-r from-[#6532eb] to-[#5624d6] hover:from-[#5726d8] hover:to-[#471bb8]'
            }`}
          >
            {composerTab === 'note' ? 'Save Encrypted Note' : 'Send'}
          </button>
        </div>
      </form>
    </section>
  );
}
