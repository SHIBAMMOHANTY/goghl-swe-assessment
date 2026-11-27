import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterEach, describe, it } from 'node:test';
import type { Express } from 'express';
import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { createApp } from '../src/app.js';

interface FakeMongoCollectionMeta {
  name: string;
  type?: string;
}

function createFakeMongo(initial: Record<string, Record<string, unknown>[]>, views: string[] = []) {
  const store = new Map<string, Record<string, unknown>[]>(
    Object.entries(initial).map(([name, docs]) => [name, [...docs]])
  );
  const viewSet = new Set(views);

  const db = {
    listCollections() {
      const items: FakeMongoCollectionMeta[] = [
        { name: 'system.indexes', type: 'collection' },
        ...Array.from(store.keys()).map((name) => ({ name, type: 'collection' })),
        ...Array.from(viewSet).map((name) => ({ name, type: 'view' })),
      ];
      return {
        async toArray() {
          return items;
        },
      };
    },
    collection(name: string) {
      return {
        async deleteMany(filter: Record<string, unknown>) {
          assert.deepEqual(filter, {});
          if (!store.has(name)) {
            throw new Error(`Unexpected deleteMany on non-collection ${name}`);
          }
          const count = store.get(name)!.length;
          store.set(name, []);
          return { acknowledged: true, deletedCount: count };
        },
      };
    },
  } as unknown as Db;

  return { db, store };
}

function createFakeRedis(initial: Record<string, string>, pageSize = 2) {
  const keys = new Map<string, string>(Object.entries(initial));
  const scanPages: string[][] = [];

  const redis = {
    async scan(cursor: string, ..._args: unknown[]): Promise<[string, string[]]> {
      if (cursor === '0') {
        const all = Array.from(keys.keys());
        scanPages.length = 0;
        for (let i = 0; i < all.length; i += pageSize) {
          scanPages.push(all.slice(i, i + pageSize));
        }
        if (scanPages.length === 0) return ['0', []];
      }
      const idx = Number(cursor);
      const batch = scanPages[idx] ?? [];
      const next = idx + 1 < scanPages.length ? String(idx + 1) : '0';
      return [next, batch];
    },
    async del(...toDelete: string[]): Promise<number> {
      let deleted = 0;
      for (const k of toDelete) {
        if (keys.delete(k)) deleted++;
      }
      return deleted;
    },
  } as unknown as Redis;

  return { redis, keys };
}

async function invokeApp(
  app: Express,
  opts: { method: string; url: string; headers?: Record<string, string>; body?: string }
): Promise<{ status: number; json: () => unknown; text: string }> {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = opts.method;
  req.url = opts.url;

  const normalizedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.headers ?? {})) {
    normalizedHeaders[k.toLowerCase()] = v;
  }
  if (opts.body !== undefined) {
    normalizedHeaders['content-length'] = String(Buffer.byteLength(opts.body));
  }
  req.headers = normalizedHeaders;

  const res = new ServerResponse(req);
  const chunks: Buffer[] = [];

  const origWrite = res.write.bind(res);
  res.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    return (origWrite as (...args: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof res.write;

  const done = new Promise<void>((resolve) => {
    const origEnd = res.end.bind(res);
    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      if (chunk && typeof chunk !== 'function') {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      const out = (origEnd as (...args: unknown[]) => ServerResponse)(chunk, ...rest);
      resolve();
      return out;
    }) as typeof res.end;
  });

  app(req, res);
  if (opts.body !== undefined) {
    req.push(opts.body);
  }
  req.push(null);

  await done;
  socket.destroy();

  const text = Buffer.concat(chunks).toString('utf8');
  return {
    status: res.statusCode,
    text,
    json: () => JSON.parse(text),
  };
}

