export interface WorkspaceMembership {
  id: string;
  role: 'admin' | 'agent';
}

export interface MeResponse {
  sub: string;
  name: string;
  email: string;
  phone?: string;
  theme?: 'light' | 'system';
  language?: string;
  workspaces: WorkspaceMembership[];
}

export function updateMe(patch: {
  name?: string;
  email?: string;
  phone?: string;
  theme?: 'light' | 'system';
  language?: string;
}): Promise<MeResponse & { ok: boolean }> {
  return requestJson('/api/me', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export interface ConversationSummary {
  workspace: string;
  contact: string;
  assignee: string | null;
  status: 'open' | 'closed';
  tags?: string[];
  lastActivityAt: string;
  lastMessagePreview: string;
}

export interface ConversationHistoryItem {
  seq: number;
  type: string;
  status: string | null;
  assignee: string | null;
  conversationStatus: 'open' | 'closed' | null;
  at: string;
}

export interface InboxStats {
  workspace: string;
  open: number;
  mine: number;
  unassigned: number;
  closed: number;
}

export interface DashboardResponse {
  workspace: string;
  stats: InboxStats;
  activity: Array<{ day: string; conversations: number; messages: number }>;
  recentConversations: ConversationSummary[];
  teamActivity: {
    activeAgents: number;
    handledToday: number;
    avgFirstResponseSec: number | null;
  };
  recentEvents: Array<{
    seq: number;
    type: string;
    contact: string | null;
    status: string | null;
    assignee: string | null;
    at: string;
  }>;
}

export interface SearchResultItem {
  kind: 'conversation' | 'contact' | 'message' | 'note';
  direction?: 'inbound' | 'outbound';
  id: string;
  contact: string;
  contactName: string;
  title: string;
  subtitle: string;
  text: string;
  status?: string;
  tags?: string[];
  at: string;
  score: number;
}

export interface SearchEncryptedNoteItem {
  id: string;
  contact: string;
  contactName: string;
  ciphertext: string;
  iv: string;
  alg: string;
  keyId: string;
  authorName: string;
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

export function fetchDashboard(workspace: string): Promise<DashboardResponse> {
  const qs = new URLSearchParams({ workspace });
  return requestJson(`/api/dashboard?${qs.toString()}`);
}

export function searchMessages(
  workspace: string,
  q: string
): Promise<{
  workspace: string;
  results: SearchResultItem[];
  encryptedNotes: SearchEncryptedNoteItem[];
}> {
  const qs = new URLSearchParams({ workspace, q });
  return requestJson(`/api/search?${qs.toString()}`);
}

export function fetchMessages(
  workspace: string,
  contact: string
): Promise<{
  conversation: ConversationSummary | null;
  messages: TimelineItem[];
  history: ConversationHistoryItem[];
}> {
  const qs = new URLSearchParams({ workspace });
  return requestJson(
    `/api/conversations/${encodeURIComponent(contact)}/messages?${qs.toString()}`
  );
}

export function updateConversationTags(
  workspace: string,
  contact: string,
  tags: string[]
): Promise<{ ok: boolean; tags: string[] }> {
  return requestJson(`/api/conversations/${encodeURIComponent(contact)}/tags`, {
    method: 'PATCH',
    body: JSON.stringify({ workspace, tags }),
  });
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

export type TeamRole = 'admin' | 'manager' | 'agent' | 'viewer';

export interface TeamMemberSummary {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: 'active' | 'away' | 'offline';
  conversations: number;
  closedConversations: number;
  lastActiveAt: string | null;
  joinedAt: string;
  source: 'directory' | 'invite';
}

export interface TeamResponse {
  workspace: string;
  summary: {
    totalAgents: number;
    active: number;
    away: number;
    offline: number;
  };
  activity: Array<{ day: string; conversations: number }>;
  performance: {
    avgFirstResponseSec: number | null;
    conversationsHandled: number;
    resolutionRate: number;
    messagesSent: number;
  };
  roleCounts: Record<TeamRole, number>;
  members: TeamMemberSummary[];
}

export function logout(): Promise<{ ok: boolean }> {
  return requestJson('/auth/logout', { method: 'POST' });
}

export function fetchTeam(workspace: string): Promise<TeamResponse> {
  const qs = new URLSearchParams({ workspace });
  return requestJson(`/api/team?${qs.toString()}`);
}

export interface ContactDirectoryItem {
  workspace: string;
  contact: string;
  name: string;
  email: string;
  location: string;
  type: 'customer' | 'lead';
  tags: string[];
  assignee: string | null;
  conversationStatus: 'open' | 'closed' | null;
  lastMessagePreview: string;
  messageCount: number;
  createdAt: string;
  lastActivityAt: string;
}

export interface ContactsListResponse {
  workspace: string;
  counts: { all: number; customer: number; lead: number };
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  contacts: ContactDirectoryItem[];
}

export function fetchContacts(params: {
  workspace: string;
  type?: 'all' | 'customer' | 'lead';
  q?: string;
  page?: number;
  limit?: number;
}): Promise<ContactsListResponse> {
  const qs = new URLSearchParams({ workspace: params.workspace });
  if (params.type && params.type !== 'all') qs.set('type', params.type);
  if (params.q) qs.set('q', params.q);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  return requestJson(`/api/contacts?${qs.toString()}`);
}

export function createContact(input: {
  workspace: string;
  contact: string;
  name: string;
  email?: string;
  location?: string;
  type: 'customer' | 'lead';
}): Promise<{ ok: boolean }> {
  return requestJson('/api/contacts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateContact(
  workspace: string,
  contact: string,
  patch: Partial<{
    name: string;
    email: string;
    location: string;
    type: 'customer' | 'lead';
    tags: string[];
  }>
): Promise<{ ok: boolean }> {
  return requestJson(`/api/contacts/${encodeURIComponent(contact)}`, {
    method: 'PATCH',
    body: JSON.stringify({ workspace, ...patch }),
  });
}

export interface WorkspaceSettingsPayload {
  workspace: string;
  settings: {
    name: string;
    slug: string;
    description: string;
    timezone: string;
    channels: { pigeonEnabled: boolean; emailEnabled: boolean };
    notifications: {
      newMessageAlerts: boolean;
      assignmentAlerts: boolean;
      soundEnabled: boolean;
      dailyDigest: boolean;
    };
    security: {
      enforcePkce: boolean;
      sessionTtlHours: number;
      strictTenantIsolation: boolean;
    };
    createdAt: string;
  };
  metrics: {
    members: number;
    conversations: number;
  };
  integrations: {
    pigeonUrl: string;
    maskedPigeonKey: string;
    webhookPath: string;
    oidcIssuer: string;
    elasticsearchUrl: string;
  };
}

export interface ReportsResponse {
  workspace: string;
  days: number;
  summary: {
    totalConversations: number;
    resolved: number;
    open: number;
    assignedOpen: number;
    unassigned: number;
    resolutionRate: number;
    avgFirstResponseSec: number | null;
    avgResolutionSec: number | null;
  };
  volumeSeries: Array<{
    date: string;
    label: string;
    conversations: number;
    messages: number;
    resolved: number;
    avgFirstResponseSec: number | null;
    avgResolutionSec: number | null;
  }>;
  agentPerformance: Array<{
    id: string;
    name: string;
    email: string;
    conversations: number;
    resolved: number;
    resolutionRate: number;
    avgResolutionSec: number | null;
  }>;
}

export type BillingPlanId = 'starter' | 'professional' | 'enterprise';

export interface BillingResponse {
  workspace: string;
  billing: {
    plan: BillingPlanId;
    cycle: 'monthly' | 'annual';
    totalSeats: number;
    status: 'Active' | 'Trial';
    nextBillingAt: string;
    invoices: Array<{
      id: string;
      date: string;
      planLabel: string;
      amountInr: number;
      status: 'Paid';
    }>;
  };
  usage: {
    usedSeats: number;
    conversations: number;
    messages: number;
  };
  members: Array<{
    id: string;
    name: string;
    email: string;
    role: TeamRole;
  }>;
}

export function fetchBilling(workspace: string): Promise<BillingResponse> {
  const qs = new URLSearchParams({ workspace });
  return requestJson(`/api/billing?${qs.toString()}`);
}

export function updateBilling(
  workspace: string,
  patch: Partial<{ plan: BillingPlanId; cycle: 'monthly' | 'annual'; totalSeats: number }>
): Promise<{ ok: boolean }> {
  return requestJson('/api/billing', {
    method: 'PATCH',
    body: JSON.stringify({ workspace, ...patch }),
  });
}

export function fetchReports(workspace: string, days: 7 | 14 | 30 = 7): Promise<ReportsResponse> {
  const qs = new URLSearchParams({ workspace, days: String(days) });
  return requestJson(`/api/reports?${qs.toString()}`);
}

export function fetchWorkspaceSettings(workspace: string): Promise<WorkspaceSettingsPayload> {
  const qs = new URLSearchParams({ workspace });
  return requestJson(`/api/workspace/settings?${qs.toString()}`);
}

export function updateWorkspaceSettings(
  workspace: string,
  patch: Partial<WorkspaceSettingsPayload['settings']>
): Promise<{ ok: boolean }> {
  return requestJson('/api/workspace/settings', {
    method: 'PATCH',
    body: JSON.stringify({ workspace, ...patch }),
  });
}

export function removeTeamInvite(workspace: string, email: string): Promise<{ ok: boolean }> {
  const qs = new URLSearchParams({ workspace });
  return requestJson(`/api/team/invites/${encodeURIComponent(email)}?${qs.toString()}`, {
    method: 'DELETE',
  });
}

export function inviteTeamAgent(
  workspace: string,
  email: string,
  role: TeamRole
): Promise<{ ok: boolean }> {
  return requestJson('/api/team/invites', {
    method: 'POST',
    body: JSON.stringify({ workspace, email, role }),
  });
}
