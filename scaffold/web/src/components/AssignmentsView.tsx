import type { ConversationSummary, MeResponse } from '../api';

interface AssignmentsViewProps {
  me: MeResponse;
  workspace: string;
  conversations: ConversationSummary[];
  busy: boolean;
  onClaim: (contact: string) => Promise<void>;
  onRelease: (contact: string) => Promise<void>;
  onOpenConversation: (contact: string) => void;
}

export function AssignmentsView({
  me,
  workspace,
  conversations,
  busy,
  onClaim,
  onRelease,
  onOpenConversation,
}: AssignmentsViewProps) {
  const role = me.workspaces.find((w) => w.id === workspace)?.role ?? 'agent';
  const mine = conversations.filter((c) => c.assignee === me.sub);
  const unassigned = conversations.filter((c) => c.assignee === null && c.status === 'open');
  const others = conversations.filter((c) => c.assignee !== null && c.assignee !== me.sub);

  const renderGroup = (title: string, items: ConversationSummary[]) => (
    <div className="bg-white border border-slate-200 rounded-xl flex flex-col min-h-[260px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 m-0">{title}</h3>
        <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-semibold">
          {items.length}
        </span>
      </div>
      <div className="p-3 flex flex-col gap-2.5 overflow-y-auto">
        {items.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">None</div>
        ) : (
          items.map((c) => (
            <div
              key={c.contact}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="text-xs text-slate-900">{c.contact}</strong>
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
              <div className="text-xs text-slate-600 truncate">
                {c.lastMessagePreview || 'No messages yet'}
              </div>
              <div className="text-[11px] text-slate-500">
                {c.assignee ? `Holder: ${c.assignee}` : 'Available to claim'}
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => onOpenConversation(c.contact)}
                  className="rounded-md border border-slate-200 bg-white hover:bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 cursor-pointer"
                >
                  Open
                </button>
                {c.assignee === null && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onClaim(c.contact)}
                    className="rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-2 py-1 text-[11px] font-semibold text-white cursor-pointer"
                  >
                    Claim
                  </button>
                )}
                {(c.assignee === me.sub || (c.assignee !== null && role === 'admin')) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onRelease(c.contact)}
                    className="rounded-md border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-50 px-2 py-1 text-[11px] font-medium text-slate-700 cursor-pointer"
                  >
                    Release
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-4 bg-slate-50">
      <div>
        <h2 className="text-lg font-bold text-slate-900 m-0">Assignment &amp; Agent Management</h2>
        <p className="text-xs text-slate-500 mt-1 mb-0">
          Workspace <strong>{workspace}</strong> · Signed in as <strong>{me.name}</strong> ({role})
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        {renderGroup('Assigned to Me', mine)}
        {renderGroup('Unassigned Queue', unassigned)}
        {renderGroup('Assigned to Other Agents', others)}
      </div>
    </div>
  );
}
