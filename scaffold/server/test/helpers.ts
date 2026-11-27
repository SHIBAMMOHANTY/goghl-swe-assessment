import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import type { Express } from 'express';
import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';

function clone<T>(val: T): T {
  if (val instanceof Date) return new Date(val.getTime()) as unknown as T;
  if (Array.isArray(val)) return val.map((v) => clone(v)) as unknown as T;
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) out[k] = clone(v);
    return out as T;
  }
  return val;
}

function cmpVal(a: unknown, b: unknown): number {
  const va = a instanceof Date ? a.getTime() : a;
  const vb = b instanceof Date ? b.getTime() : b;
  if (va === vb) return 0;
  if (va === null || va === undefined) return -1;
  if (vb === null || vb === undefined) return 1;
  return (va as number | string) < (vb as number | string) ? -1 : 1;
}

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    if (key === '$or') {
      const branches = cond as Array<Record<string, unknown>>;
      if (!branches.some((b) => matchesFilter(doc, b))) return false;
      continue;
    }
    const val = doc[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
      const ops = cond as Record<string, unknown>;
      if ('$in' in ops) {
        if (!(ops.$in as unknown[]).includes(val)) return false;
      }
      if ('$lt' in ops) {
        if (val === undefined || val === null || cmpVal(val, ops.$lt) >= 0) return false;
      }
      if ('$lte' in ops) {
        if (val === undefined || val === null || cmpVal(val, ops.$lte) > 0) return false;
      }
      if ('$gt' in ops) {
        if (val === undefined || val === null || cmpVal(val, ops.$gt) <= 0) return false;
      }
      continue;
    }
    if (cmpVal(val, cond) !== 0) return false;
  }
  return true;
}

function applyUpdate(
  doc: Record<string, unknown>,
  update: Record<string, unknown>,
  isInsert: boolean
): void {
  if (isInsert && update.$setOnInsert) {
    Object.assign(doc, clone(update.$setOnInsert as Record<string, unknown>));
  }
  if (update.$set) {
    Object.assign(doc, clone(update.$set as Record<string, unknown>));
  }
  if (update.$inc) {
    for (const [k, delta] of Object.entries(update.$inc as Record<string, number>)) {
      doc[k] = Number(doc[k] ?? 0) + delta;
    }
  }
  if (update.$max) {
    for (const [k, candidate] of Object.entries(update.$max as Record<string, unknown>)) {
      if (doc[k] === undefined || cmpVal(candidate, doc[k]) > 0) {
        doc[k] = clone(candidate);
      }
    }
  }
}

