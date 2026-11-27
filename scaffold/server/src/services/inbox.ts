import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { config } from '../config.js';
import { publishWorkspaceEvent } from './events.js';
import {
  COLLECTIONS,
  ensureIndexes,
  type ConversationDoc,
  type InboundMessageDoc,
  type NoteDoc,
  type OutboundMessageDoc,
  type OutboundStatus,
} from '../store/schema.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export function isKnownWorkspace(workspace: string): boolean {
  return Object.prototype.hasOwnProperty.call(config.pigeon.apiKeys, workspace);
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export interface EnqueueReplyInput {
  workspace: string;
  contact: string;
  text: string;
  clientRef: string;
  agent: string | null;
}

export async function enqueueReply(
  db: Db,
  redis: Redis | null,
  input: EnqueueReplyInput
): Promise<{ doc: OutboundMessageDoc; created: boolean }> {
  const { workspace, contact, text, clientRef, agent } = input;
  if (!isKnownWorkspace(workspace)) {
    throw new HttpError(404, `Unknown workspace: ${workspace}`);
  }
  if (!contact || typeof contact !== 'string') {
    throw new HttpError(400, 'contact is required');
  }
  if (!text || typeof text !== 'string') {
    throw new HttpError(400, 'text is required');
  }
  if (!clientRef || typeof clientRef !== 'string') {
    throw new HttpError(400, 'client_ref is required');
  }

  await ensureIndexes(db);
  const now = new Date();

  // Ensure the conversation exists even if the customer has not written yet.
  try {
    await db.collection<ConversationDoc>(COLLECTIONS.conversations).updateOne(
      { workspace, contact },
      {
        $setOnInsert: {
          workspace,
          contact,
          assignee: null,
          status: 'open',
          createdAt: now,
        },
        $max: { lastActivityAt: now },
        $set: {
          updatedAt: now,
          lastMessagePreview: text.slice(0, 140),
        },
      },
      { upsert: true }
    );
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }

  let created = false;
  let doc: OutboundMessageDoc | null = null;

  try {
    const res = await db.collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages).updateOne(
      { workspace, clientRef },
      {
        $setOnInsert: {
          workspace,
          contact,
          clientRef,
          text,
          agent,
          status: 'queued',
          pigeonId: null,
          attempts: 0,
          nextRetryAt: now,
          leaseOwner: null,
          leaseUntil: null,
          lastError: null,
          createdAt: now,
          updatedAt: now,
          statusUpdatedAt: null,
        },
      },
      { upsert: true }
    );
    created = res.upsertedCount === 1;
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    created = false;
  }

  doc = await db
    .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
    .findOne({ workspace, clientRef });

  if (!doc) {
    throw new HttpError(500, 'Failed to persist outbound reply');
  }

  if (created) {
    await publishWorkspaceEvent(db, redis, workspace, {
      type: 'message.outbound',
      contact,
      client_ref: clientRef,
      text,
      status: doc.status,
      occurred_at: doc.createdAt.toISOString(),
    });
  }

  return { doc, created };
}

export async function claimConversation(
  db: Db,
  redis: Redis | null,
  input: { workspace: string; contact: string; agent: string }
): Promise<{ ok: true; assignee: string } | { ok: false; holder: string | null }> {
  const { workspace, contact, agent } = input;
  if (!isKnownWorkspace(workspace)) {
    throw new HttpError(404, `Unknown workspace: ${workspace}`);
  }
  if (!contact || !agent) {
    throw new HttpError(400, 'contact and agent are required');
  }

  await ensureIndexes(db);

  for (let attempt = 0; attempt < 2; attempt++) {
    const now = new Date();
    try {
      const before = await db.collection<ConversationDoc>(COLLECTIONS.conversations).findOneAndUpdate(
        {
          workspace,
          contact,
          $or: [{ assignee: null }, { assignee: agent }],
        },
        {
          $set: { assignee: agent, updatedAt: now },
          $setOnInsert: {
            workspace,
            contact,
            status: 'open',
            lastActivityAt: now,
            lastMessagePreview: '',
            createdAt: now,
          },
        },
        { upsert: true, returnDocument: 'before' }
      );

      if (!before || before.assignee === null) {
        await publishWorkspaceEvent(db, redis, workspace, {
          type: 'conversation.assigned',
          contact,
          assignee: agent,
        });
      }

      return { ok: true, assignee: agent };
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const existing = await db
        .collection<ConversationDoc>(COLLECTIONS.conversations)
        .findOne({ workspace, contact });
      if (existing && existing.assignee === agent) {
        return { ok: true, assignee: agent };
      }
      if (existing && existing.assignee !== null) {
        return { ok: false, holder: existing.assignee };
      }
      // Race on simultaneous insert with assignee=null; retry once.
    }
  }

  const existing = await db
    .collection<ConversationDoc>(COLLECTIONS.conversations)
    .findOne({ workspace, contact });
  return { ok: false, holder: existing?.assignee ?? null };
}

