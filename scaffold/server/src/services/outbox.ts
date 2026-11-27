import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { config } from '../config.js';
import { publishWorkspaceEvent } from './events.js';
import {
  COLLECTIONS,
  ensureIndexes,
  type OutboundMessageDoc,
} from '../store/schema.js';

const LEASE_DURATION_MS = 18_000;
const FETCH_TIMEOUT_MS = 14_000;
const POLL_INTERVAL_MS = 300;
const MAX_CONCURRENT_SENDS = 4;

// Shared per-workspace token bucket slightly under Pigeon's 8 capacity / 4 per sec.
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local refillPerMs = tonumber(ARGV[3])
local ttlMs = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'at')
local tokens = tonumber(data[1])
local at = tonumber(data[2])

if not tokens or not at then
  tokens = capacity
  at = now
else
  local elapsed = math.max(0, now - at)
  tokens = math.min(capacity, tokens + elapsed * refillPerMs)
  at = now
end

if tokens < 1 then
  redis.call('HMSET', key, 'tokens', tokens, 'at', at)
  redis.call('PEXPIRE', key, ttlMs)
  local waitMs = math.ceil((1 - tokens) / refillPerMs)
  return { 0, waitMs }
end

tokens = tokens - 1
redis.call('HMSET', key, 'tokens', tokens, 'at', at)
redis.call('PEXPIRE', key, ttlMs)
return { 1, 0 }
`;

export function coolOffKey(workspace: string): string {
  return `ratelimit:cooloff:${workspace}`;
}

export function outageKey(workspace: string): string {
  return `outage:cooloff:${workspace}`;
}

export function bucketKey(workspace: string): string {
  return `ratelimit:bucket:${workspace}`;
}

export interface OutboxDeps {
  getDb: () => Promise<Db>;
  getRedis: () => Redis | null;
  fetchImpl?: typeof fetch;
  pigeonUrl?: string;
  apiKeys?: Record<string, string>;
  workerId?: string;
}

export class OutboxWorker {
  private readonly workerId: string;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private pumping = false;
  private kickRequested = false;

  constructor(private readonly deps: OutboxDeps) {
    this.workerId = deps.workerId ?? `worker_${randomUUID()}`;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.pump();
    }, POLL_INTERVAL_MS);
    this.timer.unref();
    this.kick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  kick(): void {
    this.kickRequested = true;
    if (!this.pumping && this.running) {
      void this.pump();
    }
  }

  async pump(): Promise<void> {
    if (this.pumping) {
      this.kickRequested = true;
      return;
    }
    this.pumping = true;
    try {
      do {
        this.kickRequested = false;
        await this.drainBatch();
      } while (this.kickRequested && this.running);
    } catch (err) {
      console.error('Outbox pump error:', err);
    } finally {
      this.pumping = false;
    }
  }

  async drainBatch(): Promise<number> {
    const db = await this.deps.getDb();
    await ensureIndexes(db);

    const claimed: OutboundMessageDoc[] = [];
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + LEASE_DURATION_MS);

    for (let i = 0; i < MAX_CONCURRENT_SENDS; i++) {
      const doc = await db.collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages).findOneAndUpdate(
        {
          status: 'queued',
          nextRetryAt: { $lte: now },
          $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
        },
        {
          $set: {
            leaseOwner: this.workerId,
            leaseUntil,
            updatedAt: now,
          },
        },
        {
          sort: { nextRetryAt: 1, createdAt: 1 },
          returnDocument: 'after',
        }
      );
      if (!doc) break;
      claimed.push(doc);
    }

    if (claimed.length === 0) return 0;

    await Promise.all(claimed.map((msg) => this.processOne(db, msg)));
    return claimed.length;
  }

  private async releaseWithDelay(
    db: Db,
    msg: OutboundMessageDoc,
    delayMs: number,
    opts?: { incrementAttempts?: boolean; lastError?: string }
  ): Promise<void> {
    const now = new Date();
    const update: Record<string, unknown> = {
      $set: {
        leaseOwner: null,
        leaseUntil: null,
        nextRetryAt: new Date(now.getTime() + Math.max(50, delayMs)),
        updatedAt: now,
        ...(opts?.lastError !== undefined ? { lastError: opts.lastError } : {}),
      },
    };
    if (opts?.incrementAttempts) {
      update.$inc = { attempts: 1 };
    }
    await db
      .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
      .updateOne(
        { workspace: msg.workspace, clientRef: msg.clientRef, leaseOwner: this.workerId },
        update
      );
  }

  private async acquireSendPermit(redis: Redis | null, workspace: string): Promise<number> {
    if (!redis) return 0;

    const [coolTtl, outageTtl] = await Promise.all([
      redis.pttl(coolOffKey(workspace)),
      redis.pttl(outageKey(workspace)),
    ]);

    const blockMs = Math.max(coolTtl, outageTtl);
    if (blockMs > 0) return blockMs + 60;

    const res = (await redis.eval(
      TOKEN_BUCKET_LUA,
      1,
      bucketKey(workspace),
      String(Date.now()),
      '7',
      String(3.8 / 1000),
      '10000'
    )) as [number, number];

    if (Number(res[0]) === 1) return 0;
    return Math.max(100, Number(res[1]) || 250);
  }

  private async processOne(db: Db, msg: OutboundMessageDoc): Promise<void> {
    const redis = this.deps.getRedis();
    const apiKeys = this.deps.apiKeys ?? config.pigeon.apiKeys;
    const apiKey = apiKeys[msg.workspace];
    if (!apiKey) {
      await this.markFailed(db, redis, msg, `Unknown workspace API key: ${msg.workspace}`);
      return;
    }

    const waitMs = await this.acquireSendPermit(redis, msg.workspace);
    if (waitMs > 0) {
      await this.releaseWithDelay(db, msg, waitMs);
      return;
    }

    const pigeonUrl = (this.deps.pigeonUrl ?? config.pigeon.url).replace(/\/$/, '');
    const fetchFn = this.deps.fetchImpl ?? fetch;

    try {
      const res = await fetchFn(`${pigeonUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
          'idempotency-key': msg.clientRef,
        },
        body: JSON.stringify({
          to: msg.contact,
          text: msg.text,
          client_ref: msg.clientRef,
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (res.status === 200 || res.status === 201 || res.status === 202) {
        const body = (await res.json().catch(() => ({}))) as { id?: string };
        const pigeonId = typeof body.id === 'string' ? body.id : null;
        const now = new Date();

        // Only advance queued -> sent; a status webhook (e.g. delivered) may have
        // arrived already while Pigeon's 12s slow response was pending.
        const transitioned = await db
          .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
          .findOneAndUpdate(
            { workspace: msg.workspace, clientRef: msg.clientRef, status: 'queued' },
            {
              $set: {
                status: 'sent',
                ...(pigeonId ? { pigeonId } : {}),
                leaseOwner: null,
                leaseUntil: null,
                lastError: null,
                statusUpdatedAt: now,
                updatedAt: now,
              },
            },
            { returnDocument: 'after' }
          );

        if (transitioned) {
          await publishWorkspaceEvent(db, redis, msg.workspace, {
            type: 'message.status',
            contact: transitioned.contact,
            client_ref: transitioned.clientRef,
            status: 'sent',
            ...(pigeonId ? { message_id: pigeonId } : {}),
          });
        } else {
          await db.collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages).updateOne(
            { workspace: msg.workspace, clientRef: msg.clientRef },
            {
              $set: {
                ...(pigeonId ? { pigeonId } : {}),
                leaseOwner: null,
                leaseUntil: null,
                updatedAt: now,
              },
            }
          );
        }
        return;
      }

      if (res.status === 429) {
        const retryHeader = Number(res.headers.get('retry-after') ?? '2');
        const retrySeconds = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : 2;
        const coolMs = Math.ceil(retrySeconds * 1000) + 250;
        if (redis) {
          await redis.set(coolOffKey(msg.workspace), '1', 'PX', coolMs);
          await redis.del(bucketKey(msg.workspace));
        }
        await this.releaseWithDelay(db, msg, coolMs + 50, {
          incrementAttempts: true,
          lastError: `HTTP 429 Retry-After=${retrySeconds}s`,
        });
        return;
      }

      if (res.status >= 500) {
        const delayMs = Math.min(3000, 1000 * Math.pow(1.5, Math.min(msg.attempts, 4)));
        if (redis) {
          await redis.set(outageKey(msg.workspace), '1', 'PX', 1500);
        }
        await this.releaseWithDelay(db, msg, delayMs, {
          incrementAttempts: true,
          lastError: `HTTP ${res.status}`,
        });
        return;
      }

      // 4xx permanent failure (other than 429)
      const errText = await res.text().catch(() => '');
      await this.markFailed(db, redis, msg, `HTTP ${res.status}: ${errText.slice(0, 120)}`);
    } catch (err) {
      const delayMs = Math.min(2500, 600 + msg.attempts * 400);
      await this.releaseWithDelay(db, msg, delayMs, {
        incrementAttempts: true,
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async markFailed(
    db: Db,
    redis: Redis | null,
    msg: OutboundMessageDoc,
    reason: string
  ): Promise<void> {
    const now = new Date();
    const updated = await db
      .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
      .findOneAndUpdate(
        { workspace: msg.workspace, clientRef: msg.clientRef, status: 'queued' },
        {
          $set: {
            status: 'failed',
            leaseOwner: null,
            leaseUntil: null,
            lastError: reason,
            statusUpdatedAt: now,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' }
      );

    if (updated) {
      await publishWorkspaceEvent(db, redis, msg.workspace, {
        type: 'message.status',
        contact: updated.contact,
        client_ref: updated.clientRef,
        status: 'failed',
      });
    }
  }
}
