import { createHmac, timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { getRedis } from '../redis.js';
import { publishWorkspaceEvent } from '../services/events.js';
import {
  COLLECTIONS,
  ensureIndexes,
  type ConversationDoc,
  type InboundMessageDoc,
  type OutboundMessageDoc,
  type OutboundStatus,
} from '../store/schema.js';

const MAX_WEBHOOK_AGE_SECONDS = 300;

export interface WebhookDeps {
  getDb: () => Promise<Db>;
  getRedis: () => Redis | null;
  webhookSecret?: string;
  knownWorkspaces?: () => Set<string>;
}

const PREVIOUS_STATUSES_FOR: Record<'sent' | 'delivered' | 'failed', OutboundStatus[]> = {
  sent: ['queued'],
  delivered: ['queued', 'sent'],
  failed: ['queued', 'sent'],
};

/**
 * Parses and verifies `x-pigeon-signature: t=<unix>,v1=<hex>` against the raw body.
 * Returns null if the signature is missing, malformed, mismatched, or stale (> 5 min).
 */
export function verifyPigeonSignature(
  headerValue: string | undefined,
  rawBody: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): { timestamp: number } | null {
  if (!headerValue || !secret) return null;

  let timestampStr: string | undefined;
  let sigHex: string | undefined;

  for (const part of headerValue.split(',')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key === 't') timestampStr = val;
    else if (key === 'v1') sigHex = val;
  }

  if (!timestampStr || !sigHex) return null;
  if (!/^\d+$/.test(timestampStr) || !/^[0-9a-f]{64}$/i.test(sigHex)) return null;

  const timestamp = Number(timestampStr);
  if (!Number.isSafeInteger(timestamp)) return null;

  const expected = createHmac('sha256', secret).update(`${timestampStr}.${rawBody}`).digest();
  const provided = Buffer.from(sigHex, 'hex');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  if (Math.abs(nowSeconds - timestamp) > MAX_WEBHOOK_AGE_SECONDS) {
    return null;
  }

  return { timestamp };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createWebhookRouter(
  deps: WebhookDeps = { getDb, getRedis }
): Router {
  const router = Router();

  router.post(
    '/pigeon',
    express.raw({ type: '*/*', limit: '2mb' }),
    async (req, res, next) => {
      try {
        const rawBuf = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(typeof req.body === 'string' ? req.body : '', 'utf8');
        const rawBody = rawBuf.toString('utf8');
        const secret =
          deps.webhookSecret ?? process.env.PIGEON_WEBHOOK_SECRET ?? config.pigeon.webhookSecret;

        const sigHeader = req.header('x-pigeon-signature');
        const verified = verifyPigeonSignature(sigHeader, rawBody, secret);
        if (!verified) {
          res.status(401).json({ error: 'Invalid or stale signature' });
          return;
        }

        let payload: unknown;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          res.status(400).json({ error: 'Invalid JSON payload' });
          return;
        }

        if (!isPlainObject(payload)) {
          res.status(400).json({ error: 'Payload must be a JSON object' });
          return;
        }

        const workspace = payload.workspace;
        const known = deps.knownWorkspaces
          ? deps.knownWorkspaces()
          : new Set(Object.keys(config.pigeon.apiKeys));

        if (typeof workspace !== 'string' || !known.has(workspace)) {
          res.status(200).json({ ok: true, ignored: 'unknown_workspace' });
          return;
        }

        const eventType = payload.type;
        if (eventType !== 'message.inbound' && eventType !== 'message.status') {
          res.status(200).json({ ok: true, ignored: 'unknown_event_type' });
          return;
        }

        const data = payload.data;
        if (!isPlainObject(data)) {
          res.status(400).json({ error: 'Event data must be an object' });
          return;
        }

        const db = await deps.getDb();
        await ensureIndexes(db);
        const redis = deps.getRedis();

        if (eventType === 'message.inbound') {
          const messageId = data.message_id;
          const from = data.from;
          const text = data.text;
          const occurredAtRaw = payload.occurred_at;

          if (
            typeof messageId !== 'string' ||
            !messageId ||
            typeof from !== 'string' ||
            !from ||
            typeof text !== 'string'
          ) {
            res.status(400).json({ error: 'Invalid message.inbound data' });
            return;
          }

          const occurredAt =
            typeof occurredAtRaw === 'string' && !Number.isNaN(Date.parse(occurredAtRaw))
              ? new Date(occurredAtRaw)
              : new Date();
          const now = new Date();
          const eventId =
            typeof payload.id === 'string'
              ? payload.id
              : (req.header('x-pigeon-event-id') ?? '');

          const insertResult = await db
            .collection<InboundMessageDoc>(COLLECTIONS.inboundMessages)
            .updateOne(
              { workspace, messageId },
              {
                $setOnInsert: {
                  workspace,
                  contact: from,
                  messageId,
                  text,
                  occurredAt,
                  eventId,
                  createdAt: now,
                },
              },
              { upsert: true }
            );

          if (insertResult.upsertedCount === 1) {
            await db.collection<ConversationDoc>(COLLECTIONS.conversations).updateOne(
              { workspace, contact: from },
              {
                $setOnInsert: {
                  workspace,
                  contact: from,
                  assignee: null,
                  status: 'open',
                  createdAt: now,
                },
                $max: { lastActivityAt: occurredAt },
                $set: {
                  updatedAt: now,
                  lastMessagePreview: text.slice(0, 140),
                },
              },
              { upsert: true }
            );

            await publishWorkspaceEvent(db, redis, workspace, {
              type: 'message.inbound',
              contact: from,
              message_id: messageId,
              text,
              occurred_at: occurredAt.toISOString(),
            });
          }

          res.status(200).json({ ok: true });
          return;
        }

        // eventType === 'message.status'
        const status = data.status;
        if (status !== 'sent' && status !== 'delivered' && status !== 'failed') {
          res.status(200).json({ ok: true, ignored: 'unknown_status' });
          return;
        }

        const clientRef = typeof data.client_ref === 'string' && data.client_ref ? data.client_ref : null;
        const pigeonId = typeof data.message_id === 'string' && data.message_id ? data.message_id : null;

        if (!clientRef && !pigeonId) {
          res.status(200).json({ ok: true, ignored: 'unknown_message' });
          return;
        }

        const lookupFilter = clientRef
          ? { workspace, clientRef }
          : { workspace, pigeonId: pigeonId! };

        const existing = await db
          .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
          .findOne(lookupFilter, { projection: { _id: 1 } });

        if (!existing) {
          res.status(200).json({ ok: true, ignored: 'unknown_message' });
          return;
        }

        const now = new Date();
        const updated = await db
          .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
          .findOneAndUpdate(
            {
              ...lookupFilter,
              status: { $in: PREVIOUS_STATUSES_FOR[status] },
            },
            {
              $set: {
                status,
                ...(pigeonId ? { pigeonId } : {}),
                statusUpdatedAt: now,
                updatedAt: now,
                leaseOwner: null,
                leaseUntil: null,
              },
            },
            { returnDocument: 'after' }
          );

        if (updated) {
          await publishWorkspaceEvent(db, redis, workspace, {
            type: 'message.status',
            contact: updated.contact,
            client_ref: updated.clientRef,
            status: updated.status,
            ...(pigeonId ? { message_id: pigeonId } : {}),
          });
        }

        res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
