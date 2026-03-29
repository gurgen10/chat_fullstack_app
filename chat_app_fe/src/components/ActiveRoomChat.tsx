import { useCallback, useEffect, useState } from "react";
import {
  apiDeleteMessage,
  apiMarkRoomRead,
  apiPatchMessage,
  apiRoomMessages,
  apiUploadRoomAttachment,
  normalizeChatMessage,
} from "../lib/api";
import {
  appendIncomingMessage,
  mergeLatestPageWithExisting,
  mergeOlderMessages,
} from "../lib/chatMessages";
import { connectSocket, getSocket } from "../lib/socketClient";
import type { ChatMessage, RoomDetail, Session } from "../types";
import { ChatThread } from "./ChatThread";
import { MessageComposer } from "./MessageComposer";
import { RoomModerationPanel } from "./RoomModerationPanel";

type Props = {
  session: Session;
  room: RoomDetail;
  roomId: string;
  onRoomRefresh?: () => void;
  /** After marking this room read (refresh global unread badges). */
  onConversationOpened?: () => void;
  /** Mobile: open room list / members side panel. */
  onOpenRoomPanel?: () => void;
};

function roomThreadId(roomId: string) {
  return `room:${roomId}`;
}

function isRoomStaffRole(role: string | null) {
  return role === "owner" || role === "admin" || role === "mod";
}

