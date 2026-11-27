import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { COLLECTIONS, type CounterDoc, type EventDoc } from '../store/schema.js';

export function wsEventChannel(workspace: string): string {
  return `ws:events:${workspace}`;
}

export type NewWorkspaceEvent = Omit<EventDoc, 'workspace' | 'seq' | 'createdAt'>;

/**
 * Allocates a workspace-monotonic sequence number in MongoDB, persists the event
 * for `?after=<seq>` replay, and broadcasts it over Redis Pub/Sub for live sockets.
 */
export async function publishWorkspaceEvent(
  db: Db,
  redis: Redis | null,
  workspace: string,
  payload: NewWorkspaceEvent
): Promise<EventDoc> {
  const counter = await db.collection<CounterDoc>(COLLECTIONS.counters).findOneAndUpdate(
    { _id: workspace },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );

  const seq = counter?.seq ?? 1;
  const doc: EventDoc = {
    workspace,
    seq,
    ...payload,
    createdAt: new Date(),
  };

  await db.collection<EventDoc>(COLLECTIONS.events).insertOne(doc);

  if (redis) {
    const wireFrame = JSON.stringify({
      seq: doc.seq,
      type: doc.type,
      ...(doc.contact !== undefined ? { contact: doc.contact } : {}),
      ...(doc.message_id !== undefined ? { message_id: doc.message_id } : {}),
      ...(doc.client_ref !== undefined ? { client_ref: doc.client_ref } : {}),
      ...(doc.status !== undefined ? { status: doc.status } : {}),
      ...(doc.assignee !== undefined ? { assignee: doc.assignee } : {}),
      ...(doc.conversation_status !== undefined
        ? { conversation_status: doc.conversation_status }
        : {}),
      ...(doc.text !== undefined ? { text: doc.text } : {}),
      ...(doc.occurred_at !== undefined ? { occurred_at: doc.occurred_at } : {}),
    });

    await redis.publish(wsEventChannel(workspace), wireFrame).catch((err) => {
      console.error('Failed to publish workspace event to Redis:', err);
    });
  }

  return doc;
}
