import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { getDb } from '../db.js';
import { getRedis } from '../redis.js';
import { getSessionFromRequest, getWorkspaceRole } from '../services/auth.js';
import {
  addConversationNote,
  claimConversation,
  enqueueReply,
  HttpError,
  releaseConversation,
  setConversationStatus,
} from '../services/inbox.js';
import {
  COLLECTIONS,
  ensureIndexes,
  type ConversationDoc,
  type InboundMessageDoc,
  type NoteDoc,
  type OutboundMessageDoc,
  type SessionDoc,
} from '../store/schema.js';

export interface ApiRouterDeps {
  getDb: () => Promise<Db>;
  getRedis: () => Redis | null;
  kickOutbox?: () => void;
}

interface AuthenticatedRequest extends Request {
  session?: SessionDoc;
}

function encodeCursor(lastActivityAt: Date, contact: string): string {
  return Buffer.from(
    JSON.stringify({ t: lastActivityAt.toISOString(), c: contact }),
    'utf8'
  ).toString('base64url');
}

function decodeCursor(raw: string): { lastActivityAt: Date; contact: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      t?: string;
      c?: string;
    };
    if (!parsed.t || !parsed.c) return null;
    const d = new Date(parsed.t);
    if (Number.isNaN(d.getTime())) return null;
    return { lastActivityAt: d, contact: parsed.c };
  } catch {
    return null;
  }
}

