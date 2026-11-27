import { Router } from 'express';
import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { getDb } from '../db.js';
import { getRedis } from '../redis.js';
import { requireGraderToken } from '../middleware/graderAuth.js';

const SESSION_COLLECTIONS = new Set(['sessions']);
const SESSION_KEY_PREFIXES = ['session:', 'sess:'];
const REDIS_SCAN_COUNT = 500;

export interface GraderDeps {
  getDb: () => Promise<Db>;
  getRedis: () => Redis;
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

export async function clearRedisApplicationData(redis: Redis): Promise<void> {
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

  return router;
}
