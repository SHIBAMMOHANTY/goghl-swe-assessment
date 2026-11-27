import { createHash } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { createRedisClient } from '../redis.js';
import { getSessionFromCookieHeader, getWorkspaceRole } from '../services/auth.js';
import { wsEventChannel } from '../services/events.js';
import { COLLECTIONS, ensureIndexes, type EventDoc } from '../store/schema.js';

const WS_MAGIC_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function encodeWsFrame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function rejectUpgrade(socket: Duplex, statusCode: number, reason: string): void {
  socket.write(
    `HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`
  );
  socket.destroy();
}

function serializeEventDoc(doc: EventDoc): string {
  return JSON.stringify({
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
}

interface WsClient {
  workspace: string;
  lastSentSeq: number;
  ready: boolean;
  buffered: Array<{ seq: number; raw: string }>;
  sendText: (text: string) => void;
  close: () => void;
}

export interface WsHubDeps {
  getDb: () => Promise<Db>;
  createSubscriber?: () => Redis;
}

export class WorkspaceWsHub {
  private readonly clientsByWorkspace = new Map<string, Set<WsClient>>();
  private subscriber: Redis | null = null;
  private subscriberPromise: Promise<Redis> | null = null;

  constructor(private readonly deps: WsHubDeps = { getDb }) {}

  private async ensureSubscriber(): Promise<Redis | null> {
    if (this.subscriber) return this.subscriber;
    if (!this.subscriberPromise) {
      const createSub =
        this.deps.createSubscriber ?? (() => createRedisClient());
      this.subscriberPromise = (async () => {
        const sub = createSub();
        sub.on('message', (channel, message) => {
          const prefix = 'ws:events:';
          if (!channel.startsWith(prefix)) return;
          const ws = channel.slice(prefix.length);
          this.dispatchLive(ws, message);
        });
        this.subscriber = sub;
        return sub;
      })();
    }
    return this.subscriberPromise;
  }

  private dispatchLive(workspace: string, raw: string): void {
    const set = this.clientsByWorkspace.get(workspace);
    if (!set || set.size === 0) return;

    let seq = 0;
    try {
      const parsed = JSON.parse(raw) as { seq?: number };
      if (typeof parsed.seq === 'number') seq = parsed.seq;
    } catch {
      return;
    }

    for (const client of set) {
      if (!client.ready) {
        client.buffered.push({ seq, raw });
        continue;
      }
      if (seq > client.lastSentSeq) {
        client.lastSentSeq = seq;
        client.sendText(raw);
      }
    }
  }

  async handleUpgrade(req: IncomingMessage, socket: Duplex): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/ws') {
        rejectUpgrade(socket, 404, 'Not Found');
        return;
      }

      const wsKey = req.headers['sec-websocket-key'];
      const upgradeHeader = String(req.headers.upgrade ?? '').toLowerCase();
      if (typeof wsKey !== 'string' || !wsKey || upgradeHeader !== 'websocket') {
        rejectUpgrade(socket, 400, 'Bad Request');
        return;
      }

      const workspace = url.searchParams.get('workspace') ?? '';
      if (!workspace) {
        rejectUpgrade(socket, 400, 'Bad Request');
        return;
      }

      const db = await this.deps.getDb();
      const session = await getSessionFromCookieHeader(db, req.headers.cookie);
      if (!session) {
        rejectUpgrade(socket, 401, 'Unauthorized');
        return;
      }

      if (!getWorkspaceRole(session, workspace)) {
        rejectUpgrade(socket, 403, 'Forbidden');
        return;
      }

      const afterParam = url.searchParams.get('after');
      const afterSeq = afterParam !== null ? Number(afterParam) : null;
      if (afterParam !== null && (!Number.isFinite(afterSeq) || afterSeq! < 0)) {
        rejectUpgrade(socket, 400, 'Bad Request');
        return;
      }

      const accept = createHash('sha1').update(`${wsKey}${WS_MAGIC_GUID}`).digest('base64');
      socket.write(
        [
          'HTTP/1.1 101 Switching Protocols',
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Accept: ${accept}`,
          '',
          '',
        ].join('\r\n')
      );

      let closed = false;
      const sendFrame = (opcode: number, payload: Buffer) => {
        if (closed || socket.destroyed) return;
        try {
          socket.write(encodeWsFrame(opcode, payload));
        } catch {
          closed = true;
          socket.destroy();
        }
      };

      const client: WsClient = {
        workspace,
        lastSentSeq: afterSeq !== null ? afterSeq : 0,
        ready: false,
        buffered: [],
        sendText: (text: string) => sendFrame(0x1, Buffer.from(text, 'utf8')),
        close: () => {
          if (closed) return;
          closed = true;
          sendFrame(0x8, Buffer.alloc(0));
          socket.end();
        },
      };

      let set = this.clientsByWorkspace.get(workspace);
      if (!set) {
        set = new Set();
        this.clientsByWorkspace.set(workspace, set);
      }
      set.add(client);

      const cleanup = () => {
        closed = true;
        const wsSet = this.clientsByWorkspace.get(workspace);
        if (wsSet) {
          wsSet.delete(client);
          if (wsSet.size === 0) {
            this.clientsByWorkspace.delete(workspace);
            void this.subscriber?.unsubscribe(wsEventChannel(workspace)).catch(() => {});
          }
        }
      };

      socket.on('close', cleanup);
      socket.on('error', cleanup);

      // Minimal incoming frame parser for ping/pong/close
      let rxBuf = Buffer.alloc(0);
      socket.on('data', (chunk: Buffer) => {
        rxBuf = Buffer.concat([rxBuf, chunk]);
        while (rxBuf.length >= 2) {
          const byte1 = rxBuf[0];
          const byte2 = rxBuf[1];
          const opcode = byte1 & 0x0f;
          const masked = (byte2 & 0x80) !== 0;
          let len = byte2 & 0x7f;
          let offset = 2;

          if (len === 126) {
            if (rxBuf.length < 4) return;
            len = rxBuf.readUInt16BE(2);
            offset = 4;
          } else if (len === 127) {
            if (rxBuf.length < 10) return;
            const bigLen = rxBuf.readBigUInt64BE(2);
            if (bigLen > BigInt(1024 * 1024)) {
              client.close();
              return;
            }
            len = Number(bigLen);
            offset = 10;
          }

          const maskLen = masked ? 4 : 0;
          if (rxBuf.length < offset + maskLen + len) return;

          const payload = Buffer.alloc(len);
          if (masked) {
            const mask = rxBuf.subarray(offset, offset + 4);
            const dataStart = offset + 4;
            for (let i = 0; i < len; i++) {
              payload[i] = rxBuf[dataStart + i] ^ mask[i % 4];
            }
          } else {
            rxBuf.copy(payload, 0, offset, offset + len);
          }
          rxBuf = rxBuf.subarray(offset + maskLen + len);

          if (opcode === 0x8) {
            client.close();
            return;
          }
          if (opcode === 0x9) {
            sendFrame(0xA, payload); // Pong
          }
        }
      });

      // Subscribe BEFORE querying replay events so nothing in the gap is missed.
      const sub = await this.ensureSubscriber();
      if (sub) {
        await sub.subscribe(wsEventChannel(workspace));
      }

      if (afterSeq !== null) {
        await ensureIndexes(db);
        const missed = await db
          .collection<EventDoc>(COLLECTIONS.events)
          .find({ workspace, seq: { $gt: afterSeq } })
          .sort({ seq: 1 })
          .toArray();

        for (const ev of missed) {
          if (closed) return;
          if (ev.seq > client.lastSentSeq) {
            client.lastSentSeq = ev.seq;
            client.sendText(serializeEventDoc(ev));
          }
        }
      }

      // Flush any live events buffered during subscription/replay in seq order.
      client.buffered.sort((a, b) => a.seq - b.seq);
      for (const item of client.buffered) {
        if (closed) return;
        if (item.seq > client.lastSentSeq) {
          client.lastSentSeq = item.seq;
          client.sendText(item.raw);
        }
      }
      client.buffered.length = 0;
      client.ready = true;
    } catch (err) {
      console.error('WebSocket upgrade error:', err);
      if (!socket.destroyed) {
        rejectUpgrade(socket, 500, 'Internal Server Error');
      }
    }
  }

  attach(server: Server): void {
    server.on('upgrade', (req, socket) => {
      void this.handleUpgrade(req, socket);
    });
  }

  async close(): Promise<void> {
    for (const set of this.clientsByWorkspace.values()) {
      for (const client of set) {
        client.close();
      }
    }
    this.clientsByWorkspace.clear();
    if (this.subscriber) {
      await this.subscriber.quit().catch(() => {});
      this.subscriber = null;
      this.subscriberPromise = null;
    }
  }
}

export { config };
