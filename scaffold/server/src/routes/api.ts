import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { config } from '../config.js';
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
  type ContactDoc,
  type ConversationDoc,
  type EventDoc,
  type InboundMessageDoc,
  type NoteDoc,
  type OutboundMessageDoc,
  type SessionDoc,
  type TeamInviteDoc,
  type TeamRole,
  type WorkspaceSettingsDoc,
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
          tags: c.tags ?? [],
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

  router.get('/dashboard', async (req: AuthenticatedRequest, res, next) => {
    try {
      const access = resolveWorkspaceAccess(req, res, req.query.workspace);
      if (!access) return;

      const db = await deps.getDb();
      await ensureIndexes(db);

      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);

      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      const [conversations, inbound, outbound, recentEvents] = await Promise.all([
        db
          .collection<ConversationDoc>(COLLECTIONS.conversations)
          .find({ workspace: access.workspace })
          .sort({ lastActivityAt: -1, contact: 1 })
          .toArray(),
        db
          .collection<InboundMessageDoc>(COLLECTIONS.inboundMessages)
          .find({ workspace: access.workspace, occurredAt: { $gte: sevenDaysAgo } })
          .toArray(),
        db
          .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
          .find({ workspace: access.workspace, createdAt: { $gte: sevenDaysAgo } })
          .toArray(),
        db
          .collection<EventDoc>(COLLECTIONS.events)
          .find({ workspace: access.workspace })
          .sort({ seq: -1 })
          .limit(10)
          .toArray(),
      ]);

      let open = 0;
      let mine = 0;
      let unassigned = 0;
      let closed = 0;
      const activeAgentSet = new Set<string>();
      let handledToday = 0;

      for (const c of conversations) {
        if (c.status === 'closed') {
          closed++;
        } else {
          open++;
          if (c.assignee === req.session!.sub) mine++;
          if (c.assignee === null) unassigned++;
        }
        if (c.assignee) activeAgentSet.add(c.assignee);
        if (c.updatedAt >= startOfToday) handledToday++;
      }

      // Build 7-day activity buckets
      const dayBuckets = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(sevenDaysAgo);
        d.setDate(sevenDaysAgo.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString('en-US', { weekday: 'short' });
        return { key, day: label, contacts: new Set<string>(), messages: 0 };
      });
      const bucketMap = new Map(dayBuckets.map((b) => [b.key, b]));

      for (const m of inbound) {
        const key = m.occurredAt.toISOString().slice(0, 10);
        const bucket = bucketMap.get(key);
        if (bucket) {
          bucket.messages++;
          bucket.contacts.add(m.contact);
        }
      }
      for (const m of outbound) {
        const key = m.createdAt.toISOString().slice(0, 10);
        const bucket = bucketMap.get(key);
        if (bucket) {
          bucket.messages++;
          bucket.contacts.add(m.contact);
        }
        if (m.agent) activeAgentSet.add(m.agent);
      }

      // Estimate average response latency (from first inbound to first outbound per contact)
      const firstInboundByContact = new Map<string, number>();
      for (const m of inbound) {
        const t = m.occurredAt.getTime();
        const prev = firstInboundByContact.get(m.contact);
        if (prev === undefined || t < prev) firstInboundByContact.set(m.contact, t);
      }
      const firstOutboundByContact = new Map<string, number>();
      for (const m of outbound) {
        const t = m.createdAt.getTime();
        const prev = firstOutboundByContact.get(m.contact);
        if (prev === undefined || t < prev) firstOutboundByContact.set(m.contact, t);
      }
      const responseDeltasSec: number[] = [];
      for (const [contact, outMs] of firstOutboundByContact) {
        const inMs = firstInboundByContact.get(contact);
        if (inMs !== undefined && outMs >= inMs) {
          responseDeltasSec.push(Math.round((outMs - inMs) / 1000));
        }
      }
      const avgFirstResponseSec =
        responseDeltasSec.length > 0
          ? Math.round(
              responseDeltasSec.reduce((a, b) => a + b, 0) / responseDeltasSec.length
            )
          : null;

      res.status(200).json({
        workspace: access.workspace,
        stats: { open, mine, unassigned, closed },
        activity: dayBuckets.map((b) => ({
          day: b.day,
          conversations: b.contacts.size,
          messages: b.messages,
        })),
        recentConversations: conversations.slice(0, 5).map((c) => ({
          workspace: c.workspace,
          contact: c.contact,
          assignee: c.assignee,
          status: c.status,
          lastActivityAt: c.lastActivityAt.toISOString(),
          lastMessagePreview: c.lastMessagePreview,
        })),
        teamActivity: {
          activeAgents: activeAgentSet.size,
          handledToday,
          avgFirstResponseSec,
        },
        recentEvents: recentEvents.map((e) => ({
          seq: e.seq,
          type: e.type,
          contact: e.contact ?? null,
          status: e.status ?? null,
          assignee: e.assignee ?? null,
          at: e.createdAt.toISOString(),
        })),
      });
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
        res.status(200).json({ workspace: access.workspace, results: [], encryptedNotes: [] });
        return;
      }

      const db = await deps.getDb();
      await ensureIndexes(db);
      const qLower = q.toLowerCase();
      const terms = qLower.split(/\s+/).filter(Boolean);

      const scoreMatch = (haystack: string, timestampMs: number): number => {
        const lower = haystack.toLowerCase();
        if (!lower) return 0;
        let score = 0;
        if (lower.includes(qLower)) score += 100;
        for (const term of terms) {
          if (lower.includes(term)) score += 25;
        }
        if (score === 0) return 0;
        // Slight recency boost
        const ageDays = Math.max(0, (Date.now() - timestampMs) / (24 * 60 * 60 * 1000));
        return score + Math.max(0, 10 - ageDays);
      };

      const [contacts, conversations, inbound, outbound, notes] = await Promise.all([
        db
          .collection<ContactDoc>(COLLECTIONS.contacts)
          .find({ workspace: access.workspace })
          .toArray(),
        db
          .collection<ConversationDoc>(COLLECTIONS.conversations)
          .find({ workspace: access.workspace })
          .toArray(),
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
        db
          .collection<NoteDoc>(COLLECTIONS.notes)
          .find({ workspace: access.workspace })
          .sort({ createdAt: -1 })
          .limit(100)
          .toArray(),
      ]);

      const profileByContact = new Map(contacts.map((c) => [c.contact, c]));
      const convByContact = new Map(conversations.map((c) => [c.contact, c]));

      const convResults = conversations
        .map((c) => {
          const profile = profileByContact.get(c.contact);
          const name = profile?.name || c.contact;
          const hay = `${c.contact} ${name} ${c.lastMessagePreview} ${(c.tags ?? []).join(' ')}`;
          const score = scoreMatch(hay, c.lastActivityAt.getTime());
          return {
            kind: 'conversation' as const,
            id: `conv_${c.contact}`,
            contact: c.contact,
            contactName: name,
            title: `Conversation with ${name}`,
            subtitle: c.contact,
            text: c.lastMessagePreview || 'Conversation',
            status: c.status,
            tags: c.tags ?? [],
            at: c.lastActivityAt.toISOString(),
            score,
          };
        })
        .filter((r) => r.score > 0);

      const contactResults = Array.from(
        new Set([...profileByContact.keys(), ...convByContact.keys()])
      )
        .map((contactKey) => {
          const profile = profileByContact.get(contactKey);
          const conv = convByContact.get(contactKey);
          const name = profile?.name || contactKey;
          const email = profile?.email || '';
          const location = profile?.location || '';
          const atDate = profile?.updatedAt ?? conv?.lastActivityAt ?? new Date();
          const hay = `${contactKey} ${name} ${email} ${location} ${(profile?.tags ?? []).join(' ')}`;
          const score = scoreMatch(hay, atDate.getTime());
          return {
            kind: 'contact' as const,
            id: `contact_${contactKey}`,
            contact: contactKey,
            contactName: name,
            title: name,
            subtitle: [email, contactKey].filter(Boolean).join(' · '),
            text: location || contactKey,
            status: profile?.type ?? 'customer',
            tags: profile?.tags ?? conv?.tags ?? [],
            at: atDate.toISOString(),
            score,
          };
        })
        .filter((r) => r.score > 0);

      const messageResults = [
        ...inbound.map((m) => {
          const name = profileByContact.get(m.contact)?.name || m.contact;
          const score = scoreMatch(`${m.text} ${m.contact} ${name}`, m.occurredAt.getTime());
          return {
            kind: 'message' as const,
            direction: 'inbound' as const,
            id: m.messageId,
            contact: m.contact,
            contactName: name,
            title: `Message from ${name}`,
            subtitle: m.contact,
            text: m.text,
            status: convByContact.get(m.contact)?.status ?? 'open',
            at: m.occurredAt.toISOString(),
            score,
          };
        }),
        ...outbound.map((m) => {
          const name = profileByContact.get(m.contact)?.name || m.contact;
          const score = scoreMatch(`${m.text} ${m.contact} ${name}`, m.createdAt.getTime());
          return {
            kind: 'message' as const,
            direction: 'outbound' as const,
            id: m.clientRef,
            contact: m.contact,
            contactName: name,
            title: `Reply to ${name}`,
            subtitle: m.contact,
            text: m.text,
            status: m.status,
            at: m.createdAt.toISOString(),
            score,
          };
        }),
      ].filter((r) => r.score > 0);

      const results = [...convResults, ...contactResults, ...messageResults]
        .sort((a, b) => b.score - a.score || Date.parse(b.at) - Date.parse(a.at))
        .slice(0, 60);

      // Encrypted notes are returned as ciphertext so the client can decrypt and match locally
      const encryptedNotes = notes.map((n) => ({
        id: `note_${n.createdAt.getTime()}_${n.authorSub}`,
        contact: n.contact,
        contactName: profileByContact.get(n.contact)?.name || n.contact,
        ciphertext: n.ciphertext,
        iv: n.iv,
        alg: n.alg,
        keyId: n.keyId,
        authorName: n.authorName,
        at: n.createdAt.toISOString(),
      }));

      res.status(200).json({ workspace: access.workspace, results, encryptedNotes });
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

      const [conversation, inbound, outbound, notes, historyEvents] = await Promise.all([
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
        db
          .collection<EventDoc>(COLLECTIONS.events)
          .find({ workspace: access.workspace, contact })
          .sort({ seq: -1 })
          .limit(30)
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
              tags: conversation.tags ?? [],
              lastActivityAt: conversation.lastActivityAt.toISOString(),
            }
          : null,
        messages: timeline.map(({ sortMs: _s, ...item }) => item),
        history: historyEvents.map((e) => ({
          seq: e.seq,
          type: e.type,
          status: e.status ?? null,
          assignee: e.assignee ?? null,
          conversationStatus: e.conversation_status ?? null,
          at: e.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/conversations/:contact/tags', async (req: AuthenticatedRequest, res, next) => {
    try {
      const workspace =
        (typeof req.body?.workspace === 'string' && req.body.workspace) || req.query.workspace;
      const access = resolveWorkspaceAccess(req, res, workspace);
      if (!access) return;

      const contact = decodeURIComponent(req.params.contact);
      const rawTags = Array.isArray(req.body?.tags) ? (req.body.tags as unknown[]) : [];
      const tags = Array.from(
        new Set(
          rawTags
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length > 0 && t.length <= 32)
        )
      ).slice(0, 12);

      const db = await deps.getDb();
      await ensureIndexes(db);
      const updated = await db
        .collection<ConversationDoc>(COLLECTIONS.conversations)
        .findOneAndUpdate(
          { workspace: access.workspace, contact },
          { $set: { tags, updatedAt: new Date() } },
          { returnDocument: 'after' }
        );

      if (!updated) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      res.status(200).json({ ok: true, tags: updated.tags ?? [] });
    } catch (err) {
      next(err);
    }
  });

  const DIRECTORY_USERS: Array<{
    sub: string;
    name: string;
    email: string;
    workspaces: Array<{ id: string; role: TeamRole }>;
  }> = [
    { sub: 'u_asha', name: 'Asha Rao', email: 'asha@acme.test', workspaces: [{ id: 'ws_acme', role: 'admin' }] },
    { sub: 'u_ben', name: 'Ben Ortiz', email: 'ben@acme.test', workspaces: [{ id: 'ws_acme', role: 'agent' }] },
    { sub: 'u_chloe', name: 'Chloe Martin', email: 'chloe@globex.test', workspaces: [{ id: 'ws_globex', role: 'admin' }] },
    { sub: 'u_dev', name: 'Dev Patel', email: 'dev@globex.test', workspaces: [{ id: 'ws_globex', role: 'agent' }] },
    {
      sub: 'u_eli',
      name: 'Eli Novak',
      email: 'eli@contractor.test',
      workspaces: [
        { id: 'ws_acme', role: 'agent' },
        { id: 'ws_globex', role: 'agent' },
      ],
    },
  ];

  router.get('/team', async (req: AuthenticatedRequest, res, next) => {
    try {
      const access = resolveWorkspaceAccess(req, res, req.query.workspace);
      if (!access) return;

      const db = await deps.getDb();
      await ensureIndexes(db);

      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      const [conversations, inbound, outbound, activeSessions, invites] = await Promise.all([
        db
          .collection<ConversationDoc>(COLLECTIONS.conversations)
          .find({ workspace: access.workspace })
          .toArray(),
        db
          .collection<InboundMessageDoc>(COLLECTIONS.inboundMessages)
          .find({ workspace: access.workspace, occurredAt: { $gte: sevenDaysAgo } })
          .toArray(),
        db
          .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
          .find({ workspace: access.workspace, createdAt: { $gte: sevenDaysAgo } })
          .toArray(),
        db
          .collection<SessionDoc>(COLLECTIONS.sessions)
          .find({ expiresAt: { $gt: now } })
          .toArray(),
        db
          .collection<TeamInviteDoc>(COLLECTIONS.teamInvites)
          .find({ workspace: access.workspace })
          .toArray(),
      ]);

      const activeSubs = new Set(activeSessions.map((s) => s.sub));
      const convCountByAgent = new Map<string, number>();
      const closedCountByAgent = new Map<string, number>();
      const lastActiveByAgent = new Map<string, Date>();

      for (const c of conversations) {
        if (!c.assignee) continue;
        convCountByAgent.set(c.assignee, (convCountByAgent.get(c.assignee) ?? 0) + 1);
        if (c.status === 'closed') {
          closedCountByAgent.set(c.assignee, (closedCountByAgent.get(c.assignee) ?? 0) + 1);
        }
        const prev = lastActiveByAgent.get(c.assignee);
        if (!prev || c.updatedAt > prev) lastActiveByAgent.set(c.assignee, c.updatedAt);
      }

      const memberMap = new Map<
        string,
        {
          id: string;
          name: string;
          email: string;
          role: TeamRole;
          status: 'active' | 'away' | 'offline';
          conversations: number;
          closedConversations: number;
          lastActiveAt: string | null;
          joinedAt: string;
          source: 'directory' | 'invite';
        }
      >();

      for (const u of DIRECTORY_USERS) {
        const wsRole = u.workspaces.find((w) => w.id === access.workspace);
        if (!wsRole) continue;
        const lastAt = lastActiveByAgent.get(u.sub) ?? null;
        const isMe = u.sub === req.session!.sub;
        const status: 'active' | 'away' | 'offline' =
          isMe || activeSubs.has(u.sub)
            ? 'active'
            : lastAt && now.getTime() - lastAt.getTime() < 30 * 60 * 1000
              ? 'away'
              : 'offline';

        memberMap.set(u.sub, {
          id: u.sub,
          name: u.name,
          email: u.email,
          role: wsRole.role,
          status,
          conversations: convCountByAgent.get(u.sub) ?? 0,
          closedConversations: closedCountByAgent.get(u.sub) ?? 0,
          lastActiveAt: isMe ? now.toISOString() : (lastAt ? lastAt.toISOString() : null),
          joinedAt: '2026-01-15T00:00:00.000Z',
          source: 'directory',
        });
      }

      for (const inv of invites) {
        const id = inv.email.toLowerCase();
        memberMap.set(id, {
          id,
          name: inv.name,
          email: inv.email,
          role: inv.role,
          status: inv.status,
          conversations: convCountByAgent.get(id) ?? 0,
          closedConversations: closedCountByAgent.get(id) ?? 0,
          lastActiveAt: inv.createdAt.toISOString(),
          joinedAt: inv.createdAt.toISOString(),
          source: 'invite',
        });
      }

      const members = Array.from(memberMap.values());
      const statusCounts = { active: 0, away: 0, offline: 0 };
      const roleCounts: Record<TeamRole, number> = {
        admin: 0,
        manager: 0,
        agent: 0,
        viewer: 0,
      };
      for (const m of members) {
        statusCounts[m.status]++;
        roleCounts[m.role]++;
      }

      const dayBuckets = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(sevenDaysAgo);
        d.setDate(sevenDaysAgo.getDate() + i);
        return {
          key: d.toISOString().slice(0, 10),
          day: d.toLocaleDateString('en-US', { weekday: 'short' }),
          conversations: 0,
        };
      });
      const bucketMap = new Map(dayBuckets.map((b) => [b.key, b]));
      for (const c of conversations) {
        const bucket = bucketMap.get(c.updatedAt.toISOString().slice(0, 10));
        if (bucket) bucket.conversations++;
      }

      const firstIn = new Map<string, number>();
      for (const m of inbound) {
        const t = m.occurredAt.getTime();
        const prev = firstIn.get(m.contact);
        if (prev === undefined || t < prev) firstIn.set(m.contact, t);
      }
      const firstOut = new Map<string, number>();
      for (const m of outbound) {
        const t = m.createdAt.getTime();
        const prev = firstOut.get(m.contact);
        if (prev === undefined || t < prev) firstOut.set(m.contact, t);
      }
      const deltas: number[] = [];
      for (const [contact, outMs] of firstOut) {
        const inMs = firstIn.get(contact);
        if (inMs !== undefined && outMs >= inMs) {
          deltas.push(Math.round((outMs - inMs) / 1000));
        }
      }
      const avgFirstResponseSec =
        deltas.length > 0 ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : null;

      const closedTotal = conversations.filter((c) => c.status === 'closed').length;
      const resolutionRate =
        conversations.length > 0 ? Math.round((closedTotal / conversations.length) * 100) : 0;

      res.status(200).json({
        workspace: access.workspace,
        summary: {
          totalAgents: members.length,
          ...statusCounts,
        },
        activity: dayBuckets.map((b) => ({ day: b.day, conversations: b.conversations })),
        performance: {
          avgFirstResponseSec,
          conversationsHandled: conversations.length,
          resolutionRate,
          messagesSent: outbound.length,
        },
        roleCounts,
        members,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/team/invites', async (req: AuthenticatedRequest, res, next) => {
    try {
      const workspace =
        (typeof req.body?.workspace === 'string' && req.body.workspace) || req.query.workspace;
      const access = resolveWorkspaceAccess(req, res, workspace);
      if (!access) return;

      if (access.role !== 'admin') {
        res.status(403).json({ error: 'Only workspace admins can invite agents' });
        return;
      }

      const rawEmail: unknown = req.body?.email;
      const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
      const role = req.body?.role as TeamRole;
      if (!email || !email.includes('@')) {
        res.status(400).json({ error: 'Valid email address is required' });
        return;
      }
      if (role !== 'admin' && role !== 'manager' && role !== 'agent' && role !== 'viewer') {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }

      const localName = email.split('@')[0].replace(/[._-]+/g, ' ');
      const displayName = localName
        .split(' ')
        .filter((p) => p.length > 0)
        .map((p) => p[0].toUpperCase() + p.slice(1))
        .join(' ');

      const db = await deps.getDb();
      await ensureIndexes(db);
      const invite: TeamInviteDoc = {
        workspace: access.workspace,
        email,
        name: displayName || email,
        role,
        status: 'offline',
        invitedBy: req.session!.sub,
        createdAt: new Date(),
      };

      await db
        .collection<TeamInviteDoc>(COLLECTIONS.teamInvites)
        .updateOne(
          { workspace: access.workspace, email },
          { $set: invite },
          { upsert: true }
        );

      res.status(201).json({ ok: true, invite });
    } catch (err) {
      next(err);
    }
  });

  router.get('/contacts', async (req: AuthenticatedRequest, res, next) => {
    try {
      const access = resolveWorkspaceAccess(req, res, req.query.workspace);
      if (!access) return;

      const db = await deps.getDb();
      await ensureIndexes(db);

      const typeFilter =
        req.query.type === 'customer' || req.query.type === 'lead' ? req.query.type : 'all';
      const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
      const rawPage = Number(req.query.page ?? 1);
      const rawLimit = Number(req.query.limit ?? 8);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(50, Math.max(1, Math.trunc(rawLimit)))
        : 8;
      const page = Number.isFinite(rawPage) ? Math.max(1, Math.trunc(rawPage)) : 1;

      const [contactDocs, conversations, inbound, outbound] = await Promise.all([
        db
          .collection<ContactDoc>(COLLECTIONS.contacts)
          .find({ workspace: access.workspace })
          .toArray(),
        db
          .collection<ConversationDoc>(COLLECTIONS.conversations)
          .find({ workspace: access.workspace })
          .toArray(),
        db
          .collection<InboundMessageDoc>(COLLECTIONS.inboundMessages)
          .find({ workspace: access.workspace })
          .toArray(),
        db
          .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
          .find({ workspace: access.workspace })
          .toArray(),
      ]);

      const msgCountByContact = new Map<string, number>();
      for (const m of inbound) {
        msgCountByContact.set(m.contact, (msgCountByContact.get(m.contact) ?? 0) + 1);
      }
      for (const m of outbound) {
        msgCountByContact.set(m.contact, (msgCountByContact.get(m.contact) ?? 0) + 1);
      }

      const convByContact = new Map(conversations.map((c) => [c.contact, c]));
      const profileByContact = new Map(contactDocs.map((c) => [c.contact, c]));
      const allKeys = Array.from(
        new Set([...profileByContact.keys(), ...convByContact.keys()])
      );

      const merged = allKeys.map((contact) => {
        const profile = profileByContact.get(contact);
        const conv = convByContact.get(contact);
        const tags = Array.from(
          new Set([...(profile?.tags ?? []), ...(conv?.tags ?? [])])
        );
        const lastActivityAt =
          conv?.lastActivityAt ?? profile?.updatedAt ?? profile?.createdAt ?? new Date(0);
        return {
          workspace: access.workspace,
          contact,
          name: profile?.name || contact,
          email: profile?.email || '',
          location: profile?.location || '',
          type: profile?.type ?? ('customer' as const),
          tags,
          assignee: conv?.assignee ?? null,
          conversationStatus: conv?.status ?? null,
          lastMessagePreview: conv?.lastMessagePreview ?? '',
          messageCount: msgCountByContact.get(contact) ?? 0,
          createdAt: (profile?.createdAt ?? conv?.createdAt ?? new Date()).toISOString(),
          lastActivityAt: lastActivityAt.toISOString(),
        };
      });

      merged.sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));

      const counts = {
        all: merged.length,
        customer: merged.filter((c) => c.type === 'customer').length,
        lead: merged.filter((c) => c.type === 'lead').length,
      };

      const filtered = merged.filter((c) => {
        if (typeFilter !== 'all' && c.type !== typeFilter) return false;
        if (!q) return true;
        return (
          c.contact.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.location.toLowerCase().includes(q)
        );
      });

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(page, totalPages);
      const start = (safePage - 1) * limit;
      const items = filtered.slice(start, start + limit);

      res.status(200).json({
        workspace: access.workspace,
        counts,
        page: safePage,
        limit,
        total,
        totalPages,
        contacts: items,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/contacts', async (req: AuthenticatedRequest, res, next) => {
    try {
      const workspace =
        (typeof req.body?.workspace === 'string' && req.body.workspace) || req.query.workspace;
      const access = resolveWorkspaceAccess(req, res, workspace);
      if (!access) return;

      const rawContact: unknown = req.body?.contact;
      const contact = typeof rawContact === 'string' ? rawContact.trim() : '';
      if (!contact) {
        res.status(400).json({ error: 'contact (phone or identifier) is required' });
        return;
      }

      const name = typeof req.body?.name === 'string' && req.body.name.trim()
        ? req.body.name.trim()
        : contact;
      const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      const location = typeof req.body?.location === 'string' ? req.body.location.trim() : '';
      const type = req.body?.type === 'lead' ? 'lead' : 'customer';

      const db = await deps.getDb();
      await ensureIndexes(db);
      const now = new Date();

      await db.collection<ContactDoc>(COLLECTIONS.contacts).updateOne(
        { workspace: access.workspace, contact },
        {
          $set: { name, email, location, type, updatedAt: now },
          $setOnInsert: { workspace: access.workspace, contact, tags: [], createdAt: now },
        },
        { upsert: true }
      );

      const saved = await db
        .collection<ContactDoc>(COLLECTIONS.contacts)
        .findOne({ workspace: access.workspace, contact });

      res.status(201).json({ ok: true, contact: saved });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/contacts/:contact', async (req: AuthenticatedRequest, res, next) => {
    try {
      const workspace =
        (typeof req.body?.workspace === 'string' && req.body.workspace) || req.query.workspace;
      const access = resolveWorkspaceAccess(req, res, workspace);
      if (!access) return;

      const contact = decodeURIComponent(req.params.contact);
      const updates: Partial<ContactDoc> = { updatedAt: new Date() };
      if (typeof req.body?.name === 'string' && req.body.name.trim()) {
        updates.name = req.body.name.trim();
      }
      if (typeof req.body?.email === 'string') updates.email = req.body.email.trim();
      if (typeof req.body?.location === 'string') updates.location = req.body.location.trim();
      if (req.body?.type === 'customer' || req.body?.type === 'lead') updates.type = req.body.type;
      if (Array.isArray(req.body?.tags)) {
        updates.tags = Array.from(
          new Set(
            (req.body.tags as unknown[])
              .filter((t): t is string => typeof t === 'string')
              .map((t) => t.trim().toLowerCase())
              .filter((t) => t.length > 0 && t.length <= 32)
          )
        ).slice(0, 12);
      }

      const db = await deps.getDb();
      await ensureIndexes(db);
      const now = new Date();

      const saved = await db.collection<ContactDoc>(COLLECTIONS.contacts).findOneAndUpdate(
        { workspace: access.workspace, contact },
        {
          $set: updates,
          $setOnInsert: {
            workspace: access.workspace,
            contact,
            name: updates.name ?? contact,
            email: updates.email ?? '',
            location: updates.location ?? '',
            type: updates.type ?? 'customer',
            tags: updates.tags ?? [],
            createdAt: now,
          },
        },
        { upsert: true, returnDocument: 'after' }
      );

      if (updates.tags) {
        await db
          .collection<ConversationDoc>(COLLECTIONS.conversations)
          .updateOne(
            { workspace: access.workspace, contact },
            { $set: { tags: updates.tags, updatedAt: now } }
          );
      }

      res.status(200).json({ ok: true, contact: saved });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/team/invites/:email', async (req: AuthenticatedRequest, res, next) => {
    try {
      const workspace =
        (typeof req.body?.workspace === 'string' && req.body.workspace) || req.query.workspace;
      const access = resolveWorkspaceAccess(req, res, workspace);
      if (!access) return;
      if (access.role !== 'admin') {
        res.status(403).json({ error: 'Only workspace admins can remove invitations' });
        return;
      }
      const email = decodeURIComponent(req.params.email).trim().toLowerCase();
      const db = await deps.getDb();
      await db
        .collection<TeamInviteDoc>(COLLECTIONS.teamInvites)
        .deleteOne({ workspace: access.workspace, email });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  function defaultWorkspaceSettings(workspace: string): WorkspaceSettingsDoc {
    const defaults: Record<string, { name: string; slug: string; description: string }> = {
      ws_acme: {
        name: 'Acme Store',
        slug: 'acme-store',
        description: 'Your shared inbox for customer support, sales, and operations.',
      },
      ws_globex: {
        name: 'Globex Corp',
        slug: 'globex-corp',
        description: 'Enterprise customer support and incident response workspace.',
      },
    };
    const meta = defaults[workspace] ?? {
      name: workspace.replace(/^ws_/, ''),
      slug: workspace.replace(/_/g, '-'),
      description: 'Shared Switchboard team workspace.',
    };
    const now = new Date();
    return {
      _id: workspace,
      name: meta.name,
      slug: meta.slug,
      description: meta.description,
      timezone: '(UTC+05:30) Asia/Kolkata',
      channels: { pigeonEnabled: true, emailEnabled: false },
      notifications: {
        newMessageAlerts: true,
        assignmentAlerts: true,
        soundEnabled: true,
        dailyDigest: false,
      },
      security: {
        enforcePkce: true,
        sessionTtlHours: 24,
        strictTenantIsolation: true,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  router.get('/workspace/settings', async (req: AuthenticatedRequest, res, next) => {
    try {
      const access = resolveWorkspaceAccess(req, res, req.query.workspace);
      if (!access) return;

      const db = await deps.getDb();
      await ensureIndexes(db);

      const [stored, conversationsCount, invitesCount] = await Promise.all([
        db
          .collection<WorkspaceSettingsDoc>(COLLECTIONS.workspaceSettings)
          .findOne({ _id: access.workspace }),
        db
          .collection<ConversationDoc>(COLLECTIONS.conversations)
          .find({ workspace: access.workspace })
          .toArray(),
        db
          .collection<TeamInviteDoc>(COLLECTIONS.teamInvites)
          .find({ workspace: access.workspace })
          .toArray(),
      ]);

      const settings = stored ?? defaultWorkspaceSettings(access.workspace);
      const dirMemberCount = DIRECTORY_USERS.filter((u) =>
        u.workspaces.some((w) => w.id === access.workspace)
      ).length;
      const rawKey = config.pigeon.apiKeys[access.workspace] ?? '';
      const maskedPigeonKey = rawKey
        ? `${rawKey.slice(0, 8)}...${rawKey.slice(-4)}`
        : 'Not configured';

      res.status(200).json({
        workspace: access.workspace,
        settings: {
          name: settings.name,
          slug: settings.slug,
          description: settings.description,
          timezone: settings.timezone,
          channels: settings.channels,
          notifications: settings.notifications,
          security: settings.security,
          createdAt: settings.createdAt.toISOString(),
        },
        metrics: {
          members: dirMemberCount + invitesCount.length,
          conversations: conversationsCount.length,
        },
        integrations: {
          pigeonUrl: config.pigeon.url,
          maskedPigeonKey,
          webhookPath: '/webhooks/pigeon',
          oidcIssuer: config.oidc.issuer,
          elasticsearchUrl: config.elasticsearchUrl,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/workspace/settings', async (req: AuthenticatedRequest, res, next) => {
    try {
      const workspace =
        (typeof req.body?.workspace === 'string' && req.body.workspace) || req.query.workspace;
      const access = resolveWorkspaceAccess(req, res, workspace);
      if (!access) return;

      if (access.role !== 'admin') {
        res.status(403).json({ error: 'Only workspace admins can update workspace settings' });
        return;
      }

      const db = await deps.getDb();
      await ensureIndexes(db);

      const existing =
        (await db
          .collection<WorkspaceSettingsDoc>(COLLECTIONS.workspaceSettings)
          .findOne({ _id: access.workspace })) ?? defaultWorkspaceSettings(access.workspace);

      const body = (req.body ?? {}) as Partial<WorkspaceSettingsDoc>;
      const nextDoc: WorkspaceSettingsDoc = {
        ...existing,
        ...(typeof body.name === 'string' && body.name.trim()
          ? { name: body.name.trim().slice(0, 80) }
          : {}),
        ...(typeof body.slug === 'string' && body.slug.trim()
          ? { slug: body.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-') }
          : {}),
        ...(typeof body.description === 'string'
          ? { description: body.description.slice(0, 200) }
          : {}),
        ...(typeof body.timezone === 'string' && body.timezone.trim()
          ? { timezone: body.timezone.trim() }
          : {}),
        channels: {
          ...existing.channels,
          ...(body.channels && typeof body.channels.pigeonEnabled === 'boolean'
            ? { pigeonEnabled: body.channels.pigeonEnabled }
            : {}),
          ...(body.channels && typeof body.channels.emailEnabled === 'boolean'
            ? { emailEnabled: body.channels.emailEnabled }
            : {}),
        },
        notifications: {
          ...existing.notifications,
          ...(body.notifications && typeof body.notifications.newMessageAlerts === 'boolean'
            ? { newMessageAlerts: body.notifications.newMessageAlerts }
            : {}),
          ...(body.notifications && typeof body.notifications.assignmentAlerts === 'boolean'
            ? { assignmentAlerts: body.notifications.assignmentAlerts }
            : {}),
          ...(body.notifications && typeof body.notifications.soundEnabled === 'boolean'
            ? { soundEnabled: body.notifications.soundEnabled }
            : {}),
          ...(body.notifications && typeof body.notifications.dailyDigest === 'boolean'
            ? { dailyDigest: body.notifications.dailyDigest }
            : {}),
        },
        security: {
          ...existing.security,
          ...(body.security && typeof body.security.enforcePkce === 'boolean'
            ? { enforcePkce: body.security.enforcePkce }
            : {}),
          ...(body.security && typeof body.security.strictTenantIsolation === 'boolean'
            ? { strictTenantIsolation: body.security.strictTenantIsolation }
            : {}),
        },
        updatedAt: new Date(),
      };

      await db
        .collection<WorkspaceSettingsDoc>(COLLECTIONS.workspaceSettings)
        .updateOne({ _id: access.workspace }, { $set: nextDoc }, { upsert: true });

      res.status(200).json({ ok: true, settings: nextDoc });
    } catch (err) {
      next(err);
    }
  });

  router.get('/reports', async (req: AuthenticatedRequest, res, next) => {
    try {
      const access = resolveWorkspaceAccess(req, res, req.query.workspace);
      if (!access) return;

      const rawDays = Number(req.query.days ?? 7);
      const days = rawDays === 14 || rawDays === 30 ? rawDays : 7;

      const db = await deps.getDb();
      await ensureIndexes(db);

      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - (days - 1));
      start.setHours(0, 0, 0, 0);

      const [conversations, inbound, outbound, invites] = await Promise.all([
        db
          .collection<ConversationDoc>(COLLECTIONS.conversations)
          .find({ workspace: access.workspace })
          .toArray(),
        db
          .collection<InboundMessageDoc>(COLLECTIONS.inboundMessages)
          .find({ workspace: access.workspace, occurredAt: { $gte: start } })
          .toArray(),
        db
          .collection<OutboundMessageDoc>(COLLECTIONS.outboundMessages)
          .find({ workspace: access.workspace, createdAt: { $gte: start } })
          .toArray(),
        db
          .collection<TeamInviteDoc>(COLLECTIONS.teamInvites)
          .find({ workspace: access.workspace })
          .toArray(),
      ]);

      const inRangeConvs = conversations.filter((c) => c.lastActivityAt >= start);
      const closedCount = inRangeConvs.filter((c) => c.status === 'closed').length;
      const unassignedCount = inRangeConvs.filter(
        (c) => c.status === 'open' && c.assignee === null
      ).length;
      const assignedOpenCount = inRangeConvs.filter(
        (c) => c.status === 'open' && c.assignee !== null
      ).length;
      const totalConversations = inRangeConvs.length;
      const resolutionRate =
        totalConversations > 0 ? Math.round((closedCount / totalConversations) * 1000) / 10 : 0;

      // Response & resolution timings per contact
      const firstInByContact = new Map<string, number>();
      for (const m of inbound) {
        const t = m.occurredAt.getTime();
        const prev = firstInByContact.get(m.contact);
        if (prev === undefined || t < prev) firstInByContact.set(m.contact, t);
      }
      const firstOutByContact = new Map<string, number>();
      for (const m of outbound) {
        const t = m.createdAt.getTime();
        const prev = firstOutByContact.get(m.contact);
        if (prev === undefined || t < prev) firstOutByContact.set(m.contact, t);
      }

      const firstResponseDeltas: number[] = [];
      const resolutionDeltas: number[] = [];
      for (const c of inRangeConvs) {
        const inMs = firstInByContact.get(c.contact);
        const outMs = firstOutByContact.get(c.contact);
        if (inMs !== undefined && outMs !== undefined && outMs >= inMs) {
          firstResponseDeltas.push(Math.round((outMs - inMs) / 1000));
        }
        if (c.status === 'closed') {
          const base = inMs ?? c.createdAt.getTime();
          if (c.updatedAt.getTime() >= base) {
            resolutionDeltas.push(Math.round((c.updatedAt.getTime() - base) / 1000));
          }
        }
      }

      const avg = (arr: number[]) =>
        arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

      // Daily buckets
      const buckets = Array.from({ length: days }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return {
          key: d.toISOString().slice(0, 10),
          label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          conversations: 0,
          messages: 0,
          resolved: 0,
          respSamples: [] as number[],
          resSamples: [] as number[],
        };
      });
      const bucketByDay = new Map(buckets.map((b) => [b.key, b]));

      for (const c of inRangeConvs) {
        const key = c.lastActivityAt.toISOString().slice(0, 10);
        const b = bucketByDay.get(key);
        if (!b) continue;
        b.conversations++;
        if (c.status === 'closed') {
          b.resolved++;
          const base = firstInByContact.get(c.contact) ?? c.createdAt.getTime();
          if (c.updatedAt.getTime() >= base) {
            b.resSamples.push(Math.round((c.updatedAt.getTime() - base) / 1000));
          }
        }
        const inMs = firstInByContact.get(c.contact);
        const outMs = firstOutByContact.get(c.contact);
        if (inMs !== undefined && outMs !== undefined && outMs >= inMs) {
          b.respSamples.push(Math.round((outMs - inMs) / 1000));
        }
      }
      for (const m of inbound) {
        const b = bucketByDay.get(m.occurredAt.toISOString().slice(0, 10));
        if (b) b.messages++;
      }
      for (const m of outbound) {
        const b = bucketByDay.get(m.createdAt.toISOString().slice(0, 10));
        if (b) b.messages++;
      }

      // Agent directory + performance ranking
      const agentDirectory = new Map<string, { name: string; email: string }>();
      for (const u of DIRECTORY_USERS) {
        if (u.workspaces.some((w) => w.id === access.workspace)) {
          agentDirectory.set(u.sub, { name: u.name, email: u.email });
        }
      }
      for (const inv of invites) {
        agentDirectory.set(inv.email.toLowerCase(), { name: inv.name, email: inv.email });
      }
      for (const c of inRangeConvs) {
        if (c.assignee && !agentDirectory.has(c.assignee)) {
          agentDirectory.set(c.assignee, { name: c.assignee, email: '' });
        }
      }

      const agentStats = Array.from(agentDirectory.entries())
        .map(([id, meta]) => {
          const mine = inRangeConvs.filter((c) => c.assignee === id);
          const resolved = mine.filter((c) => c.status === 'closed').length;
          const resTimes = mine
            .filter((c) => c.status === 'closed')
            .map((c) => {
              const base = firstInByContact.get(c.contact) ?? c.createdAt.getTime();
              return Math.max(0, Math.round((c.updatedAt.getTime() - base) / 1000));
            });
          return {
            id,
            name: meta.name,
            email: meta.email,
            conversations: mine.length,
            resolved,
            resolutionRate: mine.length > 0 ? Math.round((resolved / mine.length) * 100) : 0,
            avgResolutionSec: avg(resTimes),
          };
        })
        .sort((a, b) => b.conversations - a.conversations || b.resolved - a.resolved);

      res.status(200).json({
        workspace: access.workspace,
        days,
        summary: {
          totalConversations,
          resolved: closedCount,
          open: assignedOpenCount + unassignedCount,
          assignedOpen: assignedOpenCount,
          unassigned: unassignedCount,
          resolutionRate,
          avgFirstResponseSec: avg(firstResponseDeltas),
          avgResolutionSec: avg(resolutionDeltas),
        },
        volumeSeries: buckets.map((b) => ({
          date: b.key,
          label: b.label,
          conversations: b.conversations,
          messages: b.messages,
          resolved: b.resolved,
          avgFirstResponseSec: avg(b.respSamples),
          avgResolutionSec: avg(b.resSamples),
        })),
        agentPerformance: agentStats,
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