export function createApiRouter(deps: ApiRouterDeps = { getDb, getRedis }): Router {
  const router = Router();

  const requireSession = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const db = await deps.getDb();
      const session = await getSessionFromRequest(db, req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      req.session = session;
      next();
    } catch (err) {
      next(err);
    }
  };

  router.use(requireSession);

  router.get('/me', (req: AuthenticatedRequest, res) => {
    const s = req.session!;
    res.status(200).json({
      sub: s.sub,
      name: s.name,
      email: s.email,
      workspaces: s.workspaces,
    });
  });

  function resolveWorkspaceAccess(
    req: AuthenticatedRequest,
    res: Response,
    workspaceParam: unknown
  ): { workspace: string; role: 'admin' | 'agent' } | null {
    const workspace = typeof workspaceParam === 'string' ? workspaceParam.trim() : '';
    if (!workspace) {
      res.status(400).json({ error: 'workspace query parameter is required' });
      return null;
    }
    const role = getWorkspaceRole(req.session!, workspace);
    if (!role) {
      res.status(403).json({ error: 'Forbidden for this workspace' });
      return null;
    }
    return { workspace, role };
  }

  router.get('/conversations', async (req: AuthenticatedRequest, res, next) => {
    try {
      const access = resolveWorkspaceAccess(req, res, req.query.workspace);
      if (!access) return;

      const db = await deps.getDb();
      await ensureIndexes(db);

      const rawLimit = Number(req.query.limit ?? 25);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(100, Math.max(1, Math.trunc(rawLimit)))
        : 25;

      const statusFilter =
        req.query.status === 'open' || req.query.status === 'closed'
          ? req.query.status
          : undefined;

      const filter: Record<string, unknown> = { workspace: access.workspace };
      if (statusFilter) filter.status = statusFilter;

      if (typeof req.query.cursor === 'string' && req.query.cursor) {
        const cursor = decodeCursor(req.query.cursor);
        if (!cursor) {
          res.status(400).json({ error: 'Invalid cursor' });
          return;
        }
        filter.$or = [
          { lastActivityAt: { $lt: cursor.lastActivityAt } },
          {
            lastActivityAt: cursor.lastActivityAt,
            contact: { $gt: cursor.contact },
          },
        ];
      }

      const docs = await db
        .collection<ConversationDoc>(COLLECTIONS.conversations)
        .find(filter)
        .sort({ lastActivityAt: -1, contact: 1 })
        .limit(limit + 1)
        .toArray();

      const hasMore = docs.length > limit;
      const items = hasMore ? docs.slice(0, limit) : docs;
      const last = items[items.length - 1];
      const nextCursor =
        hasMore && last ? encodeCursor(last.lastActivityAt, last.contact) : null;

      res.status(200).json({
        workspace: access.workspace,
        conversations: items.map((c) => ({
          workspace: c.workspace,
          contact: c.contact,
          assignee: c.assignee,
          status: c.status,
          lastActivityAt: c.lastActivityAt.toISOString(),
          lastMessagePreview: c.lastMessagePreview,
        })),
        nextCursor,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/conversations/stats', async (req: AuthenticatedRequest, res, next) => {
    try {
      const access = resolveWorkspaceAccess(req, res, req.query.workspace);
      if (!access) return;

      const db = await deps.getDb();
      await ensureIndexes(db);
      const all = await db
        .collection<ConversationDoc>(COLLECTIONS.conversations)
        .find({ workspace: access.workspace })
        .toArray();

      let open = 0;
      let mine = 0;
      let unassigned = 0;
      let closed = 0;

      for (const c of all) {
        if (c.status === 'closed') {
          closed++;
        } else {
          open++;
          if (c.assignee === req.session!.sub) mine++;
          if (c.assignee === null) unassigned++;
        }
      }

      res.status(200).json({ workspace: access.workspace, open, mine, unassigned, closed });
    } catch (err) {
      next(err);
    }
  });

  router.get('/search', async (req: AuthenticatedRequest, res, next) => {
    try {
      const access = resolveWorkspaceAccess(req, res, req.query.workspace);
      if (!access) return;

      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q) {
        res.status(200).json({ workspace: access.workspace, results: [] });
        return;
      }

      const db = await deps.getDb();
      await ensureIndexes(db);
      const qLower = q.toLowerCase();

      const [inbound, outbound] = await Promise.all([
        db
          .collection<InboundMessageDoc>(COLLECTIONS.inboundMessages)
          .find({ workspace: access.workspace })
          .sort({ occurredAt: -1 })
          .limit(200)
          .toArray(),
        db
          .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
          .find({ workspace: access.workspace })
          .sort({ createdAt: -1 })
          .limit(200)
          .toArray(),
      ]);

      const matches = [
        ...inbound
          .filter(
            (m) =>
              m.text.toLowerCase().includes(qLower) ||
              m.contact.toLowerCase().includes(qLower)
          )
          .map((m) => ({
            kind: 'inbound' as const,
            id: m.messageId,
            contact: m.contact,
            text: m.text,
            at: m.occurredAt.toISOString(),
            sortMs: m.occurredAt.getTime(),
          })),
        ...outbound
          .filter(
            (m) =>
              m.text.toLowerCase().includes(qLower) ||
              m.contact.toLowerCase().includes(qLower)
          )
          .map((m) => ({
            kind: 'outbound' as const,
            id: m.clientRef,
            contact: m.contact,
            text: m.text,
            status: m.status,
            at: m.createdAt.toISOString(),
            sortMs: m.createdAt.getTime(),
          })),
      ]
        .sort((a, b) => b.sortMs - a.sortMs)
        .slice(0, 30)
        .map(({ sortMs: _s, ...item }) => item);

      res.status(200).json({ workspace: access.workspace, results: matches });
    } catch (err) {
      next(err);
    }
  });

  router.get('/conversations/:contact/messages', async (req: AuthenticatedRequest, res, next) => {
    try {
      const access = resolveWorkspaceAccess(req, res, req.query.workspace);
      if (!access) return;

      const contact = decodeURIComponent(req.params.contact);
      const db = await deps.getDb();
      await ensureIndexes(db);

      const [conversation, inbound, outbound, notes] = await Promise.all([
        db
          .collection<ConversationDoc>(COLLECTIONS.conversations)
          .findOne({ workspace: access.workspace, contact }),
        db
          .collection<InboundMessageDoc>(COLLECTIONS.inboundMessages)
          .find({ workspace: access.workspace, contact })
          .sort({ occurredAt: 1, messageId: 1 })
          .toArray(),
        db
          .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
          .find({ workspace: access.workspace, contact })
          .sort({ createdAt: 1, clientRef: 1 })
          .toArray(),
        db
          .collection<NoteDoc>(COLLECTIONS.notes)
          .find({ workspace: access.workspace, contact })
          .sort({ createdAt: 1 })
          .toArray(),
      ]);

      const timeline = [
        ...inbound.map((m) => ({
          kind: 'inbound' as const,
          id: m.messageId,
          text: m.text,
          at: m.occurredAt.toISOString(),
          sortMs: m.occurredAt.getTime(),
        })),
        ...outbound.map((m) => ({
          kind: 'outbound' as const,
          id: m.clientRef,
          clientRef: m.clientRef,
          text: m.text,
          status: m.status,
          agent: m.agent,
          at: m.createdAt.toISOString(),
          sortMs: m.createdAt.getTime(),
        })),
        ...notes.map((n) => ({
          kind: 'note' as const,
          id: `note_${n.createdAt.getTime()}_${n.authorSub}`,
          ciphertext: n.ciphertext,
          iv: n.iv,
          alg: n.alg,
          keyId: n.keyId,
          authorSub: n.authorSub,
          authorName: n.authorName,
          at: n.createdAt.toISOString(),
          sortMs: n.createdAt.getTime(),
        })),
      ].sort((a, b) => a.sortMs - b.sortMs || a.id.localeCompare(b.id));

      res.status(200).json({
        conversation: conversation
          ? {
              workspace: conversation.workspace,
              contact: conversation.contact,
              assignee: conversation.assignee,
              status: conversation.status,
              lastActivityAt: conversation.lastActivityAt.toISOString(),
            }
          : null,
        messages: timeline.map(({ sortMs: _s, ...item }) => item),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/conversations/:contact/reply', async (req: AuthenticatedRequest, res, next) => {
    try {
      const workspace =
        (typeof req.body?.workspace === 'string' && req.body.workspace) || req.query.workspace;
      const access = resolveWorkspaceAccess(req, res, workspace);
      if (!access) return;

      const contact = decodeURIComponent(req.params.contact);
      const text = typeof req.body?.text === 'string' ? req.body.text : '';
      const clientRef =
        typeof req.body?.client_ref === 'string' && req.body.client_ref
          ? req.body.client_ref
          : `ui_${randomUUID()}`;

      const db = await deps.getDb();
      const redis = deps.getRedis();
      const { doc } = await enqueueReply(db, redis, {
        workspace: access.workspace,
        contact,
        text,
        clientRef,
        agent: req.session!.sub,
      });
      deps.kickOutbox?.();

      res.status(202).json({
        ok: true,
        client_ref: doc.clientRef,
        status: doc.status,
      });
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  router.post('/conversations/:contact/claim', async (req: AuthenticatedRequest, res, next) => {
    try {
      const workspace =
        (typeof req.body?.workspace === 'string' && req.body.workspace) || req.query.workspace;
      const access = resolveWorkspaceAccess(req, res, workspace);
      if (!access) return;

      const contact = decodeURIComponent(req.params.contact);
      const db = await deps.getDb();
      const redis = deps.getRedis();
      const result = await claimConversation(db, redis, {
        workspace: access.workspace,
        contact,
        agent: req.session!.sub,
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

  router.post('/conversations/:contact/release', async (req: AuthenticatedRequest, res, next) => {
    try {
      const workspace =
        (typeof req.body?.workspace === 'string' && req.body.workspace) || req.query.workspace;
      const access = resolveWorkspaceAccess(req, res, workspace);
      if (!access) return;

      const contact = decodeURIComponent(req.params.contact);
      const db = await deps.getDb();
      const redis = deps.getRedis();
      const updated = await releaseConversation(db, redis, {
        workspace: access.workspace,
        contact,
        agent: req.session!.sub,
        isAdmin: access.role === 'admin',
      });
      res.status(200).json({ ok: true, assignee: updated.assignee });
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  router.post('/conversations/:contact/close', async (req: AuthenticatedRequest, res, next) => {
    try {
      const workspace =
        (typeof req.body?.workspace === 'string' && req.body.workspace) || req.query.workspace;
      const access = resolveWorkspaceAccess(req, res, workspace);
      if (!access) return;

      const contact = decodeURIComponent(req.params.contact);
      const db = await deps.getDb();
      const redis = deps.getRedis();
      const updated = await setConversationStatus(db, redis, {
        workspace: access.workspace,
        contact,
        status: 'closed',
      });
      res.status(200).json({ ok: true, status: updated.status });
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  router.post('/conversations/:contact/reopen', async (req: AuthenticatedRequest, res, next) => {
    try {
      const workspace =
        (typeof req.body?.workspace === 'string' && req.body.workspace) || req.query.workspace;
      const access = resolveWorkspaceAccess(req, res, workspace);
      if (!access) return;

      const contact = decodeURIComponent(req.params.contact);
      const db = await deps.getDb();
      const redis = deps.getRedis();
      const updated = await setConversationStatus(db, redis, {
        workspace: access.workspace,
        contact,
        status: 'open',
      });
      res.status(200).json({ ok: true, status: updated.status });
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  router.post('/conversations/:contact/notes', async (req: AuthenticatedRequest, res, next) => {
    try {
      const workspace =
        (typeof req.body?.workspace === 'string' && req.body.workspace) || req.query.workspace;
      const access = resolveWorkspaceAccess(req, res, workspace);
      if (!access) return;

      const contact = decodeURIComponent(req.params.contact);
      const ciphertext = typeof req.body?.ciphertext === 'string' ? req.body.ciphertext : '';
      const iv = typeof req.body?.iv === 'string' ? req.body.iv : '';
      const alg = typeof req.body?.alg === 'string' ? req.body.alg : undefined;
      const keyId = typeof req.body?.keyId === 'string' ? req.body.keyId : undefined;

      const db = await deps.getDb();
      const redis = deps.getRedis();
      const note = await addConversationNote(db, redis, {
        workspace: access.workspace,
        contact,
        authorSub: req.session!.sub,
        authorName: req.session!.name,
        ciphertext,
        iv,
        alg,
        keyId,
      });

      res.status(201).json({
        ok: true,
        note: {
          kind: 'note',
          ciphertext: note.ciphertext,
          iv: note.iv,
          alg: note.alg,
          keyId: note.keyId,
          authorSub: note.authorSub,
          authorName: note.authorName,
          at: note.createdAt.toISOString(),
        },
      });
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
