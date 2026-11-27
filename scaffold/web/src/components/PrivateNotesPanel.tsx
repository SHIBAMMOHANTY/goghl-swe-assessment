import React, { useState } from 'react';
import type { TimelineItem } from '../api';

interface PrivateNotesPanelProps {
  workspace: string;
  contact: string;
  notes: Array<Extract<TimelineItem, { kind: 'note' }>>;
  decryptedNotes: Record<string, string>;
  workspaceKey: string;
  keyId: string | null;
  busy: boolean;
  onAddEncryptedNote: (plaintext: string) => Promise<void>;
  onOpenSettings: () => void;
}

export function PrivateNotesPanel({
  workspace,
  contact,
  notes,
  decryptedNotes,
  workspaceKey,
  keyId,
  busy,
  onAddEncryptedNote,
  onOpenSettings,
}: PrivateNotesPanelProps) {
  const [noteDraft, setNoteDraft] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!noteDraft.trim() || busy) return;
    await onAddEncryptedNote(noteDraft.trim());
    setNoteDraft('');
  }

  return (
    <aside
      className="flex flex-col min-h-0 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 max-h-72 lg:max-h-none"
      aria-label="Private notes panel"
    >
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-200">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 m-0">Private Notes</h3>
          <span className="text-[11px] text-slate-500">
            End-to-end encrypted · {workspace} only
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-md border border-slate-200 bg-white hover:bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 cursor-pointer"
        >
          {keyId ? `Key ${keyId}` : 'Set Key'}
        </button>
      </div>

      {!workspaceKey && (
        <div className="mx-3 mt-2.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 text-xs text-amber-900">
          No workspace encryption key loaded in this browser. Saving a note will generate one
          locally, or{' '}
          <button
            type="button"
            onClick={onOpenSettings}
            className="underline font-medium text-blue-700 cursor-pointer"
          >
            import your team&apos;s key
          </button>
          .
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {notes.length === 0 ? (
          <div className="py-6 px-3 text-center text-xs text-slate-500">
            No private notes for {contact} yet. Notes are encrypted in your browser before leaving
            your device.
          </div>
        ) : (
          notes.map((n) => (
            <div
              key={n.id}
              className="rounded-xl bg-amber-50 border border-amber-300 px-3 py-2.5 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between text-xs">
                <strong className="text-slate-900">{n.authorName}</strong>
                <span className="text-[11px] text-slate-500">
                  {new Date(n.at).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                {workspaceKey
                  ? (decryptedNotes[n.id] ?? 'Decrypting…')
                  : `[Encrypted · key ${n.keyId}]`}
              </div>
            </div>
          ))
        )}
      </div>

      <form
        className="p-3 border-t border-slate-200 flex flex-col gap-2"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <textarea
          rows={3}
          placeholder="Add an internal encrypted note for teammates…"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={busy || !noteDraft.trim()}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold py-2 px-3 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          Save Encrypted Note
        </button>
      </form>
    </aside>
  );
}
