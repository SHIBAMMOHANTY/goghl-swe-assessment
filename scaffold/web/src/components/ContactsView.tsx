import React, { useCallback, useEffect, useState } from 'react';
import {
  claimConversation,
  createContact,
  fetchContacts,
  fetchMessages,
  releaseConversation,
  updateContact,
  type ContactDirectoryItem,
  type ContactsListResponse,
  type ConversationHistoryItem,
  type MeResponse,
  type TimelineItem,
} from '../api';
import { decryptNote } from '../crypto';
import { formatRelativeTime } from './workspaceMeta';

interface ContactsViewProps {
  me: MeResponse;
  workspace: string;
  workspaceKey: string;
  onOpenInInbox: (contact: string) => void;
  onAddEncryptedNote: (contact: string, plaintext: string) => Promise<void>;
}

const AVATAR_TONES = [
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-800',
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && /[a-z]/i.test(parts[0])) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  const digits = name.replace(/\D/g, '');
  if (digits.length >= 2) return digits.slice(-2);
  return name.slice(0, 2).toUpperCase();
}

export function ContactsView({
  me,
  workspace,
  workspaceKey,
  onOpenInInbox,
  onAddEncryptedNote,
}: ContactsViewProps) {
  const [typeFilter, setTypeFilter] = useState<'all' | 'customer' | 'lead'>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [directory, setDirectory] = useState<ContactsListResponse | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // Mobile 3-screen navigation: 'list' | 'details' | 'history'
  const [mobileScreen, setMobileScreen] = useState<'list' | 'details' | 'history'>('list');

  // Detail state
  const [messages, setMessages] = useState<TimelineItem[]>([]);
  const [history, setHistory] = useState<ConversationHistoryItem[]>([]);
  const [decryptedNotes, setDecryptedNotes] = useState<Record<string, string>>({});
  const [historyTab, setHistoryTab] = useState<'history' | 'activity'>('history');

  // Modals / Inline forms
  const [showAddModal, setShowAddModal] = useState(false);
  const [formContact, setFormContact] = useState('');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formType, setFormType] = useState<'customer' | 'lead'>('customer');
  const [editingDetails, setEditingDetails] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editType, setEditType] = useState<'customer' | 'lead'>('customer');
  const [tagDraft, setTagDraft] = useState('');
  const [showAddTag, setShowAddTag] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [showAddNote, setShowAddNote] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadDirectory = useCallback(async () => {
    try {
      const res = await fetchContacts({
        workspace,
        type: typeFilter,
        q: query,
        page,
        limit: 8,
      });
      setDirectory(res);
      if (res.contacts.length > 0) {
        setSelectedContactId((prev) =>
          prev && res.contacts.some((c) => c.contact === prev)
            ? prev
            : res.contacts[0].contact
        );
      } else {
        setSelectedContactId(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load contacts');
    }
  }, [workspace, typeFilter, query, page]);

  useEffect(() => {
    setPage(1);
  }, [workspace, typeFilter, query]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  const selectedContact: ContactDirectoryItem | null =
    directory?.contacts.find((c) => c.contact === selectedContactId) ?? null;

  const loadSelectedDetails = useCallback(async () => {
    if (!selectedContactId) {
      setMessages([]);
      setHistory([]);
      return;
    }
    try {
      const res = await fetchMessages(workspace, selectedContactId);
      setMessages(res.messages);
      setHistory(res.history ?? []);
    } catch {
      setMessages([]);
      setHistory([]);
    }
  }, [workspace, selectedContactId]);

  useEffect(() => {
    void loadSelectedDetails();
    setEditingDetails(false);
  }, [loadSelectedDetails]);

  useEffect(() => {
    if (!selectedContactId || !workspaceKey) {
      setDecryptedNotes({});
      return;
    }
    const notes = messages.filter(
      (m): m is Extract<TimelineItem, { kind: 'note' }> => m.kind === 'note'
    );
    if (notes.length === 0) {
      setDecryptedNotes({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      notes.map(async (n) => {
        try {
          const text = await decryptNote(
            workspaceKey,
            workspace,
            selectedContactId,
            n.ciphertext,
            n.iv
          );
          return [n.id, text] as const;
        } catch {
          return [n.id, '[Unable to decrypt with current workspace key]'] as const;
        }
      })
    ).then((entries) => {
      if (!cancelled) setDecryptedNotes(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [messages, workspaceKey, workspace, selectedContactId]);

  async function handleCreateContact(e: React.FormEvent) {
    e.preventDefault();
    if (!formContact.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await createContact({
        workspace,
        contact: formContact.trim(),
        name: formName.trim() || formContact.trim(),
        email: formEmail.trim(),
        location: formLocation.trim(),
        type: formType,
      });
      setSelectedContactId(formContact.trim());
      setShowAddModal(false);
      setFormContact('');
      setFormName('');
      setFormEmail('');
      setFormLocation('');
      await loadDirectory();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create contact');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedContact || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await updateContact(workspace, selectedContact.contact, {
        name: editName.trim() || selectedContact.contact,
        email: editEmail.trim(),
        location: editLocation.trim(),
        type: editType,
      });
      setEditingDetails(false);
      await loadDirectory();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update contact');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateTags(tags: string[]) {
    if (!selectedContact || busy) return;
    setBusy(true);
    try {
      await updateContact(workspace, selectedContact.contact, { tags });
      await loadDirectory();
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleAssign() {
    if (!selectedContact || busy) return;
    setBusy(true);
    setErr(null);
    try {
      if (selectedContact.assignee === me.sub) {
        await releaseConversation(workspace, selectedContact.contact);
      } else {
        await claimConversation(workspace, selectedContact.contact);
      }
      await Promise.all([loadDirectory(), loadSelectedDetails()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Assignment failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedContact || !noteDraft.trim() || busy) return;
    setBusy(true);
    try {
      await onAddEncryptedNote(selectedContact.contact, noteDraft.trim());
      setNoteDraft('');
      setShowAddNote(false);
      await loadSelectedDetails();
    } finally {
      setBusy(false);
    }
  }

  const chatMessages = messages.filter(
    (m): m is Exclude<TimelineItem, { kind: 'note' }> => m.kind !== 'note'
  );
  const notes = messages.filter(
    (m): m is Extract<TimelineItem, { kind: 'note' }> => m.kind === 'note'
  );
  const startIdx = directory && directory.total > 0 ? (directory.page - 1) * directory.limit + 1 : 0;
  const endIdx = directory ? Math.min(directory.total, directory.page * directory.limit) : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#f7f8fc] pb-12 lg:pb-0">
      {/* Top Title + Add Contact CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 bg-white border-b border-slate-200/80">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 m-0">Contacts</h1>
          <p className="text-xs text-slate-500 mt-0.5 mb-0">
            Manage your customers and view their conversation history.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#6532eb] to-[#5624d6] hover:from-[#5726d8] hover:to-[#471bb8] text-white text-xs sm:text-sm font-semibold px-4 py-2 shadow-md shadow-indigo-600/20 cursor-pointer"
        >
          <span>+ Add Contact</span>
        </button>
      </div>

      {err && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700">
          {err}
        </div>
      )}

      {/* 3-Column Desktop Layout / 3-Screen Mobile Navigation */}
      <div className="flex-1 min-h-0 p-0 xl:p-5 grid grid-cols-1 xl:grid-cols-[310px_330px_1fr] gap-0 xl:gap-4">
        {/* Column 1 / Mobile Screen 1: All Contacts Directory */}
        <section
          className={`${
            mobileScreen === 'list' ? 'flex' : 'hidden xl:flex'
          } flex-col min-h-0 bg-white xl:rounded-2xl xl:border xl:border-slate-200/80 xl:shadow-2xs overflow-hidden`}
        >
          {/* All Contacts | Customers | Leads Tabs */}
          <div className="flex items-center gap-4 px-4 pt-3 border-b border-slate-200 overflow-x-auto">
            {(
              [
                ['all', 'All Contacts', directory?.counts.all ?? 0],
                ['customer', 'Customers', directory?.counts.customer ?? 0],
                ['lead', 'Leads', directory?.counts.lead ?? 0],
              ] as const
            ).map(([id, label, count]) => {
              const active = typeFilter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTypeFilter(id)}
                  className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    active
                      ? 'border-[#602ee0] text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                      active ? 'bg-[#602ee0] text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="p-3 border-b border-slate-100">
            <input
              type="search"
              placeholder="Search contacts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Contact Directory Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {!directory || directory.contacts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No contacts in this workspace yet.
              </div>
            ) : (
              directory.contacts.map((c, idx) => {
                const selected = c.contact === selectedContactId;
                return (
                  <button
                    key={c.contact}
                    type="button"
                    onClick={() => {
                      setSelectedContactId(c.contact);
                      setMobileScreen('details');
                    }}
                    className={`w-full text-left px-3.5 py-3 flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                      selected ? 'bg-violet-50/90' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-9 h-9 rounded-full grid place-items-center text-xs font-bold shrink-0 ${
                          AVATAR_TONES[idx % AVATAR_TONES.length]
                        }`}
                      >
                        {initials(c.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {c.name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {c.email || c.contact}
                        </div>
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px] font-semibold shrink-0">
                      {c.messageCount}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Pagination Footer */}
          <div className="px-3.5 py-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 bg-white">
            <span>
              {startIdx}-{endIdx} of {directory?.total ?? 0}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!directory || directory.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="w-6 h-6 rounded-md border border-slate-200 disabled:opacity-40 cursor-pointer"
              >
                &lsaquo;
              </button>
              <span className="px-2 py-0.5 rounded-md bg-[#602ee0] text-white font-semibold">
                {directory?.page ?? 1}
              </span>
              <span className="px-1 text-slate-400">/ {directory?.totalPages ?? 1}</span>
              <button
                type="button"
                disabled={!directory || directory.page >= directory.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="w-6 h-6 rounded-md border border-slate-200 disabled:opacity-40 cursor-pointer"
              >
                &rsaquo;
              </button>
            </div>
          </div>
        </section>

        {/* Column 2 / Mobile Screen 2: Contact Details */}
        <section
          className={`${
            mobileScreen === 'details' ? 'flex' : 'hidden xl:flex'
          } flex-col min-h-0 gap-3 overflow-y-auto p-3 xl:p-0`}
        >
          {/* Mobile back bar */}
          <div className="xl:hidden flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMobileScreen('list')}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              &larr; Contacts
            </button>
            {selectedContact && (
              <button
                type="button"
                onClick={() => setMobileScreen('history')}
                className="rounded-lg bg-violet-100 text-[#602ee0] px-2.5 py-1 text-xs font-semibold cursor-pointer"
              >
                Conversation History ({chatMessages.length}) &rarr;
              </button>
            )}
          </div>

          {!selectedContact ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-xs text-slate-400">
              Select a contact to inspect their profile, tags, and notes.
            </div>
          ) : (
            <>
              {/* Profile Header Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-11 h-11 rounded-full bg-violet-100 text-violet-700 grid place-items-center text-sm font-bold shrink-0">
                      {initials(selectedContact.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <strong className="text-sm text-slate-900 truncate">
                          {selectedContact.name}
                        </strong>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                            selectedContact.type === 'customer'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-sky-100 text-sky-700'
                          }`}
                        >
                          {selectedContact.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <span className="truncate">
                          {selectedContact.email || selectedContact.contact}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard
                              ?.writeText(selectedContact.contact)
                              .then(() => {
                                setCopied(true);
                                setTimeout(() => setCopied(false), 1200);
                              });
                          }}
                          className="text-[10px] text-[#602ee0] hover:underline cursor-pointer"
                        >
                          {copied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenInInbox(selectedContact.contact)}
                    className="rounded-xl border border-[#602ee0] bg-violet-50/70 hover:bg-violet-100 text-[#602ee0] py-1.5 text-xs font-semibold cursor-pointer"
                  >
                    Message
                  </button>
                  <button
                    type="button"
                    disabled={busy || (Boolean(selectedContact.assignee) && selectedContact.assignee !== me.sub)}
                    onClick={() => void handleToggleAssign()}
                    className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    {selectedContact.assignee === me.sub
                      ? 'Release'
                      : selectedContact.assignee
                        ? selectedContact.assignee
                        : 'Assign to Me'}
                  </button>
                </div>
              </div>

              {/* Contact Information Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900 m-0">Contact Information</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setEditName(selectedContact.name);
                      setEditEmail(selectedContact.email);
                      setEditLocation(selectedContact.location);
                      setEditType(selectedContact.type);
                      setEditingDetails((v) => !v);
                    }}
                    className="text-[11px] font-semibold text-[#602ee0] hover:underline cursor-pointer"
                  >
                    {editingDetails ? 'Cancel' : 'Edit'}
                  </button>
                </div>

                {editingDetails ? (
                  <form onSubmit={(e) => void handleSaveEdit(e)} className="space-y-2 text-xs">
                    <input
                      type="text"
                      placeholder="Full name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5"
                    />
                    <input
                      type="text"
                      placeholder="Location (e.g. New York, USA)"
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5"
                    />
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as 'customer' | 'lead')}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                    >
                      <option value="customer">Customer</option>
                      <option value="lead">Lead</option>
                    </select>
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full rounded-lg bg-[#602ee0] text-white font-semibold py-1.5 cursor-pointer"
                    >
                      Save Details
                    </button>
                  </form>
                ) : (
                  <dl className="space-y-2 text-xs m-0">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Email</dt>
                      <dd className="m-0 font-medium text-slate-900 truncate">
                        {selectedContact.email || '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Phone</dt>
                      <dd className="m-0 font-medium text-slate-900 truncate">
                        {selectedContact.contact}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Location</dt>
                      <dd className="m-0 font-medium text-slate-900 truncate">
                        {selectedContact.location || '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Added On</dt>
                      <dd className="m-0 text-slate-700">
                        {new Date(selectedContact.createdAt).toLocaleDateString()}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>

              {/* Tags Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-2.5">
                <div className="text-xs font-bold text-slate-900">Tags</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedContact.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-violet-100 text-violet-800 px-2.5 py-0.5 text-[11px] font-medium"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() =>
                          void handleUpdateTags(selectedContact.tags.filter((x) => x !== t))
                        }
                        className="cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {!showAddTag && (
                    <button
                      type="button"
                      onClick={() => setShowAddTag(true)}
                      className="rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:border-violet-500 cursor-pointer"
                    >
                      + Add Tag
                    </button>
                  )}
                </div>

                {showAddTag && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const t = tagDraft.trim().toLowerCase();
                      if (t && !selectedContact.tags.includes(t)) {
                        void handleUpdateTags([...selectedContact.tags, t]);
                      }
                      setTagDraft('');
                      setShowAddTag(false);
                    }}
                    className="flex gap-1.5"
                  >
                    <input
                      type="text"
                      placeholder="New tag…"
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-[#602ee0] text-white px-2.5 py-1 text-xs font-semibold cursor-pointer"
                    >
                      Add
                    </button>
                  </form>
                )}
              </div>

              {/* Notes Card (E2E Encrypted) */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">🔒 Notes</span>
                  <button
                    type="button"
                    onClick={() => setShowAddNote((v) => !v)}
                    className="text-[11px] font-semibold text-[#602ee0] hover:underline cursor-pointer"
                  >
                    {showAddNote ? 'Cancel' : '+ Add Note'}
                  </button>
                </div>

                {showAddNote && (
                  <form onSubmit={(e) => void handleSaveNote(e)} className="space-y-2">
                    <textarea
                      rows={2}
                      placeholder="Write an E2E encrypted note…"
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      className="w-full rounded-lg border border-amber-200 bg-amber-50/40 px-2.5 py-1.5 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={busy || !noteDraft.trim()}
                      className="w-full rounded-lg bg-amber-600 text-white text-xs font-semibold py-1.5 cursor-pointer"
                    >
                      Save Encrypted Note
                    </button>
                  </form>
                )}

                {notes.length === 0 ? (
                  <div className="text-[11px] text-slate-400">No encrypted notes yet.</div>
                ) : (
                  <div className="space-y-2">
                    {notes.map((n) => (
                      <div
                        key={n.id}
                        className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-950 space-y-1"
                      >
                        <div className="whitespace-pre-wrap">
                          {workspaceKey
                            ? (decryptedNotes[n.id] ?? 'Decrypting…')
                            : `[Encrypted · key ${n.keyId}]`}
                        </div>
                        <div className="text-[10px] text-amber-700">
                          Updated {formatRelativeTime(n.at)} ago by {n.authorName}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* Column 3 / Mobile Screen 3: Contact Conversation History */}
        <section
          className={`${
            mobileScreen === 'history' ? 'flex' : 'hidden xl:flex'
          } flex-col min-h-0 bg-white xl:rounded-2xl xl:border xl:border-slate-200/80 xl:shadow-2xs overflow-hidden`}
        >
          {/* Mobile back bar */}
          <div className="xl:hidden flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
            <button
              type="button"
              onClick={() => setMobileScreen('details')}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              &larr; Contact Details
            </button>
            {selectedContact && (
              <button
                type="button"
                onClick={() => onOpenInInbox(selectedContact.contact)}
                className="rounded-lg bg-[#602ee0] text-white px-3 py-1 text-xs font-semibold cursor-pointer"
              >
                Open in Inbox
              </button>
            )}
          </div>

          {/* Tabs: Conversation History | Contact Activity */}
          <div className="flex items-center gap-6 px-5 pt-3 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setHistoryTab('history')}
              className={`pb-2.5 text-xs font-semibold border-b-2 cursor-pointer ${
                historyTab === 'history'
                  ? 'border-[#602ee0] text-slate-900'
                  : 'border-transparent text-slate-500'
              }`}
            >
              Conversation History ({chatMessages.length})
            </button>
            <button
              type="button"
              onClick={() => setHistoryTab('activity')}
              className={`pb-2.5 text-xs font-semibold border-b-2 cursor-pointer ${
                historyTab === 'activity'
                  ? 'border-[#602ee0] text-slate-900'
                  : 'border-transparent text-slate-500'
              }`}
            >
              Contact Activity
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {!selectedContact ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Select a contact to view conversation history.
              </div>
            ) : historyTab === 'history' ? (
              chatMessages.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No messages exchanged with {selectedContact.name} yet.
                </div>
              ) : (
                chatMessages
                  .slice()
                  .reverse()
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onOpenInInbox(selectedContact.contact)}
                      className="w-full text-left rounded-xl border border-slate-200/80 hover:border-violet-400 bg-white p-3.5 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-9 h-9 rounded-full grid place-items-center text-xs font-bold shrink-0 ${
                            m.kind === 'inbound'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-violet-100 text-violet-700'
                          }`}
                        >
                          {m.kind === 'inbound' ? 'IN' : 'OUT'}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {m.kind === 'inbound' ? 'Customer Message' : 'Agent Reply'}
                          </div>
                          <div className="text-xs text-slate-500 truncate mt-0.5">
                            {m.text}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            m.kind === 'outbound'
                              ? 'bg-violet-100 text-violet-800'
                              : selectedContact.conversationStatus === 'closed'
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {m.kind === 'outbound'
                            ? m.status
                            : (selectedContact.conversationStatus ?? 'open')}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatRelativeTime(m.at)} ago
                          {selectedContact.assignee ? ` · ${selectedContact.assignee}` : ''}
                        </span>
                      </div>
                    </button>
                  ))
              )
            ) : history.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No recorded events for {selectedContact.name} yet.
              </div>
            ) : (
              history.map((h) => (
                <div
                  key={h.seq}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 text-xs flex justify-between gap-3"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{h.type}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {h.status && `Status: ${h.status} · `}
                      {h.assignee !== null && `Assignee: ${h.assignee || 'none'} · `}
                      {h.conversationStatus && `State: ${h.conversationStatus}`}
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {formatRelativeTime(h.at)} ago
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div
            className="fixed inset-0 bg-slate-950/45"
            onClick={() => setShowAddModal(false)}
          />
          <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 m-0">Add Contact</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateContact(e)} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone / Contact ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="+14155550199"
                  value={formContact}
                  onChange={(e) => setFormContact(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  placeholder="John Davis"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="john@example.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as 'customer' | 'lead')}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  >
                    <option value="customer">Customer</option>
                    <option value="lead">Lead</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Location</label>
                <input
                  type="text"
                  placeholder="New York, USA"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-gradient-to-r from-[#6532eb] to-[#5624d6] text-white px-4 py-2 text-xs font-semibold cursor-pointer"
                >
                  Save Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
