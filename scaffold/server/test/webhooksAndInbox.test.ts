import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { createPkcePair, createSession, verifyIdToken } from '../src/services/auth.js';
import { OutboxWorker } from '../src/services/outbox.js';
import { COLLECTIONS, type OutboundMessageDoc } from '../src/store/schema.js';
import { WorkspaceWsHub } from '../src/ws/server.js';
import { createInMemoryMongo, createInMemoryRedis, invokeApp } from './helpers.js';

function signWebhook(body: string, secret = config.pigeon.webhookSecret, t?: number): string {
  const ts = t ?? Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  return `t=${ts},v1=${v1}`;
}

describe('Pigeon webhooks, inbox, outbox, auth, and WebSockets', () => {
  it('enforces PIGEON.md webhook rules: forged/stale -> 401, bad json -> 400, unknown ws/type -> 200, dedupe + ordering', async () => {
    const { db } = createInMemoryMongo();
    const { redis } = createInMemoryRedis();
    const app = createApp({
      webhooks: { getDb: async () => db, getRedis: () => redis },
      grader: { getDb: async () => db, getRedis: () => redis },
    });

    const validInbound = JSON.stringify({
      id: 'evt_1',
      type: 'message.inbound',
      workspace: 'ws_acme',
      occurred_at: '2026-11-27T10:00:02.000Z',
      data: { message_id: 'pmsg_002', from: '+14155550101', text: 'Second' },
    });

    // Missing / bad signature -> 401
    assert.equal(
      (
        await invokeApp(app, {
          method: 'POST',
          url: '/webhooks/pigeon',
          headers: { 'content-type': 'application/json' },
          body: validInbound,
        })
      ).status,
      401
    );
    assert.equal(
      (
        await invokeApp(app, {
          method: 'POST',
          url: '/webhooks/pigeon',
          headers: {
            'content-type': 'application/json',
            'x-pigeon-signature': signWebhook(validInbound, 'wrong_secret'),
          },
          body: validInbound,
        })
      ).status,
      401
    );

    // Stale timestamp (> 5 min old) -> 401
    const staleTs = Math.floor(Date.now() / 1000) - 3600;
    assert.equal(
      (
        await invokeApp(app, {
          method: 'POST',
          url: '/webhooks/pigeon',
          headers: {
            'content-type': 'application/json',
            'x-pigeon-signature': signWebhook(validInbound, config.pigeon.webhookSecret, staleTs),
          },
          body: validInbound,
        })
      ).status,
      401
    );

    // Valid signature, unparseable JSON -> 400
    const badJson = '{not-json';
    assert.equal(
      (
        await invokeApp(app, {
          method: 'POST',
          url: '/webhooks/pigeon',
          headers: {
            'content-type': 'application/json',
            'x-pigeon-signature': signWebhook(badJson),
          },
          body: badJson,
        })
      ).status,
      400
    );

    // Unknown workspace & unknown event type -> 200 ignored
    for (const payload of [
      { id: 'evt_u1', type: 'message.inbound', workspace: 'ws_unknown', data: {} },
      { id: 'evt_u2', type: 'contact.merged', workspace: 'ws_acme', data: {} },
      {
        id: 'evt_u3',
        type: 'message.status',
        workspace: 'ws_acme',
        data: { client_ref: 'never_sent', status: 'delivered' },
      },
    ]) {
      const raw = JSON.stringify(payload);
      const res = await invokeApp(app, {
        method: 'POST',
        url: '/webhooks/pigeon',
        headers: {
          'content-type': 'application/json',
          'x-pigeon-signature': signWebhook(raw),
        },
        body: raw,
      });
      assert.equal(res.status, 200);
    }

    // Out-of-order + duplicate delivery of inbound messages
    const earlierInbound = JSON.stringify({
      id: 'evt_0',
      type: 'message.inbound',
      workspace: 'ws_acme',
      occurred_at: '2026-11-27T10:00:01.000Z',
      data: { message_id: 'pmsg_001', from: '+14155550101', text: 'First' },
    });

    for (const raw of [validInbound, validInbound, earlierInbound]) {
      const res = await invokeApp(app, {
        method: 'POST',
        url: '/webhooks/pigeon',
        headers: {
          'content-type': 'application/json',
          'x-pigeon-signature': signWebhook(raw),
        },
        body: raw,
      });
      assert.equal(res.status, 200);
    }

    const snapRes = await invokeApp(app, {
      method: 'GET',
      url: '/__grader/snapshot',
      headers: { 'x-grader-token': config.graderToken },
    });
    assert.equal(snapRes.status, 200);
    const snap = snapRes.json() as {
      workspaces: { ws_acme: { contacts: Record<string, { inbound: string[]; assignee: string | null }> } };
    };
    assert.deepEqual(snap.workspaces.ws_acme.contacts['+14155550101'].inbound, [
      'pmsg_001',
      'pmsg_002',
    ]);
  });

  it('enforces atomic 6-way claim, idempotent replies, and out-of-order status monotonicity', async () => {
    const { db } = createInMemoryMongo();
    const { redis } = createInMemoryRedis();
    const app = createApp({
      webhooks: { getDb: async () => db, getRedis: () => redis },
      grader: { getDb: async () => db, getRedis: () => redis },
    });

    // 6-way concurrent claim race on a contact that has not written yet
    const claims = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        invokeApp(app, {
          method: 'POST',
          url: '/__grader/claim',
          headers: {
            'content-type': 'application/json',
            'x-grader-token': config.graderToken,
          },
          body: JSON.stringify({
            workspace: 'ws_globex',
            contact: '+442079460201',
            agent: `agent_${i + 1}`,
          }),
        })
      )
    );
    const winners = claims.filter((r) => r.status === 200);
    const conflicts = claims.filter((r) => r.status === 409);
    assert.equal(winners.length, 1);
    assert.equal(conflicts.length, 5);

    const winnerAgent = (winners[0].json() as { assignee: string }).assignee;
    const reclaim = await invokeApp(app, {
      method: 'POST',
      url: '/__grader/claim',
      headers: {
        'content-type': 'application/json',
        'x-grader-token': config.graderToken,
      },
      body: JSON.stringify({
        workspace: 'ws_globex',
        contact: '+442079460201',
        agent: winnerAgent,
      }),
    });
    assert.equal(reclaim.status, 200);

    // Unknown workspace on reply -> 404
    const badWs = await invokeApp(app, {
      method: 'POST',
      url: '/__grader/reply',
      headers: {
        'content-type': 'application/json',
        'x-grader-token': config.graderToken,
      },
      body: JSON.stringify({
        workspace: 'ws_nope',
        contact: '+442079460201',
        text: 'hello',
        client_ref: 'ref_bad',
      }),
    });
    assert.equal(badWs.status, 404);

    // Concurrent duplicate client_ref -> both 202, one record
    const [r1, r2] = await Promise.all([
      invokeApp(app, {
        method: 'POST',
        url: '/__grader/reply',
        headers: {
          'content-type': 'application/json',
          'x-grader-token': config.graderToken,
        },
        body: JSON.stringify({
          workspace: 'ws_globex',
          contact: '+442079460201',
          text: 'Hello once',
          client_ref: 'ref_dup_1',
        }),
      }),
      invokeApp(app, {
        method: 'POST',
        url: '/__grader/reply',
        headers: {
          'content-type': 'application/json',
          'x-grader-token': config.graderToken,
        },
        body: JSON.stringify({
          workspace: 'ws_globex',
          contact: '+442079460201',
          text: 'Hello once',
          client_ref: 'ref_dup_1',
        }),
      }),
    ]);
    assert.equal(r1.status, 202);
    assert.equal(r2.status, 202);

    // Out-of-order status webhooks: delivered arrives before sent
    for (const status of ['delivered', 'sent']) {
      const raw = JSON.stringify({
        id: `evt_${status}`,
        type: 'message.status',
        workspace: 'ws_globex',
        occurred_at: new Date().toISOString(),
        data: { message_id: 'pm_1', client_ref: 'ref_dup_1', status },
      });
      const wres = await invokeApp(app, {
        method: 'POST',
        url: '/webhooks/pigeon',
        headers: {
          'content-type': 'application/json',
          'x-pigeon-signature': signWebhook(raw),
        },
        body: raw,
      });
      assert.equal(wres.status, 200);
    }

    const snap = (
      await invokeApp(app, {
        method: 'GET',
        url: '/__grader/snapshot',
        headers: { 'x-grader-token': config.graderToken },
      })
    ).json() as { workspaces: { ws_globex: { outbound: Record<string, string> } } };
    assert.equal(snap.workspaces.ws_globex.outbound.ref_dup_1, 'delivered');
  });

  it('handles outbox Retry-After, 503 outage recovery, lease failover, and slow 200 without status regression', async () => {
    const { db } = createInMemoryMongo();
    const { redis } = createInMemoryRedis();
    const app = createApp({
      grader: { getDb: async () => db, getRedis: () => redis },
    });

    await invokeApp(app, {
      method: 'POST',
      url: '/__grader/reply',
      headers: { 'content-type': 'application/json', 'x-grader-token': config.graderToken },
      body: JSON.stringify({
        workspace: 'ws_acme',
        contact: '+14155550101',
        text: 'msg 1',
        client_ref: 'outbox_1',
      }),
    });

    let callCount = 0;
    const seenKeys: string[] = [];
    const mockFetch: typeof fetch = async (_url, init) => {
      callCount++;
      const headers = init?.headers as Record<string, string>;
      seenKeys.push(headers['idempotency-key']);
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: 'rate limited' }), {
          status: 429,
          headers: { 'retry-after': '1' },
        });
      }
      if (callCount === 2) {
        return new Response(JSON.stringify({ error: 'outage' }), { status: 503 });
      }
      // Simulate delivered webhook arriving before slow HTTP 200 completes
      await db
        .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
        .updateOne(
          { workspace: 'ws_acme', clientRef: 'outbox_1' },
          { $set: { status: 'delivered', updatedAt: new Date() } }
        );
      return new Response(JSON.stringify({ id: 'pm_outbox_1', status: 'accepted' }), {
        status: 200,
      });
    };

    const worker = new OutboxWorker({
      getDb: async () => db,
      getRedis: () => redis,
      fetchImpl: mockFetch,
    });

    // Attempt 1 -> 429 Retry-After=1s
    await worker.drainBatch();
    assert.equal(callCount, 1);

    // Immediate retry must NOT hit Pigeon while cool-off is active
    await db
      .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
      .updateOne(
        { workspace: 'ws_acme', clientRef: 'outbox_1' },
        { $set: { nextRetryAt: new Date(Date.now() - 1000) } }
      );
    await worker.drainBatch();
    assert.equal(callCount, 1);

    // Expire cool-off -> Attempt 2 hits 503
    await redis.del('ratelimit:cooloff:ws_acme');
    await db
      .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
      .updateOne(
        { workspace: 'ws_acme', clientRef: 'outbox_1' },
        { $set: { nextRetryAt: new Date(Date.now() - 1000) } }
      );
    await worker.drainBatch();
    assert.equal(callCount, 2);

    // Expire outage cool-off -> Attempt 3 gets slow 200 after delivered webhook
    await redis.del('outage:cooloff:ws_acme');
    await db
      .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
      .updateOne(
        { workspace: 'ws_acme', clientRef: 'outbox_1' },
        { $set: { nextRetryAt: new Date(Date.now() - 1000) } }
      );
    await worker.drainBatch();
    assert.equal(callCount, 3);
    assert.deepEqual(seenKeys, ['outbox_1', 'outbox_1', 'outbox_1']);

    const doc = await db
      .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
      .findOne({ workspace: 'ws_acme', clientRef: 'outbox_1' });
    assert.equal(doc?.status, 'delivered');
    assert.equal(doc?.pigeonId, 'pm_outbox_1');
  });

  it('verifies OIDC RS256 ID tokens, API tenant isolation, and WebSocket auth + replay', async () => {
    const { db } = createInMemoryMongo();
    const { redis } = createInMemoryRedis();

    // Verify PKCE + RS256 ID token helper
    const pkce = createPkcePair();
    assert.ok(pkce.verifier.length >= 32 && pkce.challenge.length >= 32);

    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: 'k1', use: 'sig', alg: 'RS256' });
    const head = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'k1' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const body = Buffer.from(
      JSON.stringify({
        iss: 'http://localhost:4020',
        aud: 'switchboard-web',
        sub: 'u_ben',
        nonce: 'n_123',
        iat: now,
        exp: now + 3600,
        workspaces: [{ id: 'ws_acme', role: 'agent' }],
      })
    ).toString('base64url');
    const sig = cryptoSign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url');
    const claims = await verifyIdToken(`${head}.${body}.${sig}`, {
      jwksUri: 'http://localhost:4020/jwks',
      issuer: 'http://localhost:4020',
      clientId: 'switchboard-web',
      nonce: 'n_123',
      fetchImpl: async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }),
    });
    assert.equal(claims.sub, 'u_ben');

    // API tenant isolation
    const session = await createSession(db, {
      sub: 'u_ben',
      name: 'Ben Ortiz',
      email: 'ben@acme.test',
      workspaces: [{ id: 'ws_acme', role: 'agent' }],
    });
    const app = createApp({
      api: { getDb: async () => db, getRedis: () => redis },
      webhooks: { getDb: async () => db, getRedis: () => redis },
    });

    assert.equal((await invokeApp(app, { method: 'GET', url: '/api/me' })).status, 401);
    const meRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/me',
      headers: { cookie: `sb_session=${session._id}` },
    });
    assert.equal(meRes.status, 200);
    assert.equal((meRes.json() as { sub: string }).sub, 'u_ben');

    assert.equal(
      (
        await invokeApp(app, {
          method: 'GET',
          url: '/api/conversations?workspace=ws_acme',
          headers: { cookie: `sb_session=${session._id}` },
        })
      ).status,
      200
    );
    assert.equal(
      (
        await invokeApp(app, {
          method: 'GET',
          url: '/api/conversations?workspace=ws_globex',
          headers: { cookie: `sb_session=${session._id}` },
        })
      ).status,
      403
    );

    // WebSocket upgrade auth + after=<seq> replay
    const raw1 = JSON.stringify({
      id: 'evt_w1',
      type: 'message.inbound',
      workspace: 'ws_acme',
      occurred_at: '2026-11-27T10:00:00.000Z',
      data: { message_id: 'pmsg_w1', from: '+14155550101', text: 'one' },
    });
    const raw2 = JSON.stringify({
      id: 'evt_w2',
      type: 'message.inbound',
      workspace: 'ws_acme',
      occurred_at: '2026-11-27T10:00:05.000Z',
      data: { message_id: 'pmsg_w2', from: '+14155550101', text: 'two' },
    });
    for (const r of [raw1, raw2]) {
      await invokeApp(app, {
        method: 'POST',
        url: '/webhooks/pigeon',
        headers: { 'content-type': 'application/json', 'x-pigeon-signature': signWebhook(r) },
        body: r,
      });
    }

    const hub = new WorkspaceWsHub({
      getDb: async () => db,
      createSubscriber: () => createInMemoryRedis().redis,
    });

    const makeFakeSocket = () => {
      const sock = new EventEmitter() as EventEmitter & {
        writes: Buffer[];
        destroyed: boolean;
        write: (d: string | Buffer) => boolean;
        destroy: () => void;
        end: () => void;
      };
      sock.writes = [];
      sock.destroyed = false;
      sock.write = (d: string | Buffer) => {
        sock.writes.push(Buffer.isBuffer(d) ? d : Buffer.from(d));
        return true;
      };
      sock.destroy = () => {
        sock.destroyed = true;
      };
      sock.end = () => {
        sock.destroyed = true;
      };
      return sock;
    };

    // Unauthenticated -> 401
    const anonSock = makeFakeSocket();
    await hub.handleUpgrade(
      {
        url: '/ws?workspace=ws_acme',
        headers: { host: 'localhost:4000', upgrade: 'websocket', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' },
      } as IncomingMessage,
      anonSock as never
    );
    assert.ok(Buffer.concat(anonSock.writes).toString('utf8').startsWith('HTTP/1.1 401'));

    // Wrong workspace -> 403
    const forbiddenSock = makeFakeSocket();
    await hub.handleUpgrade(
      {
        url: '/ws?workspace=ws_globex',
        headers: {
          host: 'localhost:4000',
          upgrade: 'websocket',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          cookie: `sb_session=${session._id}`,
        },
      } as IncomingMessage,
      forbiddenSock as never
    );
    assert.ok(Buffer.concat(forbiddenSock.writes).toString('utf8').startsWith('HTTP/1.1 403'));

    // Authorized with after=1 -> 101 + replayed seq=2 frame
    const okSock = makeFakeSocket();
    await hub.handleUpgrade(
      {
        url: '/ws?workspace=ws_acme&after=1',
        headers: {
          host: 'localhost:4000',
          upgrade: 'websocket',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          cookie: `sb_session=${session._id}`,
        },
      } as IncomingMessage,
      okSock as never
    );
    const outText = Buffer.concat(okSock.writes).toString('utf8');
    assert.ok(outText.startsWith('HTTP/1.1 101'));
    assert.ok(outText.includes('"seq":2'));
    assert.ok(outText.includes('pmsg_w2'));
    assert.ok(!outText.includes('pmsg_w1'));
    await hub.close();
  });

  it('supports UI conversation actions (claim, release, close, reopen, reply, notes) and outbox lease failover', async () => {
    const { db } = createInMemoryMongo();
    const { redis } = createInMemoryRedis();

    const benSession = await createSession(db, {
      sub: 'u_ben',
      name: 'Ben Ortiz',
      email: 'ben@acme.test',
      workspaces: [{ id: 'ws_acme', role: 'agent' }],
    });
    const ashaSession = await createSession(db, {
      sub: 'u_asha',
      name: 'Asha Rao',
      email: 'asha@acme.test',
      workspaces: [{ id: 'ws_acme', role: 'admin' }],
    });

    const app = createApp({
      api: { getDb: async () => db, getRedis: () => redis },
      webhooks: { getDb: async () => db, getRedis: () => redis },
    });

    // Ben sends a reply to a new contact via UI API
    const replyRes = await invokeApp(app, {
      method: 'POST',
      url: '/api/conversations/%2B14155550101/reply',
      headers: {
        'content-type': 'application/json',
        cookie: `sb_session=${benSession._id}`,
      },
      body: JSON.stringify({ workspace: 'ws_acme', text: 'UI reply', client_ref: 'ui_ref_1' }),
    });
    assert.equal(replyRes.status, 202);

    // Ben claims, Asha cannot claim (409), Ben releases, Asha claims
    assert.equal(
      (
        await invokeApp(app, {
          method: 'POST',
          url: '/api/conversations/%2B14155550101/claim',
          headers: { 'content-type': 'application/json', cookie: `sb_session=${benSession._id}` },
          body: JSON.stringify({ workspace: 'ws_acme' }),
        })
      ).status,
      200
    );
    assert.equal(
      (
        await invokeApp(app, {
          method: 'POST',
          url: '/api/conversations/%2B14155550101/claim',
          headers: { 'content-type': 'application/json', cookie: `sb_session=${ashaSession._id}` },
          body: JSON.stringify({ workspace: 'ws_acme' }),
        })
      ).status,
      409
    );
    assert.equal(
      (
        await invokeApp(app, {
          method: 'POST',
          url: '/api/conversations/%2B14155550101/release',
          headers: { 'content-type': 'application/json', cookie: `sb_session=${benSession._id}` },
          body: JSON.stringify({ workspace: 'ws_acme' }),
        })
      ).status,
      200
    );

    // Encrypted notes (ciphertext + iv), stats, search, close, reopen, and messages timeline
    assert.equal(
      (
        await invokeApp(app, {
          method: 'POST',
          url: '/api/conversations/%2B14155550101/notes',
          headers: { 'content-type': 'application/json', cookie: `sb_session=${ashaSession._id}` },
          body: JSON.stringify({ workspace: 'ws_acme', text: 'Plaintext should be rejected' }),
        })
      ).status,
      400
    );
    assert.equal(
      (
        await invokeApp(app, {
          method: 'POST',
          url: '/api/conversations/%2B14155550101/notes',
          headers: { 'content-type': 'application/json', cookie: `sb_session=${ashaSession._id}` },
          body: JSON.stringify({
            workspace: 'ws_acme',
            ciphertext: 'ZW5jcnlwdGVkX2J5dGVz',
            iv: 'cmFuZG9tX2l2XzEy',
            alg: 'AES-256-GCM',
            keyId: 'kfp_01',
          }),
        })
      ).status,
      201
    );

    const statsRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/conversations/stats?workspace=ws_acme',
      headers: { cookie: `sb_session=${ashaSession._id}` },
    });
    assert.equal(statsRes.status, 200);
    assert.deepEqual(statsRes.json(), {
      workspace: 'ws_acme',
      open: 1,
      mine: 0,
      unassigned: 1,
      closed: 0,
    });

    const searchRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/search?workspace=ws_acme&q=UI%20reply',
      headers: { cookie: `sb_session=${benSession._id}` },
    });
    assert.equal(searchRes.status, 200);
    assert.equal((searchRes.json() as { results: unknown[] }).results.length, 1);

    const crossTenantSearch = await invokeApp(app, {
      method: 'GET',
      url: '/api/search?workspace=ws_globex&q=UI%20reply',
      headers: { cookie: `sb_session=${benSession._id}` },
    });
    assert.equal(crossTenantSearch.status, 403);

    assert.equal(
      (
        await invokeApp(app, {
          method: 'POST',
          url: '/api/conversations/%2B14155550101/close',
          headers: { 'content-type': 'application/json', cookie: `sb_session=${ashaSession._id}` },
          body: JSON.stringify({ workspace: 'ws_acme' }),
        })
      ).status,
      200
    );
    assert.equal(
      (
        await invokeApp(app, {
          method: 'POST',
          url: '/api/conversations/%2B14155550101/reopen',
          headers: { 'content-type': 'application/json', cookie: `sb_session=${ashaSession._id}` },
          body: JSON.stringify({ workspace: 'ws_acme' }),
        })
      ).status,
      200
    );

    const threadRes = await invokeApp(app, {
      method: 'GET',
      url: '/api/conversations/%2B14155550101/messages?workspace=ws_acme',
      headers: { cookie: `sb_session=${benSession._id}` },
    });
    assert.equal(threadRes.status, 200);
    const thread = threadRes.json() as {
      messages: Array<{ kind: string; text?: string; ciphertext?: string; iv?: string }>;
    };
    assert.equal(thread.messages.length, 2);
    assert.equal(thread.messages[0].kind, 'outbound');
    assert.equal(thread.messages[1].kind, 'note');
    assert.equal(thread.messages[1].ciphertext, 'ZW5jcnlwdGVkX2J5dGVz');
    assert.equal(thread.messages[1].iv, 'cmFuZG9tX2l2XzEy');
    assert.equal(thread.messages[1].text, undefined);

    // Outbox lease expiration failover: simulate dead worker holding expired lease
    await db
      .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
      .updateOne(
        { workspace: 'ws_acme', clientRef: 'ui_ref_1' },
        {
          $set: {
            leaseOwner: 'dead_worker',
            leaseUntil: new Date(Date.now() - 1000),
          },
        }
      );

    let sentCount = 0;
    const failoverWorker = new OutboxWorker({
      getDb: async () => db,
      getRedis: () => redis,
      workerId: 'live_worker',
      fetchImpl: async () => {
        sentCount++;
        return new Response(JSON.stringify({ id: 'pm_failover', status: 'accepted' }), { status: 200 });
      },
    });

    await failoverWorker.drainBatch();
    assert.equal(sentCount, 1);
    const updated = await db
      .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
      .findOne({ workspace: 'ws_acme', clientRef: 'ui_ref_1' });
    assert.equal(updated?.status, 'sent');
    assert.equal(updated?.pigeonId, 'pm_failover');
  });
});
