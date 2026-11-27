import { Router } from 'express';
import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { getDb } from '../db.js';
import { requireGraderToken } from '../middleware/graderAuth.js';
import { getRedis } from '../redis.js';
import {
  claimConversation,
  enqueueReply,
  getGraderSnapshot,
  HttpError,
} from '../services/inbox.js';

const SESSION_COLLECTIONS = new Set(['sessions']);
const SESSION_KEY_PREFIXES = ['session:', 'sess:'];
const REDIS_SCAN_COUNT = 500;

export interface GraderDeps {
  getDb: () => Promise<Db>;
  getRedis: () => Redis | null;
  kickOutbox?: () => void;
}

function isSessionKey(key: string): boolean {
  return SESSION_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export async function clearMongoApplicationData(db: Db): Promise<void> {
  const collections = await db.listCollections().toArray();
  for (const col of collections) {
    if (col.type && col.type !== 'collection') continue;
    if (col.name.startsWith('system.') || SESSION_COLLECTIONS.has(col.name)) continue;
    await db.collection(col.name).deleteMany({});
  }
}

export async function clearRedisApplicationData(redis: Redis | null): Promise<void> {
  if (!redis) return;
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'COUNT', REDIS_SCAN_COUNT);
    cursor = nextCursor;
    const keysToDelete = keys.filter((key) => !isSessionKey(key));
    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }
  } while (cursor !== '0');
}

export function createGraderRouter(deps: GraderDeps = { getDb, getRedis }): Router {
  const router = Router();

  router.use(requireGraderToken);

  router.post('/reset', async (_req, res, next) => {
    try {
      const [db, redis] = await Promise.all([deps.getDb(), Promise.resolve(deps.getRedis())]);
      await Promise.all([clearMongoApplicationData(db), clearRedisApplicationData(redis)]);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/snapshot', async (_req, res, next) => {
    try {
      const db = await deps.getDb();
      const snapshot = await getGraderSnapshot(db);
      res.status(200).json(snapshot);
    } catch (err) {
      next(err);
    }
  });

  router.post('/reply', async (req, res, next) => {
    try {
      const { workspace, contact, text, client_ref } = (req.body ?? {}) as {
        workspace?: string;
        contact?: string;
        text?: string;
        client_ref?: string;
      };
      const db = await deps.getDb();
      const redis = deps.getRedis();
      const { doc } = await enqueueReply(db, redis, {
        workspace: workspace ?? '',
        contact: contact ?? '',
        text: text ?? '',
        clientRef: client_ref ?? '',
        agent: null,
      });
      deps.kickOutbox?.();
      res.status(202).json({ ok: true, client_ref: doc.clientRef, status: doc.status });
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  router.post('/claim', async (req, res, next) => {
    try {
      const { workspace, contact, agent } = (req.body ?? {}) as {
        workspace?: string;
        contact?: string;
        agent?: string;
      };
      const db = await deps.getDb();
      const redis = deps.getRedis();
      const result = await claimConversation(db, redis, {
        workspace: workspace ?? '',
        contact: contact ?? '',
        agent: agent ?? '',
      });
      if (!result.ok) {
        res.status(409).json({ error: 'Conversation already claimed', assignee: result.holder });
        return;
      }
      res.status(200).json({ ok: true, assignee: result.assignee });
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  return router;
}
