import type { Db } from 'mongodb';

export const COLLECTIONS = {
  conversations: 'conversations',
  inboundMessages: 'inbound_messages',
  outboundMessages: 'outbound_messages',
  notes: 'notes',
  events: 'events',
  counters: 'counters',
  sessions: 'sessions',
  oauthStates: 'oauth_states',
} as const;

export interface ConversationDoc {
  workspace: string;
  contact: string;
  assignee: string | null;
  status: 'open' | 'closed';
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
  text: string;
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
