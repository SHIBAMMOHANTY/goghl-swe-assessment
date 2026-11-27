import { Redis } from 'ioredis';
import { config } from './config.js';

let redis: Redis | undefined;

export function createRedisClient(): Redis {
  const client = new Redis(config.redisUrl, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
  });
  client.on('error', (err) => {
    console.error('[redis]', err.message);
  });
  return client;
}

// Connects on first use. Call from anywhere: const redis = getRedis();
export function getRedis(): Redis {
  if (!redis) redis = createRedisClient();
  return redis;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const pong = await getRedis().ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (!redis) return;
  const current = redis;
  redis = undefined;
  try {
    await current.quit();
  } catch {
    current.disconnect();
  }
}