export async function releaseConversation(
  db: Db,
  redis: Redis | null,
  input: { workspace: string; contact: string; agent: string; isAdmin: boolean }
): Promise<ConversationDoc> {
  const { workspace, contact, agent, isAdmin } = input;
  await ensureIndexes(db);

  const filter = isAdmin
    ? { workspace, contact }
    : { workspace, contact, $or: [{ assignee: agent }, { assignee: null }] };

  const updated = await db
    .collection<ConversationDoc>(COLLECTIONS.conversations)
    .findOneAndUpdate(
      filter,
      { $set: { assignee: null, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

  if (!updated) {
    const exists = await db
      .collection<ConversationDoc>(COLLECTIONS.conversations)
      .findOne({ workspace, contact });
    if (!exists) throw new HttpError(404, 'Conversation not found');
    throw new HttpError(409, `Conversation is held by ${exists.assignee}`);
  }

  await publishWorkspaceEvent(db, redis, workspace, {
    type: 'conversation.assigned',
    contact,
    assignee: null,
  });

  return updated;
}

export async function setConversationStatus(
  db: Db,
  redis: Redis | null,
  input: { workspace: string; contact: string; status: 'open' | 'closed' }
): Promise<ConversationDoc> {
  const { workspace, contact, status } = input;
  await ensureIndexes(db);

  const updated = await db
    .collection<ConversationDoc>(COLLECTIONS.conversations)
    .findOneAndUpdate(
      { workspace, contact },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

  if (!updated) {
    throw new HttpError(404, 'Conversation not found');
  }

  await publishWorkspaceEvent(db, redis, workspace, {
    type: 'conversation.status',
    contact,
    conversation_status: status,
  });

  return updated;
}

export async function addConversationNote(
  db: Db,
  redis: Redis | null,
  input: {
    workspace: string;
    contact: string;
    authorSub: string;
    authorName: string;
    text: string;
  }
): Promise<NoteDoc> {
  const { workspace, contact, authorSub, authorName, text } = input;
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new HttpError(400, 'Note text is required');
  }
  await ensureIndexes(db);

  const conv = await db
    .collection<ConversationDoc>(COLLECTIONS.conversations)
    .findOne({ workspace, contact });
  if (!conv) {
    throw new HttpError(404, 'Conversation not found');
  }

  const note: NoteDoc = {
    workspace,
    contact,
    authorSub,
    authorName,
    text: text.trim(),
    createdAt: new Date(),
  };

  await db.collection<NoteDoc>(COLLECTIONS.notes).insertOne(note);
  await publishWorkspaceEvent(db, redis, workspace, {
    type: 'note.created',
    contact,
    text: note.text,
    occurred_at: note.createdAt.toISOString(),
  });

  return note;
}

export interface SnapshotShape {
  workspaces: Record<
    string,
    {
      contacts: Record<string, { inbound: string[]; assignee: string | null }>;
      outbound: Record<string, OutboundStatus>;
    }
  >;
}

export async function getGraderSnapshot(db: Db): Promise<SnapshotShape> {
  await ensureIndexes(db);
  const [conversations, inbound, outbound] = await Promise.all([
    db.collection<ConversationDoc>(COLLECTIONS.conversations).find({}).toArray(),
    db
      .collection<InboundMessageDoc>(COLLECTIONS.inboundMessages)
      .find({})
      .sort({ occurredAt: 1, messageId: 1 })
      .toArray(),
    db.collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages).find({}).toArray(),
  ]);

  const workspaces: SnapshotShape['workspaces'] = {};
  const ensureWs = (ws: string) => {
    if (!workspaces[ws]) {
      workspaces[ws] = { contacts: {}, outbound: {} };
    }
    return workspaces[ws];
  };
  const ensureContact = (ws: string, contact: string) => {
    const entry = ensureWs(ws);
    if (!entry.contacts[contact]) {
      entry.contacts[contact] = { inbound: [], assignee: null };
    }
    return entry.contacts[contact];
  };

  for (const conv of conversations) {
    const c = ensureContact(conv.workspace, conv.contact);
    c.assignee = conv.assignee ?? null;
  }

  for (const msg of inbound) {
    const c = ensureContact(msg.workspace, msg.contact);
    c.inbound.push(msg.messageId);
  }

  for (const out of outbound) {
    const entry = ensureWs(out.workspace);
    entry.outbound[out.clientRef] = out.status;
  }

  return { workspaces };
}
