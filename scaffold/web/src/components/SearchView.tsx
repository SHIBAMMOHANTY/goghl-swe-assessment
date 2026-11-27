import React, { useState } from 'react';
import { searchMessages, type SearchResultItem } from '../api';

interface SearchViewProps {
  workspace: string;
  onOpenConversation: (contact: string) => void;
}

export function SearchView({ workspace, onOpenConversation }: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setErr(null);
    try {
      const res = await searchMessages(workspace, query);
      setResults(res.results);
      setSearched(true);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 bg-slate-50">
      <div>
        <h2 className="text-lg font-bold text-slate-900 m-0">Message Search</h2>
        <p className="text-xs text-slate-500 mt-1 mb-0">
          Searching messages strictly within workspace <strong>{workspace}</strong>. E2E encrypted
          private notes are excluded from server-side search.
        </p>
      </div>

      <form className="flex gap-2.5 max-w-2xl" onSubmit={(e) => void handleSearch(e)}>
        <input
          type="search"
          placeholder={`Search customer or agent messages in ${workspace}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={searching}
          className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 cursor-pointer"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {err && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {err}
        </div>
      )}

      <div className="flex flex-col gap-2.5 max-w-3xl">
        {!searched ? (
          <div className="py-10 text-center text-xs text-slate-500">
            Enter a keyword or contact number to search.
          </div>
        ) : results.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            No matching messages found in {workspace}.
          </div>
        ) : (
          results.map((r) => (
            <button
              key={`${r.kind}_${r.id}`}
              type="button"
              onClick={() => onOpenConversation(r.contact)}
              className="w-full text-left rounded-xl border border-slate-200 bg-white hover:border-blue-500 p-3.5 flex flex-col gap-1 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm text-slate-900">{r.contact}</strong>
                <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-semibold">
                  {r.kind}
                </span>
              </div>
              <div className="text-sm text-slate-700">{r.text}</div>
              <div className="text-[11px] text-slate-500">{new Date(r.at).toLocaleString()}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
