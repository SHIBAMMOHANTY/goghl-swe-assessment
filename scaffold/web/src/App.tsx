import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addNote,
  claimConversation,
  fetchConversations,
  fetchMe,
  fetchMessages,
  fetchStats,
  logout,
  releaseConversation,
  sendReply,
  setConversationStatus,
  type ConversationSummary,
  type InboxStats,
  type MeResponse,
  type TimelineItem,
} from './api';
import { AssignmentsView } from './components/AssignmentsView';
import { InboxDashboard, type InboxFilter } from './components/InboxDashboard';
import { LoginScreen } from './components/LoginScreen';
import { ProfileSettingsView } from './components/ProfileSettingsView';
import { SearchView } from './components/SearchView';
import { TopNav, type ActiveScreen } from './components/TopNav';
import {
  computeKeyId,
  decryptNote,
  encryptNote,
  generateWorkspaceKey,
  getStoredWorkspaceKey,
  setStoredWorkspaceKey,
} from './crypto';

interface WsEventFrame {
  seq: number;
  type: string;
  contact?: string;
  client_ref?: string;
  status?: 'queued' | 'sent' | 'delivered' | 'failed';
}

function makeClientRef(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ui_${crypto.randomUUID()}`;
  }
  return `ui_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function App() {
  const [me, setMe] = useState<MeResponse | null | undefined>(undefined);
  const [workspace, setWorkspace] = useState<string>('');
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('inbox');
  const [filter, setFilter] = useState<InboxFilter>('open');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [selectedConversationDetail, setSelectedConversationDetail] =
    useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<TimelineItem[]>([]);
  const [decryptedNotes, setDecryptedNotes] = useState<Record<string, string>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const [lastSeq, setLastSeq] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [workspaceKey, setWorkspaceKey] = useState<string>('');
  const [keyId, setKeyId] = useState<string | null>(null);

  const lastSeqByWsRef = useRef<Record<string, number>>({});
  const selectedContactRef = useRef<string | null>(null);
  selectedContactRef.current = selectedContact;

  useEffect(() => {
    fetchMe()
      .then((user) => {
        setMe(user);
        if (user && user.workspaces.length > 0) {
          setWorkspace((prev) => prev || user.workspaces[0].id);
        }
      })
      .catch((err) => {
        setMe(null);
        setError(err instanceof Error ? err.message : 'Failed to load session');
      });
  }, []);

  useEffect(() => {
    if (!workspace) return;
    setWorkspaceKey(getStoredWorkspaceKey(workspace) ?? '');
    setLastSeq(lastSeqByWsRef.current[workspace]);
  }, [workspace]);

  useEffect(() => {
    if (!workspaceKey) {
      setKeyId(null);
      return;
    }
    void computeKeyId(workspaceKey)
      .then(setKeyId)
      .catch(() => setKeyId(null));
  }, [workspaceKey]);

  const loadInbox = useCallback(
    async (cursor?: string | null) => {
      if (!workspace) return;
      try {
        const apiStatus =
          filter === 'closed' ? 'closed' : filter === 'all' ? 'all' : 'open';
        const [convRes, statsRes] = await Promise.all([
          fetchConversations({ workspace, status: apiStatus, cursor }),
          cursor ? Promise.resolve(null) : fetchStats(workspace),
        ]);
        setConversations((prev) =>
          cursor ? [...prev, ...convRes.conversations] : convRes.conversations
        );
        setNextCursor(convRes.nextCursor);
        if (statsRes) setStats(statsRes);
        if (!cursor && convRes.conversations.length > 0 && !selectedContactRef.current) {
          setSelectedContact(convRes.conversations[0].contact);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversations');
      }
    },
    [workspace, filter]
  );

  const loadThread = useCallback(
    async (contact: string | null) => {
      if (!workspace || !contact) {
        setMessages([]);
        setSelectedConversationDetail(null);
        return;
      }
      try {
        const res = await fetchMessages(workspace, contact);
        setSelectedConversationDetail(res.conversation);
        setMessages(res.messages);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load messages');
      }
    },
    [workspace]
  );

  useEffect(() => {
    if (!workspace || !selectedContact) {
      setDecryptedNotes({});
      return;
    }
    const notes = messages.filter(
      (m): m is Extract<TimelineItem, { kind: 'note' }> => m.kind === 'note'
    );
    if (notes.length === 0 || !workspaceKey) {
      setDecryptedNotes({});
      return;
    }

    let cancelled = false;
    void Promise.all(
      notes.map(async (n) => {
        try {
          const text = await decryptNote(
            workspaceKey,
            workspace,
            selectedContact,
            n.ciphertext,
            n.iv
          );
          return [n.id, text] as const;
        } catch {
          return [n.id, '[Unable to decrypt with current workspace key]'] as const;
        }
      })
    ).then((entries) => {
      if (!cancelled) {
        setDecryptedNotes(Object.fromEntries(entries));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [messages, workspaceKey, workspace, selectedContact]);

  useEffect(() => {
    setSelectedContact(null);
    setSelectedConversationDetail(null);
    setMessages([]);
    void loadInbox(null);
  }, [workspace, filter, loadInbox]);

  useEffect(() => {
    void loadThread(selectedContact);
  }, [selectedContact, loadThread]);

  useEffect(() => {
    if (!me || !workspace) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (cancelled) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const after = lastSeqByWsRef.current[workspace];
      const qs = new URLSearchParams({ workspace });
      if (typeof after === 'number') qs.set('after', String(after));

      socket = new WebSocket(`${proto}//${window.location.host}/ws?${qs.toString()}`);

      socket.onopen = () => {
        if (!cancelled) setWsConnected(true);
      };

      socket.onclose = () => {
        if (cancelled) return;
        setWsConnected(false);
        reconnectTimer = window.setTimeout(connect, 1500);
      };

      socket.onmessage = (evt) => {
        let frame: WsEventFrame;
        try {
          frame = JSON.parse(String(evt.data)) as WsEventFrame;
        } catch {
          return;
        }
        if (typeof frame.seq === 'number') {
          const next = Math.max(lastSeqByWsRef.current[workspace] ?? 0, frame.seq);
          lastSeqByWsRef.current[workspace] = next;
          setLastSeq(next);
        }

        void loadInbox(null);
        if (frame.contact && frame.contact === selectedContactRef.current) {
          if (frame.type === 'message.status' && frame.client_ref && frame.status) {
            setMessages((prev) =>
              prev.map((m) =>
                m.kind === 'outbound' && m.clientRef === frame.client_ref
                  ? { ...m, status: frame.status! }
                  : m
              )
            );
          } else {
            void loadThread(frame.contact);
          }
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      setWsConnected(false);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, [me, workspace, loadInbox, loadThread]);

  const visibleConversations = useMemo(() => {
    if (!me) return conversations;
    if (filter === 'mine') return conversations.filter((c) => c.assignee === me.sub);
    if (filter === 'unassigned') return conversations.filter((c) => c.assignee === null);
    return conversations;
  }, [conversations, filter, me]);

  const activeConversation = useMemo(
    () =>
      selectedConversationDetail ??
      conversations.find((c) => c.contact === selectedContact) ??
      null,
    [selectedConversationDetail, conversations, selectedContact]
  );

  if (me === undefined) {
    return (
      <div className="min-h-screen bg-slate-50 grid place-items-center text-sm text-slate-500">
        Loading session…
      </div>
    );
  }

  if (me === null) {
    return <LoginScreen error={error} />;
  }

  async function runAction(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await Promise.all([loadInbox(null), loadThread(selectedContact)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendReply(text: string) {
    if (!workspace || !selectedContact) return;
    await runAction(() => sendReply(workspace, selectedContact, text, makeClientRef()));
  }

  async function handleAddEncryptedNote(plaintext: string) {
    if (!workspace || !selectedContact) return;
    await runAction(async () => {
      let key = workspaceKey;
      if (!key) {
        key = await generateWorkspaceKey();
        setStoredWorkspaceKey(workspace, key);
        setWorkspaceKey(key);
      }
      const encrypted = await encryptNote(key, workspace, selectedContact, plaintext);
      await addNote(workspace, selectedContact, encrypted);
    });
  }

  function openInInbox(contact: string) {
    setFilter('all');
    setSelectedContact(contact);
    setActiveScreen('inbox');
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopNav
        me={me}
        workspace={workspace}
        onWorkspaceChange={(ws) => {
          setWorkspace(ws);
          setError(null);
        }}
        wsConnected={wsConnected}
        activeScreen={activeScreen}
        onNavigate={setActiveScreen}
        onLogout={() => {
          void logout().then(() => setMe(null));
        }}
      />

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {activeScreen === 'inbox' && (
        <InboxDashboard
          me={me}
          workspace={workspace}
          filter={filter}
          onFilterChange={setFilter}
          stats={stats}
          conversations={visibleConversations}
          nextCursor={nextCursor}
          onLoadMore={() => void loadInbox(nextCursor)}
          selectedContact={selectedContact}
          activeConversation={activeConversation}
          onSelectContact={setSelectedContact}
          messages={messages}
          decryptedNotes={decryptedNotes}
          workspaceKey={workspaceKey}
          keyId={keyId}
          busy={busy}
          onSendReply={handleSendReply}
          onAddEncryptedNote={handleAddEncryptedNote}
          onClaim={() =>
            selectedContact
              ? runAction(() => claimConversation(workspace, selectedContact))
              : Promise.resolve()
          }
          onRelease={() =>
            selectedContact
              ? runAction(() => releaseConversation(workspace, selectedContact))
              : Promise.resolve()
          }
          onToggleStatus={(action) =>
            selectedContact
              ? runAction(() => setConversationStatus(workspace, selectedContact, action))
              : Promise.resolve()
          }
          onOpenSettings={() => setActiveScreen('settings')}
        />
      )}

      {activeScreen === 'assignments' && (
        <AssignmentsView
          me={me}
          workspace={workspace}
          conversations={conversations}
          busy={busy}
          onClaim={(contact) => runAction(() => claimConversation(workspace, contact))}
          onRelease={(contact) => runAction(() => releaseConversation(workspace, contact))}
          onOpenConversation={openInInbox}
        />
      )}

      {activeScreen === 'search' && (
        <SearchView workspace={workspace} onOpenConversation={openInInbox} />
      )}

      {activeScreen === 'settings' && (
        <ProfileSettingsView
          me={me}
          workspace={workspace}
          workspaceKey={workspaceKey}
          keyId={keyId}
          wsConnected={wsConnected}
          lastSeq={lastSeq}
          onWorkspaceKeyChange={setWorkspaceKey}
        />
      )}
    </div>
  );
}
