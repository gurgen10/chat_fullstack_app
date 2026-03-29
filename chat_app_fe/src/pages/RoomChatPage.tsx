import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ActiveRoomChat } from "../components/ActiveRoomChat";
import { RoomChatRightPanel } from "../components/RoomChatRightPanel";
import { useAuth } from "../hooks/useAuth";
import { usePresenceMap } from "../hooks/usePresenceMap";
import { useUnreadSummary } from "../hooks/useUnreadSummary";
import { apiGetRoom, apiJoinRoom } from "../lib/api";
import type { RoomDetail } from "../types";

export default function RoomChatPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { session } = useAuth();
  const presenceByUserId = usePresenceMap(!!session);
  const { refresh: refreshUnread, unreadByRoomId } = useUnreadSummary();
  const onRoomConversationOpened = useCallback(() => {
    void refreshUnread();
  }, [refreshUnread]);
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [roomPanelOpen, setRoomPanelOpen] = useState(false);
  const [membersVersion, setMembersVersion] = useState(0);

  useEffect(() => {
    setRoomPanelOpen(false);
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !session) return;
    let cancelled = false;
    setLoadError(null);
    setRoom(null);
    apiGetRoom(roomId)
      .then((r) => {
        if (!cancelled) setRoom(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Could not load room.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, session]);

  const refreshRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      const r = await apiGetRoom(roomId);
      setRoom(r);
      setMembersVersion((v) => v + 1);
    } catch {
      /* ignore */
    }
  }, [roomId]);

  if (!session) return null;
  if (!roomId) return <Navigate to="/rooms" replace />;

  async function handleJoin() {
    if (!roomId) return;
    setBusy(true);
    setLoadError(null);
    try {
      await apiJoinRoom(roomId);
      const r = await apiGetRoom(roomId);
      setRoom(r);
      setMembersVersion((v) => v + 1);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not join.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError && !room) {
    return (
      <div className="min-h-0 bg-slate-950 px-4 py-8 text-slate-100">
        <div className="mx-auto max-w-lg space-y-4 text-center">
          <p className="text-red-300">{loadError}</p>
          <p className="text-sm text-slate-500">
            Private rooms are only visible to members. Public rooms can be
            opened from the catalog.
          </p>
          <Link to="/rooms" className="text-violet-400 hover:text-violet-300">
            ← Back to rooms
          </Link>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-slate-950 text-slate-400">
        Loading…
      </div>
    );
  }

  if (room.type === "dm") {
    return (
      <div className="min-h-0 bg-slate-950 px-4 py-8 text-slate-100">
        <div className="mx-auto max-w-lg space-y-4 text-center">
          <p className="text-slate-400">
            One-to-one chats live under Messages, not group rooms.
          </p>
          <Link to="/chat" className="text-violet-400 hover:text-violet-300">
            Open messages
          </Link>
        </div>
      </div>
    );
  }

  if (room.youAreBannedFromRoom) {
    return (
      <div className="min-h-0 bg-slate-950 px-4 py-8 text-slate-100">
        <div className="mx-auto max-w-lg space-y-4 text-center">
          <p>You are banned from this room.</p>
          <Link to="/rooms" className="text-violet-400 hover:text-violet-300">
            ← Back to rooms
          </Link>
        </div>
      </div>
    );
  }

  if (room.type === "public" && !room.youAreMember) {
    return (
      <div className="min-h-0 bg-slate-950 px-4 py-8 text-slate-100">
        <div className="mx-auto max-w-lg space-y-4">
          <Link
            to="/rooms"
            className="text-sm text-violet-400 hover:text-violet-300"
          >
            ← Back to rooms
          </Link>
          <h1 className="text-xl font-semibold text-white">
            {room.name ?? "Room"}
          </h1>
          <p className="text-sm text-slate-400">
            {room.description || "No description."}
          </p>
          <p className="text-xs text-slate-500">
            Owner: {room.createdBy.displayName} (@{room.createdBy.username})
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleJoin()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {busy ? "Joining…" : "Join room to chat"}
          </button>
        </div>
      </div>
    );
  }

  if (!room.youAreMember) {
    return (
      <div className="min-h-0 bg-slate-950 px-4 py-8 text-slate-100">
        <div className="mx-auto max-w-lg space-y-4 text-center">
          <p className="text-slate-400">
            You are not a member of this private room. Ask an owner or moderator
            to invite you.
          </p>
          <Link to="/rooms" className="text-violet-400 hover:text-violet-300">
            ← Back to rooms
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-row bg-slate-950">
      {roomPanelOpen ? (
        <button
          type="button"
          aria-label="Close room panel"
          className="fixed inset-0 z-30 bg-black/55 backdrop-blur-[1px] md:hidden"
          onClick={() => setRoomPanelOpen(false)}
        />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ActiveRoomChat
          session={session}
          room={room}
          roomId={roomId}
          onRoomRefresh={refreshRoom}
          onConversationOpened={onRoomConversationOpened}
          onOpenRoomPanel={() => setRoomPanelOpen(true)}
        />
      </div>
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-[min(22rem,94vw)] max-w-full flex-col bg-slate-900 shadow-2xl transition-transform duration-200 ease-out md:relative md:z-0 md:w-72 md:max-w-none md:shrink-0 md:translate-x-0 md:shadow-none ${
          roomPanelOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
        }`}
      >
        <RoomChatRightPanel
          roomId={roomId}
          currentRoomName={room.name}
          selfId={session.userId}
          presenceByUserId={presenceByUserId}
          unreadByRoomId={unreadByRoomId}
          membersVersion={membersVersion}
        />
      </aside>
    </div>
  );
}
