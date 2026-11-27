export interface WorkspaceMembership {
  id: string;
  role: 'admin' | 'agent';
}

export interface MeResponse {
  sub: string;
  name: string;
  email: string;
  workspaces: WorkspaceMembership[];
}

export interface ConversationSummary {
  workspace: string;
  contact: string;
  assignee: string | null;
  status: 'open' | 'closed';
  lastActivityAt: string;
  lastMessagePreview: string;
}

export interface InboxStats {
  workspace: string;
  open: number;
  mine: number;
  unassigned: number;
  closed: number;
}

export interface SearchResultItem {
  kind: 'inbound' | 'outbound';
  id: string;
  contact: string;
  text: string;
  status?: 'queued' | 'sent' | 'delivered' | 'failed';
  at: string;
}

export type TimelineItem =
  | {
      kind: 'inbound';
      id: string;
      text: string;
      at: string;
    }
  | {
      kind: 'outbound';
      id: string;
      clientRef: string;
      text: string;
      status: 'queued' | 'sent' | 'delivered' | 'failed';
      agent: string | null;
      at: string;
    }
  | {
      kind: 'note';
      id: string;
      ciphertext: string;
      iv: string;
      alg: string;
      keyId: string;
      authorSub: string;
      authorName: string;
      at: string;
    };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function fetchMe(): Promise<MeResponse | null> {
  const res = await fetch('/api/me', { credentials: 'same-origin' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /api/me returned ${res.status}`);
  return (await res.json()) as MeResponse;
}

export function fetchConversations(params: {
  workspace: string;
  status?: 'open' | 'closed' | 'all';
  cursor?: string | null;
}): Promise<{ conversations: ConversationSummary[]; nextCursor: string | null }> {
  const qs = new URLSearchParams({ workspace: params.workspace, limit: '25' });
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  if (params.cursor) qs.set('cursor', params.cursor);
  return requestJson(`/api/conversations?${qs.toString()}`);
}

export function fetchStats(workspace: string): Promise<InboxStats> {
  const qs = new URLSearchParams({ workspace });
  return requestJson(`/api/conversations/stats?${qs.toString()}`);
}

export function searchMessages(
  workspace: string,
  q: string
): Promise<{ workspace: string; results: SearchResultItem[] }> {
  const qs = new URLSearchParams({ workspace, q });
  return requestJson(`/api/search?${qs.toString()}`);
}

export function fetchMessages(
  workspace: string,
  contact: string
): Promise<{ conversation: ConversationSummary | null; messages: TimelineItem[] }> {
  const qs = new URLSearchParams({ workspace });
  return requestJson(
    `/api/conversations/${encodeURIComponent(contact)}/messages?${qs.toString()}`
  );
}

export function sendReply(
  workspace: string,
  contact: string,
  text: string,
  clientRef: string
): Promise<{ ok: boolean; client_ref: string; status: string }> {
  return requestJson(`/api/conversations/${encodeURIComponent(contact)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ workspace, text, client_ref: clientRef }),
  });
}

export function claimConversation(workspace: string, contact: string): Promise<{ assignee: string }> {
  return requestJson(`/api/conversations/${encodeURIComponent(contact)}/claim`, {
    method: 'POST',
    body: JSON.stringify({ workspace }),
  });
}

export function releaseConversation(
  workspace: string,
  contact: string
): Promise<{ assignee: string | null }> {
  return requestJson(`/api/conversations/${encodeURIComponent(contact)}/release`, {
    method: 'POST',
    body: JSON.stringify({ workspace }),
  });
}

export function setConversationStatus(
  workspace: string,
  contact: string,
  action: 'close' | 'reopen'
): Promise<{ status: 'open' | 'closed' }> {
  return requestJson(`/api/conversations/${encodeURIComponent(contact)}/${action}`, {
    method: 'POST',
    body: JSON.stringify({ workspace }),
  });
}

export function addNote(
  workspace: string,
  contact: string,
  payload: { ciphertext: string; iv: string; alg: string; keyId: string }
): Promise<{ ok: boolean; note: TimelineItem }> {
  return requestJson(`/api/conversations/${encodeURIComponent(contact)}/notes`, {
    method: 'POST',
    body: JSON.stringify({ workspace, ...payload }),
  });
}

export function logout(): Promise<{ ok: boolean }> {
  return requestJson('/auth/logout', { method: 'POST' });
}