export function ActiveRoomChat({
  session,
  room,
  roomId,
  onRoomRefresh,
  onConversationOpened,
  onOpenRoomPanel,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [modOpen, setModOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(
    null,
  );
  const [editSaving, setEditSaving] = useState(false);

  const tid = roomThreadId(roomId);

  useEffect(() => {
    setEditingMessage(null);
  }, [roomId]);

  const isRoomStaff = isRoomStaffRole(room.myRole);
  const isRoomOwnerOrAdmin =
    room.myRole === "owner" || room.myRole === "admin";
  const isPlatformStaff =
    session.platformRole === "admin" ||
    session.platformRole === "moderator";

  const canDeleteMessage = useCallback(
    (m: ChatMessage) => {
      if (m.senderId === session.userId) return true;
      if (isRoomOwnerOrAdmin || isPlatformStaff) return true;
      return false;
    },
    [session.userId, isRoomOwnerOrAdmin, isPlatformStaff],
  );

  const loadOlderMessages = useCallback(async () => {
    if (!hasMore || loadingOlder) return;
    const oldest = messages[0]?.id;
    if (!oldest) return;
    setLoadingOlder(true);
    setSendError(null);
    try {
      const thread = await apiRoomMessages(roomId, { before: oldest });
      setMessages((prev) => mergeOlderMessages(prev, thread.messages));
      setHasMore(thread.hasMore);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Could not load older messages.",
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, loadingOlder, messages, roomId]);

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      try {
        await apiDeleteMessage(messageId);
        setMessages((prev) => prev.filter((x) => x.id !== messageId));
      } catch (e) {
        setSendError(e instanceof Error ? e.message : "Could not delete message.");
      }
    },
    [],
  );

  const handleEditMessage = useCallback(async (messageId: string, text: string) => {
    try {
      const updated = await apiPatchMessage(messageId, { text });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? updated : m)),
      );
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Could not save your edit.";
      setSendError(msg);
      throw e;
    }
  }, []);

  const saveEditedMessage = useCallback(
    async (messageId: string, text: string) => {
      setEditSaving(true);
      try {
        await handleEditMessage(messageId, text);
        setEditingMessage(null);
      } finally {
        setEditSaving(false);
      }
    },
    [handleEditMessage],
  );

  const syncLatestFromServer = useCallback(async () => {
    try {
      const thread = await apiRoomMessages(roomId);
      setMessages((prev) =>
        mergeLatestPageWithExisting(prev, thread.messages),
      );
      setHasMore(thread.hasMore);
      await apiMarkRoomRead(roomId);
      onConversationOpened?.();
    } catch {
      /* best-effort after reconnect */
    }
  }, [roomId, onConversationOpened]);

  useEffect(() => {
    let cancelled = false;
    void apiMarkRoomRead(roomId).then(() => {
      if (!cancelled) onConversationOpened?.();
    });
    return () => {
      cancelled = true;
    };
  }, [roomId, onConversationOpened]);

  useEffect(() => {
    let cancelled = false;
    apiRoomMessages(roomId)
      .then((thread) => {
        if (!cancelled) {
          setLoadError(null);
          setMessages((prev) =>
            mergeLatestPageWithExisting(prev, thread.messages),
          );
          setHasMore(thread.hasMore);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Could not load messages.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() => {
    const socket = getSocket() ?? connectSocket();

    const emitSubscribe = () => {
      socket.emit("room:subscribe", { roomId }, (res: unknown) => {
        if (
          res &&
          typeof res === "object" &&
          "error" in res &&
          (res as { error?: string | null }).error
        ) {
          setSendError(String((res as { error: string }).error));
        }
      });
    };

    emitSubscribe();

    const onMessage = (msg: ChatMessage) => {
      if (msg.threadId !== tid) return;
      setMessages((prev) => appendIncomingMessage(prev, msg));
      void apiMarkRoomRead(roomId).then(() => onConversationOpened?.());
    };

    const onDeleted = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const p = payload as { messageId?: string; threadId?: string };
      if (p.threadId !== tid || !p.messageId) return;
      setMessages((prev) => prev.filter((m) => m.id !== p.messageId));
      setEditingMessage((em) => (em?.id === p.messageId ? null : em));
    };

    const onEdited = (msg: ChatMessage) => {
      if (msg.threadId !== tid) return;
      const n = normalizeChatMessage(msg);
      setMessages((prev) =>
        prev.some((x) => x.id === n.id)
          ? prev.map((x) => (x.id === n.id ? n : x))
          : prev,
      );
    };

    const onReconnect = () => {
      emitSubscribe();
      void syncLatestFromServer();
    };

    socket.on("chat:message", onMessage);
    socket.on("message:deleted", onDeleted);
    socket.on("message:edited", onEdited);
    socket.on("reconnect", onReconnect);
    return () => {
      socket.emit("room:unsubscribe", { roomId });
      socket.off("chat:message", onMessage);
      socket.off("message:deleted", onDeleted);
      socket.off("message:edited", onEdited);
      socket.off("reconnect", onReconnect);
    };
  }, [roomId, tid, syncLatestFromServer, onConversationOpened]);

  const sendMessage = useCallback(
    async (payload: {
      text: string;
      imageDataUrl?: string;
      file?: File;
      replyToMessageId?: string;
    }) => {
      if (payload.file) {
        setSendError(null);
        setUploading(true);
        try {
          const saved = await apiUploadRoomAttachment(
            roomId,
            payload.file,
            payload.text || undefined,
            payload.replyToMessageId,
          );
          setMessages((prev) => appendIncomingMessage(prev, saved));
        } catch (err) {
          setSendError(
            err instanceof Error ? err.message : "Could not send file.",
          );
        } finally {
          setUploading(false);
        }
        return;
      }

      if (!payload.text && !payload.imageDataUrl) return;
      setSendError(null);
      const socket = getSocket() ?? connectSocket();
      socket.emit(
        "room:send",
        {
          roomId,
          text: payload.text,
          imageDataUrl: payload.imageDataUrl,
          replyToMessageId: payload.replyToMessageId,
        },
        (res: unknown) => {
          if (
            res &&
            typeof res === "object" &&
            "error" in res &&
            (res as { error?: string | null }).error
          ) {
            setSendError(String((res as { error: string }).error));
          }
        },
      );
    },
    [roomId],
  );

  const title = room.name ?? "Room";
  const subtitle =
    room.type === "public"
      ? "Public room"
      : room.type === "private"
        ? "Private room"
        : "";
  const ownerLine = `Owner: ${room.createdBy.displayName} (@${room.createdBy.username})`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {modOpen ? (
        <RoomModerationPanel
          roomId={roomId}
          myRole={room.myRole}
          selfId={session.userId}
          onClose={() => setModOpen(false)}
          onChanged={() => onRoomRefresh?.()}
        />
      ) : null}
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-3 sm:px-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold">
          {title.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium text-white">{title}</h2>
          <p className="truncate text-xs text-slate-500">
            {subtitle}
            {room.memberCount != null ? (
              <span className="ms-2 text-slate-500">
                · {room.memberCount} member
                {room.memberCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </p>
          <p className="truncate text-[0.7rem] text-slate-600">{ownerLine}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onOpenRoomPanel ? (
            <button
              type="button"
              onClick={onOpenRoomPanel}
              className="rounded-lg border border-white/15 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 md:hidden"
            >
              Room & members
            </button>
          ) : null}
          {isRoomStaff ? (
            <button
              type="button"
              onClick={() => setModOpen(true)}
              className="shrink-0 rounded-lg border border-white/15 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              Moderation
            </button>
          ) : null}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        {loadError ? (
          <p className="p-4 text-center text-sm text-red-300">{loadError}</p>
        ) : (
          <ChatThread
            conversationKey={roomId}
            messages={messages}
            selfId={session.userId}
            variant="room"
            canDeleteMessage={canDeleteMessage}
            onDeleteMessage={handleDeleteMessage}
            onStartEdit={(m) => {
              setReplyingTo(null);
              setEditingMessage(m);
            }}
            onReply={(m) => {
              setEditingMessage(null);
              setReplyingTo(m);
            }}
            hasMoreHistory={hasMore}
            loadingOlderHistory={loadingOlder}
            onLoadOlder={loadOlderMessages}
          />
        )}
      </div>
      {sendError ? (
        <p className="bg-red-500/10 px-4 py-2 text-center text-sm text-red-200">
          {sendError}
        </p>
      ) : null}
      <MessageComposer
        key={roomId}
        onSend={sendMessage}
        disabled={!!loadError}
        uploading={uploading}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        editingMessage={editingMessage}
        onCancelEdit={() => setEditingMessage(null)}
        onSaveEdit={saveEditedMessage}
        editBusy={editSaving}
      />
    </div>
  );
}
