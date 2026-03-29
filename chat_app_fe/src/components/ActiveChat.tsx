import { useCallback, useEffect, useState } from "react";
import {
  apiDeleteMessage,
  apiMarkDmRead,
  apiMessages,
  apiPatchMessage,
  apiUploadDmAttachment,
  normalizeChatMessage,
} from "../lib/api";
import {
  appendIncomingMessage,
  mergeLatestPageWithExisting,
  mergeOlderMessages,
} from "../lib/chatMessages";
import { connectSocket, getSocket } from "../lib/socketClient";
import type {
  ChatMessage,
  ContactPresence,
  PublicUser,
  Session,
} from "../types";
import { ChatThread } from "./ChatThread";
import { MessageComposer } from "./MessageComposer";

function threadId(userA: string, userB: string): string {
  return [userA, userB].sort().join(":");
}

type Props = {
  session: Session;
  friend: PublicUser;
  friendPresence: ContactPresence;
  onOpenFriends?: () => void;
  /** Called after marking this DM read (refresh global unread badges). */
  onConversationOpened?: () => void;
};

const READONLY_HINT: Record<string, string> = {
  not_friends:
    "You can only message friends. This history is read-only until you’re friends again.",
  blocked:
    "Messaging is blocked between you. History below is read-only.",
};

export function ActiveChat({
  session,
  friend,
  friendPresence,
  onOpenFriends,
  onConversationOpened,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [canSend, setCanSend] = useState(true);
  const [readOnlyReason, setReadOnlyReason] = useState<
    "not_friends" | "blocked" | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(
    null,
  );
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    setEditingMessage(null);
  }, [friend.id]);

  useEffect(() => {
    let cancelled = false;
    apiMessages(friend.id)
      .then((thread) => {
        if (!cancelled) {
          setLoadError(null);
          // Merge so a slow initial fetch cannot overwrite messages already
          // appended from real-time `chat:message` (e.g. first send while loading).
          setMessages((prev) =>
            mergeLatestPageWithExisting(prev, thread.messages),
          );
          setHasMore(thread.hasMore);
          setCanSend(thread.canSend);
          setReadOnlyReason(thread.readOnlyReason);
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
  }, [friend.id]);

  useEffect(() => {
    let cancelled = false;
    void apiMarkDmRead(friend.id).then(() => {
      if (!cancelled) onConversationOpened?.();
    });
    return () => {
      cancelled = true;
    };
  }, [friend.id, onConversationOpened]);

  const syncLatestFromServer = useCallback(async () => {
    try {
      const thread = await apiMessages(friend.id);
      setMessages((prev) =>
        mergeLatestPageWithExisting(prev, thread.messages),
      );
      setHasMore(thread.hasMore);
      setCanSend(thread.canSend);
      setReadOnlyReason(thread.readOnlyReason);
      await apiMarkDmRead(friend.id);
      onConversationOpened?.();
    } catch {
      /* best-effort after reconnect */
    }
  }, [friend.id, onConversationOpened]);

  useEffect(() => {
    const socket = getSocket() ?? connectSocket();
    const tid = threadId(session.userId, friend.id);

    const onMessage = (msg: ChatMessage) => {
      if (msg.threadId !== tid) return;
      setMessages((prev) => appendIncomingMessage(prev, msg));
      void apiMarkDmRead(friend.id).then(() => onConversationOpened?.());
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
      void syncLatestFromServer();
    };

    socket.on("chat:message", onMessage);
    socket.on("message:deleted", onDeleted);
    socket.on("message:edited", onEdited);
    socket.on("reconnect", onReconnect);
    return () => {
      socket.off("chat:message", onMessage);
      socket.off("message:deleted", onDeleted);
      socket.off("message:edited", onEdited);
      socket.off("reconnect", onReconnect);
    };
  }, [session.userId, friend.id, syncLatestFromServer, onConversationOpened]);

  const loadOlderMessages = useCallback(async () => {
    if (!hasMore || loadingOlder) return;
    const oldest = messages[0]?.id;
    if (!oldest) return;
    setLoadingOlder(true);
    setSendError(null);
    try {
      const thread = await apiMessages(friend.id, { before: oldest });
      setMessages((prev) => mergeOlderMessages(prev, thread.messages));
      setHasMore(thread.hasMore);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Could not load older messages.",
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, loadingOlder, messages, friend.id]);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    try {
      await apiDeleteMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Could not delete message.");
    }
  }, []);

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
          const saved = await apiUploadDmAttachment(
            friend.id,
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
        "chat:send",
        {
          peerId: friend.id,
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
    [friend.id],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-3 sm:px-4">
        {onOpenFriends ? (
          <button
            type="button"
            onClick={onOpenFriends}
            className="flex items-center gap-2 rounded-md border border-white/15 bg-slate-800/80 px-2.5 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 md:hidden"
            aria-label="Open friends list"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="max-w-[5rem] truncate sm:max-w-none">Friends</span>
          </button>
        ) : null}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold">
          {friend.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium text-white">{friend.displayName}</h2>
          <p className="truncate text-xs text-slate-500">
            @{friend.username}
            {friendPresence === "online" ? (
              <span className="ms-2 text-emerald-400">Online</span>
            ) : friendPresence === "afk" ? (
              <span className="ms-2 text-amber-400">AFK</span>
            ) : (
              <span className="ms-2 text-slate-500">Offline</span>
            )}
          </p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        {loadError ? (
          <p className="p-4 text-center text-sm text-red-300">{loadError}</p>
        ) : (
          <ChatThread
            conversationKey={friend.id}
            messages={messages}
            selfId={session.userId}
            variant="dm"
            canDeleteMessage={(m) => m.senderId === session.userId}
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
      {!loadError && !canSend && readOnlyReason ? (
        <p className="shrink-0 border-t border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-center text-sm text-amber-100/95">
          {READONLY_HINT[readOnlyReason]}
        </p>
      ) : null}
      {sendError ? (
        <p className="bg-red-500/10 px-4 py-2 text-center text-sm text-red-200">
          {sendError}
        </p>
      ) : null}
      <MessageComposer
        key={friend.id}
        onSend={sendMessage}
        disabled={!canSend}
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