describe('POST /__grader/reset', () => {
  const originalToken = process.env.GRADER_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.GRADER_TOKEN;
    } else {
      process.env.GRADER_TOKEN = originalToken;
    }
  });

  it('returns 401 when x-grader-token is missing or incorrect without modifying stores', async () => {
    process.env.GRADER_TOKEN = 'secret-test-token';
    const { db, store } = createFakeMongo({
      conversations: [{ _id: '1' }],
      sessions: [{ _id: 's1' }],
    });
    const { redis, keys } = createFakeRedis({
      'ws_acme:seq': '42',
      'session:u_ben': 'active',
    });

    const app = createApp({
      grader: { getDb: async () => db, getRedis: () => redis },
    });

    for (const headers of [
      {},
      { 'x-grader-token': 'wrong' },
      { 'x-grader-token': 'secret-test-tokeX' },
    ]) {
      const res = await invokeApp(app, {
        method: 'POST',
        url: '/__grader/reset',
        headers,
      });
      assert.equal(res.status, 401);
    }

    assert.equal(store.get('conversations')!.length, 1);
    assert.equal(store.get('sessions')!.length, 1);
    assert.equal(keys.get('ws_acme:seq'), '42');
    assert.equal(keys.get('session:u_ben'), 'active');
  });

  it('returns 200 and clears application data in MongoDB and Redis while preserving login sessions', async () => {
    process.env.GRADER_TOKEN = 'secret-test-token';
    const { db, store } = createFakeMongo(
      {
        conversations: [{ _id: 'c1' }, { _id: 'c2' }],
        messages: [{ _id: 'm1' }],
        outbound: [{ _id: 'o1' }],
        sessions: [{ _id: 'sess_ben', sub: 'u_ben' }],
      },
      ['inbox_summary_view']
    );
    const { redis, keys } = createFakeRedis(
      {
        'ws_acme:seq': '12',
        'ws_globex:ratelimit': '1',
        'ws_acme:events': 'stream',
        'lock:claim:1': 'holder',
        'session:u_ben': '{"sub":"u_ben"}',
        'sess:u_asha': '{"sub":"u_asha"}',
      },
      2
    );

    const app = createApp({
      grader: { getDb: async () => db, getRedis: () => redis },
    });

    const res = await invokeApp(app, {
      method: 'POST',
      url: '/__grader/reset',
      headers: {
        'content-type': 'application/json',
        'x-grader-token': 'secret-test-token',
      },
      body: '{}',
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.json(), { ok: true });

    assert.deepEqual(store.get('conversations'), []);
    assert.deepEqual(store.get('messages'), []);
    assert.deepEqual(store.get('outbound'), []);
    assert.deepEqual(store.get('sessions'), [{ _id: 'sess_ben', sub: 'u_ben' }]);

    assert.equal(keys.has('ws_acme:seq'), false);
    assert.equal(keys.has('ws_globex:ratelimit'), false);
    assert.equal(keys.has('ws_acme:events'), false);
    assert.equal(keys.has('lock:claim:1'), false);
    assert.equal(keys.get('session:u_ben'), '{"sub":"u_ben"}');
    assert.equal(keys.get('sess:u_asha'), '{"sub":"u_asha"}');
  });

  it('returns 500 if clearing a store fails', async () => {
    process.env.GRADER_TOKEN = 'secret-test-token';
    const failingDb = {
      listCollections() {
        return {
          async toArray() {
            throw new Error('Mongo unavailable');
          },
        };
      },
    } as unknown as Db;
    const { redis } = createFakeRedis({});

    const app = createApp({
      grader: { getDb: async () => failingDb, getRedis: () => redis },
    });

    const res = await invokeApp(app, {
      method: 'POST',
      url: '/__grader/reset',
      headers: { 'x-grader-token': 'secret-test-token' },
    });
    assert.equal(res.status, 500);
  });

  it('uses config fallback grader-dev-token when GRADER_TOKEN env var is unset', async () => {
    delete process.env.GRADER_TOKEN;
    const { db } = createFakeMongo({});
    const { redis } = createFakeRedis({});
    const app = createApp({
      grader: { getDb: async () => db, getRedis: () => redis },
    });

    const badRes = await invokeApp(app, {
      method: 'POST',
      url: '/__grader/reset',
      headers: { 'x-grader-token': 'wrong-token' },
    });
    assert.equal(badRes.status, 401);

    const okRes = await invokeApp(app, {
      method: 'POST',
      url: '/__grader/reset',
      headers: { 'x-grader-token': 'grader-dev-token' },
    });
    assert.equal(okRes.status, 200);
  });

  it('reports /healthz 200 when dependencies are ready and 503 when unavailable', async () => {
    const readyApp = createApp({
      healthCheck: async () => ({ ok: true, mongo: true, redis: true }),
    });
    const okRes = await invokeApp(readyApp, { method: 'GET', url: '/healthz' });
    assert.equal(okRes.status, 200);
    assert.deepEqual(okRes.json(), { ok: true, mongo: true, redis: true });

    const degradedApp = createApp({
      healthCheck: async () => ({ ok: false, mongo: false, redis: true }),
    });
    const badRes = await invokeApp(degradedApp, { method: 'GET', url: '/healthz' });
    assert.equal(badRes.status, 503);
    assert.deepEqual(badRes.json(), { ok: false, mongo: false, redis: true });
  });
});
