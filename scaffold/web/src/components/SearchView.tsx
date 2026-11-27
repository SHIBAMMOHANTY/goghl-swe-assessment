import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchMessages,
  searchMessages,
  type ConversationSummary,
  type SearchResultItem,
  type TimelineItem,
} from '../api';
import { decryptNote } from '../crypto';
import { formatRelativeTime } from './workspaceMeta';

interface SearchViewProps {
  workspace: string;
  workspaceKey: string;
  onOpenConversation: (contact: string) => void;
}

type CategoryFilter = 'all' | 'conversation' | 'contact' | 'message' | 'note';
type SortMode = 'relevant' | 'newest' | 'oldest';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && /[a-z]/i.test(parts[0])) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  const digits = name.replace(/\D/g, '');
  if (digits.length >= 2) return digits.slice(-2);
  return name.slice(0, 2).toUpperCase();
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <strong key={i} className="text-[#602ee0] font-semibold">
            {part}
          </strong>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}

export function SearchView({
  workspace,
  workspaceKey,
  onOpenConversation,
}: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sortBy, setSortBy] = useState<SortMode>('relevant');
  const [allResults, setAllResults] = useState<SearchResultItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  // Right-hand preview panel state
  const [previewConv, setPreviewConv] = useState<ConversationSummary | null>(null);
  const [previewMsgs, setPreviewMsgs] = useState<TimelineItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const runSearch = async (rawQuery: string) => {
    const q = rawQuery.trim();
    setSubmittedQuery(q);
    if (!q) {
      setAllResults([]);
      setSelectedId(null);
      return;
    }

    setSearching(true);
    setErr(null);
    try {
      const res = await searchMessages(workspace, q);
      const qLower = q.toLowerCase();

      // Locally decrypt E2E encrypted notes so Private Notes are searchable without server access
      const noteMatches: SearchResultItem[] = [];
      if (workspaceKey && res.encryptedNotes.length > 0) {
        const decrypted = await Promise.all(
          res.encryptedNotes.map(async (n) => {
            try {
              const plaintext = await decryptNote(
                workspaceKey,
                workspace,
                n.contact,
                n.ciphertext,
                n.iv
              );
              return { ...n, plaintext };
            } catch {
              return null;
            }
          })
        );
        for (const item of decrypted) {
          if (!item) continue;
          if (item.plaintext.toLowerCase().includes(qLower)) {
            noteMatches.push({
              kind: 'note',
              id: item.id,
              contact: item.contact,
              contactName: item.contactName,
              title: `Private Note · ${item.authorName}`,
              subtitle: item.contactName,
              text: item.plaintext,
              status: 'Note',
              at: item.at,
              score: 95,
            });
          }
        }
      }

      const merged = [...res.results, ...noteMatches];
      setAllResults(merged);
      setSelectedId(merged[0]?.id ?? null);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  // Clear when workspace changes
  useEffect(() => {
    setAllResults([]);
    setSelectedId(null);
    setPreviewConv(null);
    setPreviewMsgs([]);
    setMobileShowDetail(false);
  }, [workspace]);

  const counts = useMemo(
    () => ({
      all: allResults.length,
      conversation: allResults.filter((r) => r.kind === 'conversation').length,
      contact: allResults.filter((r) => r.kind === 'contact').length,
      message: allResults.filter((r) => r.kind === 'message').length,
      note: allResults.filter((r) => r.kind === 'note').length,
    }),
    [allResults]
  );

  const visibleResults = useMemo(() => {
    const filtered =
      category === 'all' ? allResults : allResults.filter((r) => r.kind === category);
    return filtered.slice().sort((a, b) => {
      if (sortBy === 'newest') return Date.parse(b.at) - Date.parse(a.at);
      if (sortBy === 'oldest') return Date.parse(a.at) - Date.parse(b.at);
      return b.score - a.score || Date.parse(b.at) - Date.parse(a.at);
    });
  }, [allResults, category, sortBy]);

  const selectedResult =
    visibleResults.find((r) => r.id === selectedId) ?? visibleResults[0] ?? null;

  useEffect(() => {
    if (!selectedResult) {
      setPreviewConv(null);
      setPreviewMsgs([]);
      return;
    }
    let cancelled = false;
    void fetchMessages(workspace, selectedResult.contact)
      .then((res) => {
        if (!cancelled) {
          setPreviewConv(res.conversation);
          setPreviewMsgs(res.messages.filter((m) => m.kind !== 'note'));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewConv(null);
          setPreviewMsgs([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, selectedResult?.contact]);

  const categoryBadge = (r: SearchResultItem) => {
    if (r.kind === 'conversation') {
      return (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
            r.status === 'closed'
              ? 'bg-slate-200 text-slate-700'
              : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {r.status || 'open'}
        </span>
      );
    }
    if (r.kind === 'contact') {
      return (
        <span className="rounded-full bg-violet-100 text-[#602ee0] px-2 py-0.5 text-[10px] font-semibold">
          Contact
        </span>
      );
    }
    if (r.kind === 'note') {
      return (
        <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-semibold">
          Note
        </span>
      );
    }
    return null;
  };

  const resultIcon = (kind: SearchResultItem['kind']) => {
    if (kind === 'conversation') {
      return (
        <span className="w-8 h-8 rounded-lg bg-violet-100 text-[#602ee0] grid place-items-center shrink-0 text-xs">
          💬
        </span>
      );
    }
    if (kind === 'contact') {
      return (
        <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 grid place-items-center shrink-0 text-xs">
          👤
        </span>
      );
    }
    if (kind === 'note') {
      return (
        <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 grid place-items-center shrink-0 text-xs">
          🔒
        </span>
      );
    }
    return (
      <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 grid place-items-center shrink-0 text-xs">
        ✉
      </span>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#f7f8fc] pb-12 lg:pb-0">
      {/* Search Input + Category Tabs */}
      <div className="bg-white border-b border-slate-200/80 px-4 sm:px-6 pt-3.5 pb-0 space-y-3">
        {/* Purple-accented Search Input Bar with Clear Action */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query);
          }}
          className="relative flex items-center"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder={`Search conversations, contacts, messages, notes in ${workspace}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border-2 border-[#7c3aed]/70 focus:border-[#602ee0] bg-white pl-10 pr-24 py-2.5 text-sm text-slate-900 focus:outline-none shadow-2xs"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                setSubmittedQuery('');
                setAllResults([]);
                setSelectedId(null);
              }}
              className="absolute right-16 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
            >
              ✕
            </button>
          )}
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="absolute right-1.5 rounded-lg bg-[#602ee0] hover:bg-[#4e22c2] disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 cursor-pointer"
          >
            {searching ? '…' : 'Search'}
          </button>
        </form>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto">
          {(
            [
              ['all', 'All Results', counts.all],
              ['conversation', 'Conversations', counts.conversation],
              ['contact', 'Contacts', counts.contact],
              ['message', 'Messages', counts.message],
              ['note', 'Notes', counts.note],
            ] as const
          ).map(([id, label, count]) => {
            const active = category === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(id)}
                className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  active
                    ? 'border-[#602ee0] text-[#602ee0]'
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
      </div>

      {err && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700">
          {err}
        </div>
      )}

      {/* Results List + Preview Panel */}
      <div className="flex-1 min-h-0 p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-4">
        {/* Left: Results List */}
        <section
          className={`${
            mobileShowDetail && selectedResult ? 'hidden lg:flex' : 'flex'
          } flex-col min-h-0 gap-3`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-600">
              {submittedQuery ? (
                <>
                  <strong>{visibleResults.length}</strong> results for &ldquo;{submittedQuery}&rdquo;
                </>
              ) : (
                'Enter a search term to scan workspace records'
              )}
            </span>
            <select
              aria-label="Sort search results"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortMode)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              <option value="relevant">Most Relevant</option>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
            {!submittedQuery ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center text-xs text-slate-400">
                Search across customer names, phone numbers, messages, tags, and decrypted private
                notes in <strong>{workspace}</strong>.
              </div>
            ) : visibleResults.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center text-xs text-slate-400">
                No matching results found for &ldquo;{submittedQuery}&rdquo;.
              </div>
            ) : (
              visibleResults.map((r) => {
                const selected = selectedResult?.id === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(r.id);
                      setMobileShowDetail(true);
                    }}
                    className={`w-full text-left rounded-2xl border p-3.5 transition-all flex items-start justify-between gap-3 cursor-pointer ${
                      selected
                        ? 'bg-violet-50/80 border-violet-400 border-l-4 border-l-[#602ee0] shadow-xs'
                        : 'bg-white border-slate-200/80 hover:border-violet-300'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      {resultIcon(r.kind)}
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          <HighlightText text={r.title} query={submittedQuery} />
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          <HighlightText text={r.subtitle} query={submittedQuery} />
                        </div>
                        <div className="text-xs text-slate-600 line-clamp-2 mt-1">
                          <HighlightText text={r.text} query={submittedQuery} />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[11px] text-slate-400">
                        {formatRelativeTime(r.at)} ago
                      </span>
                      {categoryBadge(r)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Right: Customer & Conversation Details Preview Panel */}
        <section
          className={`${
            mobileShowDetail && selectedResult ? 'flex' : 'hidden lg:flex'
          } flex-col min-h-0 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs overflow-hidden`}
        >
          {!selectedResult ? (
            <div className="flex-1 grid place-items-center text-xs text-slate-400 text-center p-6">
              Select a search result to preview customer details and recent messages.
            </div>
          ) : (
            <>
              <div className="lg:hidden mb-3">
                <button
                  type="button"
                  onClick={() => setMobileShowDetail(false)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  &larr; Results
                </button>
              </div>

              <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0 truncate">
                    {selectedResult.title}
                  </h2>
                  <span
                    className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      previewConv?.status === 'closed'
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {previewConv?.status ?? 'open'}
                  </span>
                </div>
                <button
                  type="button"
                  title="Open in Inbox"
                  onClick={() => onOpenConversation(selectedResult.contact)}
                  className="text-slate-400 hover:text-[#602ee0] p-1 cursor-pointer"
                >
                  ↗
                </button>
              </div>

              <div className="py-3 border-b border-slate-100 space-y-2 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 grid place-items-center text-xs font-bold shrink-0">
                    {initials(selectedResult.contactName)}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">
                      {selectedResult.contactName}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {selectedResult.contact}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 space-y-1">
                  {previewConv && (
                    <div>Last activity: {new Date(previewConv.lastActivityAt).toLocaleString()}</div>
                  )}
                  <div>{previewMsgs.length} messages in thread</div>
                </div>

                {(previewConv?.tags ?? selectedResult.tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(previewConv?.tags ?? selectedResult.tags ?? []).map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-violet-100 text-violet-800 px-2 py-0.5 text-[10px] font-medium"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
                <div className="text-xs font-bold text-slate-800">Recent Messages</div>
                {previewMsgs.length === 0 ? (
                  <div className="text-xs text-slate-400">No messages in this thread yet.</div>
                ) : (
                  previewMsgs.slice(-4).map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                        m.kind === 'inbound'
                          ? 'bg-slate-100 text-slate-800 mr-6'
                          : 'bg-gradient-to-r from-[#6532eb] to-[#5624d6] text-white ml-6'
                      }`}
                    >
                      <div>
                        <HighlightText
                          text={m.kind !== 'note' ? m.text : ''}
                          query={m.kind === 'inbound' ? submittedQuery : ''}
                        />
                      </div>
                      <div
                        className={`text-[10px] mt-1 ${
                          m.kind === 'inbound' ? 'text-slate-400' : 'text-violet-100/90'
                        }`}
                      >
                        {new Date(m.at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => onOpenConversation(selectedResult.contact)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white hover:border-[#602ee0] hover:text-[#602ee0] py-2 text-xs font-semibold text-slate-800 transition-colors cursor-pointer"
              >
                &rarr; View Full Conversation
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