export function createInMemoryMongo() {
  const collections = new Map<string, Array<Record<string, unknown>>>();
  const uniqueIndexes = new Map<string, Array<Record<string, number>>>();

  const getRows = (name: string) => {
    let rows = collections.get(name);
    if (!rows) {
      rows = [];
      collections.set(name, rows);
    }
    return rows;
  };

  const checkUnique = (name: string, doc: Record<string, unknown>, excludeIdx = -1) => {
    const indexes = uniqueIndexes.get(name) ?? [];
    const rows = getRows(name);
    for (const keySpec of indexes) {
      const fields = Object.keys(keySpec);
      for (let i = 0; i < rows.length; i++) {
        if (i === excludeIdx) continue;
        if (fields.every((f) => cmpVal(rows[i][f], doc[f]) === 0)) {
          const err = new Error(`E11000 duplicate key on ${name}`);
          (err as { code?: number }).code = 11000;
          throw err;
        }
      }
    }
  };

  const db = {
    listCollections() {
      return {
        async toArray() {
          return Array.from(collections.keys()).map((name) => ({ name, type: 'collection' }));
        },
      };
    },
    collection(name: string) {
      return {
        async createIndexes(specs: Array<{ key: Record<string, number>; unique?: boolean }>) {
          getRows(name);
          const list = uniqueIndexes.get(name) ?? [];
          for (const s of specs) {
            if (s.unique) list.push(s.key);
          }
          uniqueIndexes.set(name, list);
        },
        async insertOne(doc: Record<string, unknown>) {
          const copy = clone(doc);
          checkUnique(name, copy);
          getRows(name).push(copy);
          return { acknowledged: true };
        },
        async findOne(filter: Record<string, unknown>) {
          const hit = getRows(name).find((d) => matchesFilter(d, filter));
          return hit ? clone(hit) : null;
        },
        async countDocuments(filter: Record<string, unknown> = {}) {
          return getRows(name).filter((d) => matchesFilter(d, filter)).length;
        },
        find(filter: Record<string, unknown>) {
          let results = getRows(name)
            .filter((d) => matchesFilter(d, filter))
            .map((d) => clone(d));
          return {
            sort(spec: Record<string, 1 | -1>) {
              const entries = Object.entries(spec);
              results.sort((a, b) => {
                for (const [k, dir] of entries) {
                  const c = cmpVal(a[k], b[k]);
                  if (c !== 0) return c * dir;
                }
                return 0;
              });
              return this;
            },
            limit(n: number) {
              results = results.slice(0, n);
              return this;
            },
            async toArray() {
              return results;
            },
          };
        },
        async updateOne(
          filter: Record<string, unknown>,
          update: Record<string, unknown>,
          opts?: { upsert?: boolean }
        ) {
          const rows = getRows(name);
          const idx = rows.findIndex((d) => matchesFilter(d, filter));
          if (idx >= 0) {
            const copy = clone(rows[idx]);
            applyUpdate(copy, update, false);
            checkUnique(name, copy, idx);
            rows[idx] = copy;
            return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
          }
          if (!opts?.upsert) {
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
          }
          const created: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(filter)) {
            if (!k.startsWith('$') && (typeof v !== 'object' || v instanceof Date)) {
              created[k] = clone(v);
            }
          }
          applyUpdate(created, update, true);
          checkUnique(name, created);
          rows.push(created);
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        },
        async findOneAndUpdate(
          filter: Record<string, unknown>,
          update: Record<string, unknown>,
          opts?: { upsert?: boolean; returnDocument?: 'before' | 'after'; sort?: Record<string, 1 | -1> }
        ) {
          const rows = getRows(name);
          let candidates = rows
            .map((doc, idx) => ({ doc, idx }))
            .filter(({ doc }) => matchesFilter(doc, filter));
          if (opts?.sort && candidates.length > 1) {
            const entries = Object.entries(opts.sort);
            candidates.sort((a, b) => {
              for (const [k, dir] of entries) {
                const c = cmpVal(a.doc[k], b.doc[k]);
                if (c !== 0) return c * dir;
              }
              return 0;
            });
          }
          if (candidates.length > 0) {
            const { idx } = candidates[0];
            const before = clone(rows[idx]);
            const after = clone(rows[idx]);
            applyUpdate(after, update, false);
            checkUnique(name, after, idx);
            rows[idx] = after;
            return opts?.returnDocument === 'before' ? before : clone(after);
          }
          if (!opts?.upsert) return null;
          const created: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(filter)) {
            if (!k.startsWith('$') && (typeof v !== 'object' || v instanceof Date)) {
              created[k] = clone(v);
            }
          }
          applyUpdate(created, update, true);
          checkUnique(name, created);
          rows.push(created);
          return opts?.returnDocument === 'before' ? null : clone(created);
        },
        async findOneAndDelete(filter: Record<string, unknown>) {
          const rows = getRows(name);
          const idx = rows.findIndex((d) => matchesFilter(d, filter));
          if (idx < 0) return null;
          const [removed] = rows.splice(idx, 1);
          return clone(removed);
        },
        async deleteOne(filter: Record<string, unknown>) {
          const rows = getRows(name);
          const idx = rows.findIndex((d) => matchesFilter(d, filter));
          if (idx < 0) return { deletedCount: 0 };
          rows.splice(idx, 1);
          return { deletedCount: 1 };
        },
        async deleteMany(filter: Record<string, unknown>) {
          const rows = getRows(name);
          const kept = rows.filter((d) => !matchesFilter(d, filter));
          const deletedCount = rows.length - kept.length;
          collections.set(name, kept);
          return { acknowledged: true, deletedCount };
        },
      };
    },
  } as unknown as Db;

  return { db, collections };
}

