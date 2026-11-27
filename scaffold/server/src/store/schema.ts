import type { Db } from 'mongodb';

export const COLLECTIONS = {
  conversations: 'conversations',
  contacts: 'contacts',
  inboundMessages: 'inbound_messages',
  outboundMessages: 'outbound_messages',
  notes: 'notes',
  events: 'events',
  counters: 'counters',
  sessions: 'sessions',
  oauthStates: 'oauth_states',
  teamInvites: 'team_invites',
  workspaceSettings: 'workspace_settings',
  workspaceBilling: 'workspace_billing',
  userProfiles: 'user_profiles',
} as const;

export interface UserProfileDoc {
  _id: string; // sub
  name: string;
  email: string;
  phone: string;
  theme: 'light' | 'system';
  language: string;
  updatedAt: Date;
}

export type BillingPlanId = 'starter' | 'professional' | 'enterprise';

export interface BillingInvoiceItem {
  id: string;
  date: string;
  planLabel: string;
  amountInr: number;
  status: 'Paid';
}

export interface WorkspaceBillingDoc {
  _id: string; // workspace id
  plan: BillingPlanId;
  cycle: 'monthly' | 'annual';
  totalSeats: number;
  status: 'Active' | 'Trial';
  nextBillingAt: Date;
  invoices: BillingInvoiceItem[];
  updatedAt: Date;
}

export interface WorkspaceSettingsDoc {
  _id: string; // workspace id
  name: string;
  slug: string;
  description: string;
  timezone: string;
  channels: {
    pigeonEnabled: boolean;
    emailEnabled: boolean;
  };
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
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactDoc {
  workspace: string;
  contact: string;
  name: string;
  email: string;
  location: string;
  type: 'customer' | 'lead';
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationDoc {
  workspace: string;
  contact: string;
  assignee: string | null;
  status: 'open' | 'closed';
  tags?: string[];
  lastActivityAt: Date;
  lastMessagePreview: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InboundMessageDoc {
  workspace: string;
  contact: string;
  messageId: string;
  text: string;
  occurredAt: Date;
  eventId: string;
  createdAt: Date;
}

export type OutboundStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export interface OutboundMessageDoc {
  workspace: string;
  contact: string;
  clientRef: string;
  text: string;
  agent: string | null;
  status: OutboundStatus;
  pigeonId: string | null;
  attempts: number;
  nextRetryAt: Date;
  leaseOwner: string | null;
  leaseUntil: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  statusUpdatedAt: Date | null;
}

export interface NoteDoc {
  workspace: string;
  contact: string;
  authorSub: string;
  authorName: string;
  ciphertext: string;
  iv: string;
  alg: string;
  keyId: string;
  createdAt: Date;
}

export interface EventDoc {
  workspace: string;
  seq: number;
  type: string;
  contact?: string;
  message_id?: string;
  client_ref?: string;
  status?: string;
  assignee?: string | null;
  conversation_status?: 'open' | 'closed';
  text?: string;
  occurred_at?: string;
  createdAt: Date;
}

export interface CounterDoc {
  _id: string;
  seq: number;
}

export interface WorkspaceMembership {
  id: string;
  role: 'admin' | 'agent';
}

export interface SessionDoc {
  _id: string;
  sub: string;
  name: string;
  email: string;
  workspaces: WorkspaceMembership[];
  createdAt: Date;
  expiresAt: Date;
}

export type TeamRole = 'admin' | 'manager' | 'agent' | 'viewer';

export interface TeamInviteDoc {
  workspace: string;
  email: string;
  name: string;
  role: TeamRole;
  status: 'active' | 'away' | 'offline';
  invitedBy: string;
  createdAt: Date;
}

export interface OAuthStateDoc {
  _id: string;
  nonce: string;
  codeVerifier: string;
  createdAt: Date;
  expiresAt: Date;
}

const indexedDbs = new WeakMap<Db, Promise<void>>();

/**
 * Creates required MongoDB indexes idempotently once per Db instance.
 */
export function ensureIndexes(db: Db): Promise<void> {
  const existing = indexedDbs.get(db);
  if (existing) return existing;

  const task = (async () => {
    await Promise.all([
      db.collection(COLLECTIONS.conversations).createIndexes([
        { key: { workspace: 1, contact: 1 }, unique: true },
        { key: { workspace: 1, lastActivityAt: -1, contact: 1 } },
      ]),
      db.collection(COLLECTIONS.contacts).createIndexes([
        { key: { workspace: 1, contact: 1 }, unique: true },
      ]),
      db.collection(COLLECTIONS.inboundMessages).createIndexes([
        { key: { workspace: 1, messageId: 1 }, unique: true },
        { key: { workspace: 1, contact: 1, occurredAt: 1, messageId: 1 } },
      ]),
      db.collection(COLLECTIONS.outboundMessages).createIndexes([
        { key: { workspace: 1, clientRef: 1 }, unique: true },
        { key: { status: 1, nextRetryAt: 1, leaseUntil: 1 } },
        { key: { workspace: 1, contact: 1, createdAt: 1 } },
      ]),
      db.collection(COLLECTIONS.notes).createIndexes([
        { key: { workspace: 1, contact: 1, createdAt: 1 } },
      ]),
      db.collection(COLLECTIONS.events).createIndexes([
        { key: { workspace: 1, seq: 1 }, unique: true },
      ]),
      db.collection(COLLECTIONS.sessions).createIndexes([
        { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      ]),
      db.collection(COLLECTIONS.oauthStates).createIndexes([
        { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      ]),
    ]);
  })().catch((err) => {
    indexedDbs.delete(db);
    throw err;
  });

  indexedDbs.set(db, task);
  return task;
}
