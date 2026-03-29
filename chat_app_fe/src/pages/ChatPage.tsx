import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  apiAcceptFriendRequest,
  apiBanUser,
  apiCancelOutgoingFriendRequest,
  apiDeclineFriendRequest,
  apiIncomingFriendRequests,
  apiListFriends,
  apiListUsers,
  apiOutgoingFriendRequests,
  apiRemoveFriend,
  apiSendFriendRequest,
} from "../lib/api";
import { usePresenceMap } from "../hooks/usePresenceMap";
import { useUnreadSummary } from "../hooks/useUnreadSummary";
import type {
  FriendRequestIncoming,
  FriendRequestOutgoing,
  PublicUser,
} from "../types";
import { contactPresenceFromMap } from "../types";
import { ActiveChat } from "../components/ActiveChat";
import { FriendsListPanel } from "../components/FriendsListPanel";

function nu(u: {
  id: string;
  username: string;
  displayName: string;
  createdAt: string | number | Date;
  avatarUrl?: string | null;
}): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    createdAt:
      typeof u.createdAt === "number"
        ? u.createdAt
        : new Date(u.createdAt).getTime(),
    avatarUrl: u.avatarUrl ?? null,
  };
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export default function ChatPage() {
  const { session } = useAuth();

  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestIncoming[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestOutgoing[]>([]);
  const [discoverUsers, setDiscoverUsers] = useState<PublicUser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const presenceByUserId = usePresenceMap(!!session);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [friendsDrawerOpen, setFriendsDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { refresh: refreshUnread, unreadByFriendId } = useUnreadSummary();

  const refreshContacts = useCallback(async () => {
    if (!session) return;
    setLoadError(null);
    try {
      const [inh, out, fr, disc] = await Promise.all([
        apiIncomingFriendRequests(),
        apiOutgoingFriendRequests(),
        apiListFriends(),
        apiListUsers(),
      ]);
      setIncoming(
        inh.map((r) => ({
          ...r,
          requester: nu(r.requester as Parameters<typeof nu>[0]),
        })),
      );
      setOutgoing(
        out.map((r) => ({
          ...r,
          addressee: nu(r.addressee as Parameters<typeof nu>[0]),
        })),
      );
      setFriends(fr);
      setDiscoverUsers(disc);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Could not load contacts.",
      );
    }
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    if (!session) return;
    void refreshContacts().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [session, refreshContacts]);

  useEffect(() => {
    if (selectedId && !friends.some((f) => f.id === selectedId)) {
      setSelectedId(null);
    }
  }, [friends, selectedId]);

  const selected = useMemo(() => {
    if (friends.length === 0) return null;
    const first = friends[0];
    if (first == null) return null;
    const id =
      selectedId != null && friends.some((f) => f.id === selectedId)
        ? selectedId
        : first.id;
    return friends.find((f) => f.id === id) ?? null;
  }, [friends, selectedId]);

  function handleSelectFriend(id: string) {
    setSelectedId(id);
    setFriendsDrawerOpen(false);
  }

  const handleConversationOpened = useCallback(() => {
    void refreshUnread();
  }, [refreshUnread]);

  async function withBusy<T>(fn: () => Promise<T>): Promise<T> {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  if (!session) return null;

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-slate-950 text-slate-100">
      {friendsDrawerOpen ? (
        <button
          type="button"
          aria-label="Close friends list"
          className="fixed inset-0 z-30 bg-black/55 backdrop-blur-[1px] md:hidden"
          onClick={() => setFriendsDrawerOpen(false)}
        />
      ) : null}

      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
        {selected ? (
          <ActiveChat
            key={selected.id}
            session={session}
            friend={selected}
            friendPresence={contactPresenceFromMap(
              selected.id,
              presenceByUserId,
            )}
            onOpenFriends={() => setFriendsDrawerOpen(true)}
            onConversationOpened={handleConversationOpened}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-3 md:hidden">
              <button
                type="button"
                onClick={() => setFriendsDrawerOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-slate-800/80 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
              >
                <MenuIcon />
                Contacts
              </button>
            </header>
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="max-w-sm text-slate-500">
                Accept friend requests or send one by username. Then open a
                friend here to chat.
              </p>
              <button
                type="button"
                className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 md:hidden"
                onClick={() => setFriendsDrawerOpen(true)}
              >
                Open contacts
              </button>
            </div>
          </div>
        )}
      </section>

      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-[min(22rem,94vw)] max-w-full flex-col border-white/10 bg-slate-900 shadow-2xl transition-transform duration-200 ease-out md:relative md:z-0 md:w-96 md:max-w-none md:shrink-0 md:translate-x-0 md:border-s md:shadow-none ${
          friendsDrawerOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
        }`}
      >
        <FriendsListPanel
          friends={friends}
          incoming={incoming}
          outgoing={outgoing}
          discoverUsers={discoverUsers}
          error={loadError}
          selectedId={selected?.id ?? null}
          unreadByFriendId={unreadByFriendId}
          presenceByUserId={presenceByUserId}
          displayName={session.displayName}
          busy={busy}
          onSelectFriend={handleSelectFriend}
          onSendFriendRequest={async (body) => {
            await withBusy(() => apiSendFriendRequest(body));
            await refreshContacts();
          }}
          onAcceptRequest={async (id) => {
            await withBusy(() => apiAcceptFriendRequest(id));
            await refreshContacts();
          }}
          onDeclineRequest={async (id) => {
            await withBusy(() => apiDeclineFriendRequest(id));
            await refreshContacts();
          }}
          onCancelOutgoing={async (id) => {
            await withBusy(() => apiCancelOutgoingFriendRequest(id));
            await refreshContacts();
          }}
          onRemoveFriend={async (peerId) => {
            await withBusy(() => apiRemoveFriend(peerId));
            await refreshContacts();
          }}
          onBanUser={async (body) => {
            await withBusy(() => apiBanUser(body));
            await refreshContacts();
          }}
          onRequestFromDiscover={async (u) => {
            await withBusy(() =>
              apiSendFriendRequest({ userId: u.id, message: undefined }),
            );
            await refreshContacts();
          }}
        />
      </aside>
    </div>
  );
}