export function createInMemoryRedis() {
  const strings = new Map<string, { val: string; expAt: number | null }>();
  const hashes = new Map<string, { fields: Map<string, string>; expAt: number | null }>();
  const bus = new EventEmitter();

  const prune = (key: string) => {
    const s = strings.get(key);
    if (s && s.expAt !== null && s.expAt <= Date.now()) strings.delete(key);
    const h = hashes.get(key);
    if (h && h.expAt !== null && h.expAt <= Date.now()) hashes.delete(key);
  };

  const client = new EventEmitter() as unknown as Redis & EventEmitter;

  Object.assign(client, {
    async scan(cursor: string): Promise<[string, string[]]> {
      if (cursor !== '0') return ['0', []];
      for (const k of [...strings.keys(), ...hashes.keys()]) prune(k);
      return ['0', Array.from(new Set([...strings.keys(), ...hashes.keys()]))];
    },
    async del(...keys: string[]): Promise<number> {
      let n = 0;
      for (const k of keys) {
        if (strings.delete(k)) n++;
        if (hashes.delete(k)) n++;
      }
      return n;
    },
    async set(key: string, val: string, mode?: string, ms?: number) {
      const expAt = mode === 'PX' && typeof ms === 'number' ? Date.now() + ms : null;
      strings.set(key, { val, expAt });
      return 'OK';
    },
    async pttl(key: string): Promise<number> {
      prune(key);
      const s = strings.get(key);
      if (!s) return -2;
      if (s.expAt === null) return -1;
      return Math.max(0, s.expAt - Date.now());
    },
    async eval(
      _script: string,
      _numKeys: number,
      key: string,
      nowStr: string,
      capStr: string,
      refillStr: string,
      ttlStr: string
    ): Promise<[number, number]> {
      prune(key);
      const now = Number(nowStr);
      const capacity = Number(capStr);
      const refillPerMs = Number(refillStr);
      const ttlMs = Number(ttlStr);
      let entry = hashes.get(key);
      let tokens = capacity;
      let at = now;
      if (entry) {
        tokens = Number(entry.fields.get('tokens') ?? capacity);
        at = Number(entry.fields.get('at') ?? now);
        tokens = Math.min(capacity, tokens + Math.max(0, now - at) * refillPerMs);
        at = now;
      } else {
        entry = { fields: new Map(), expAt: Date.now() + ttlMs };
        hashes.set(key, entry);
      }
      entry.expAt = Date.now() + ttlMs;
      if (tokens < 1) {
        entry.fields.set('tokens', String(tokens));
        entry.fields.set('at', String(at));
        return [0, Math.ceil((1 - tokens) / refillPerMs)];
      }
      tokens -= 1;
      entry.fields.set('tokens', String(tokens));
      entry.fields.set('at', String(at));
      return [1, 0];
    },
    async publish(channel: string, message: string): Promise<number> {
      bus.emit(channel, message);
      return 1;
    },
    async subscribe(channel: string): Promise<number> {
      if (!bus.listeners(channel).some((fn) => (fn as { _owner?: unknown })._owner === client)) {
        const listener = (msg: string) => {
          client.emit('message', channel, msg);
        };
        (listener as { _owner?: unknown })._owner = client;
        bus.on(channel, listener);
      }
      return 1;
    },
    async unsubscribe(channel: string): Promise<number> {
      for (const fn of bus.listeners(channel)) {
        if ((fn as { _owner?: unknown })._owner === client) {
          bus.off(channel, fn as (...args: unknown[]) => void);
        }
      }
      return 1;
    },
    async quit(): Promise<'OK'> {
      return 'OK';
    },
  });

  return { redis: client, strings, hashes };
}

export async function invokeApp(
  app: Express,
  opts: { method: string; url: string; headers?: Record<string, string>; body?: string }
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; json: () => unknown; text: string }> {
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
  if (opts.body !== undefined) req.push(opts.body);
  req.push(null);

  await done;
  socket.destroy();

  const text = Buffer.concat(chunks).toString('utf8');
  return {
    status: res.statusCode,
    headers: res.getHeaders() as Record<string, string | string[] | undefined>,
    text,
    json: () => {
      assert.notEqual(text, '', `Expected JSON body for ${opts.method} ${opts.url}, got empty`);
      return JSON.parse(text);
    },
  };
}
