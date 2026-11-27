import React, { useState } from 'react';
import type {
  ConversationHistoryItem,
  ConversationSummary,
  MeResponse,
  TimelineItem,
} from '../api';
import { formatRelativeTime, workspaceDisplayName } from './workspaceMeta';

interface CustomerProfilePanelProps {
  me: MeResponse;
  workspace: string;
  contact: string;
  conversation: ConversationSummary | null;
  messages: TimelineItem[];
  history: ConversationHistoryItem[];
  decryptedNotes: Record<string, string>;
  workspaceKey: string;
  keyId: string | null;
  busy: boolean;
  onClaim: () => Promise<void>;
  onRelease: () => Promise<void>;
  onToggleStatus: (action: 'close' | 'reopen') => Promise<void>;
  onUpdateTags: (tags: string[]) => Promise<void>;
  onAddEncryptedNote: (plaintext: string) => Promise<void>;
  onOpenSettings: () => void;
}

function contactInitials(contact: string): string {
  const digits = contact.replace(/\D/g, '');
  if (digits.length >= 2) return digits.slice(-2);
  return contact.slice(0, 2).toUpperCase();
}

export function CustomerProfilePanel({
  me,
  workspace,
  contact,
  conversation,
  messages,
  history,
  decryptedNotes,
  workspaceKey,
  keyId,
  busy,
  onClaim,
  onRelease,
  onToggleStatus,
  onUpdateTags,
  onAddEncryptedNote,
  onOpenSettings,
}: CustomerProfilePanelProps) {
  const [tab, setTab] = useState<'customer' | 'history' | 'more'>('customer');
  const [tagDraft, setTagDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [showAddNote, setShowAddNote] = useState(false);
  const [copied, setCopied] = useState(false);

  const notes = messages.filter(
    (m): m is Extract<TimelineItem, { kind: 'note' }> => m.kind === 'note'
  );
  const tags = conversation?.tags ?? [];

  async function handleAddTag(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = tagDraft.trim().toLowerCase();
    if (!cleaned || busy) return;
    if (!tags.includes(cleaned)) {
      await onUpdateTags([...tags, cleaned]);
    }
    setTagDraft('');
  }

  async function handleSaveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteDraft.trim() || busy) return;
    await onAddEncryptedNote(noteDraft.trim());
    setNoteDraft('');
    setShowAddNote(false);
  }

  function handleCopyContact() {
    void navigator.clipboard?.writeText(contact).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <aside
      className="h-full flex flex-col min-h-0 bg-white overflow-hidden"
      aria-label="Customer profile and history"
    >
      {/* Top Tabs: Customer | History | More (Screens 12 & 13) */}
      <div className="flex items-center gap-5 px-4 pt-3 border-b border-slate-200">
        {(
          [
            ['customer', 'Customer'],
            ['history', 'History'],
            ['more', 'More'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === id
                ? 'border-[#602ee0] text-[#602ee0]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'customer' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Contact Card */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="w-10 h-10 rounded-full bg-violet-100 text-violet-700 grid place-items-center text-sm font-bold shrink-0">
                {contactInitials(contact)}
              </span>
              <div className="min-w-0">
                <div className="font-bold text-sm text-slate-900 truncate">{contact}</div>
                <div className="text-[11px] text-slate-500">
                  {workspaceDisplayName(workspace)}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">📞 {contact}</span>
                <button
                  type="button"
                  onClick={handleCopyContact}
                  className="text-[11px] font-medium text-[#602ee0] hover:underline cursor-pointer"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="text-[11px] text-slate-500">
                Workspace: <code>{workspace}</code>
              </div>
            </div>
          </div>

          {/* Conversations Summary */}
          <div className="pt-3 border-t border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
              <span>Conversation Status</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  conversation?.status === 'closed'
                    ? 'bg-slate-200 text-slate-700'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {conversation?.status ?? 'open'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Messages</span>
              <span>{messages.filter((m) => m.kind !== 'note').length}</span>
            </div>
          </div>

          {/* Assigned To */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="text-xs font-semibold text-slate-800">Assigned To</div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-xs font-medium text-slate-800 truncate">
                {conversation?.assignee
                  ? conversation.assignee === me.sub
                    ? `${me.name} (You)`
                    : conversation.assignee
                  : 'Unassigned'}
              </span>
              {conversation?.assignee === me.sub ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRelease()}
                  className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Release
                </button>
              ) : !conversation?.assignee ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onClaim()}
                  className="text-[11px] font-semibold text-[#602ee0] hover:underline cursor-pointer"
                >
                  Claim
                </button>
              ) : null}
            </div>
          </div>

          {/* Tags */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="text-xs font-semibold text-slate-800">Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-100 text-violet-800 px-2.5 py-0.5 text-[11px] font-medium"
                >
                  {t}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onUpdateTags(tags.filter((x) => x !== t))}
                    className="hover:text-violet-950 cursor-pointer"
                    aria-label={`Remove tag ${t}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <form onSubmit={(e) => void handleAddTag(e)} className="flex gap-1.5">
              <input
                type="text"
                placeholder="Add tag…"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button
                type="submit"
                disabled={busy || !tagDraft.trim()}
                className="rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 cursor-pointer disabled:opacity-50"
              >
                Add
              </button>
            </form>
          </div>

          {/* Private Notes (E2E Encrypted) */}
          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800">🔒 Private Notes</span>
              <button
                type="button"
                onClick={onOpenSettings}
                className="text-[11px] text-[#602ee0] hover:underline cursor-pointer"
              >
                {keyId ? `Key ${keyId}` : 'Set Key'}
              </button>
            </div>

            {notes.length === 0 ? (
              <div className="text-[11px] text-slate-400">
                No private notes yet. Stored end-to-end encrypted.
              </div>
            ) : (
              <div className="space-y-2">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="rounded-xl bg-amber-50 border border-amber-200/90 p-2.5 text-xs text-amber-950 space-y-1"
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {workspaceKey
                        ? (decryptedNotes[n.id] ?? 'Decrypting…')
                        : `[Encrypted · key ${n.keyId}]`}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-amber-700">
                      <span>{n.authorName}</span>
                      <span>🔒 Encrypted · {formatRelativeTime(n.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showAddNote ? (
              <form onSubmit={(e) => void handleSaveNote(e)} className="space-y-2">
                <textarea
                  rows={2}
                  placeholder="Write encrypted note…"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  className="w-full rounded-lg border border-amber-200 bg-amber-50/40 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    disabled={busy || !noteDraft.trim()}
                    className="flex-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold py-1.5 cursor-pointer disabled:opacity-50"
                  >
                    Save Note
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddNote(false)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddNote(true)}
                className="w-full rounded-xl bg-violet-50 hover:bg-violet-100 text-[#602ee0] text-xs font-semibold py-2 transition-colors cursor-pointer"
              >
                + Add Note
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-xs font-semibold text-slate-800">
            Message &amp; Event History
          </div>
          {history.length === 0 ? (
            <div className="text-xs text-slate-500 py-6 text-center">
              No recorded events for {contact} yet.
            </div>
          ) : (
            <ol className="space-y-2.5 list-none p-0 m-0">
              {history.map((h) => (
                <li
                  key={h.seq}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">{h.type}</span>
                    <span className="text-[10px] text-slate-400">#{h.seq}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {h.status && `Status: ${h.status} · `}
                    {h.assignee !== null && `Assignee: ${h.assignee || 'none'} · `}
                    {h.conversationStatus && `State: ${h.conversationStatus} · `}
                    {new Date(h.at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {tab === 'more' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-xs font-semibold text-slate-800">Conversation Actions</div>
          <div className="space-y-2">
            {conversation?.status === 'closed' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onToggleStatus('reopen')}
                className="w-full rounded-xl border border-slate-200 bg-white hover:bg-slate-50 py-2 text-xs font-semibold text-slate-800 cursor-pointer"
              >
                Reopen Conversation
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onToggleStatus('close')}
                className="w-full rounded-xl border border-slate-200 bg-white hover:bg-slate-50 py-2 text-xs font-semibold text-slate-800 cursor-pointer"
              >
                Close Conversation
              </button>
            )}
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-full rounded-xl border border-slate-200 bg-white hover:bg-slate-50 py-2 text-xs font-semibold text-[#602ee0] cursor-pointer"
            >
              Manage E2E Encryption Key
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
