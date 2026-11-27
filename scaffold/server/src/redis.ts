import { Redis } from 'ioredis';
import { config } from './config.js';

let redis: Redis | undefined;

export function createRedisClient(): Redis {
  return new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });
}

// Connects on first use. Call from anywhere: const redis = getRedis();
export function getRedis(): Redis {
  if (!redis) redis = createRedisClient();
  return redis;
}
