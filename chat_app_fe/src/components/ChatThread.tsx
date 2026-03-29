import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ChatMessage } from "../types";
import { ChatAttachmentsList } from "./ChatAttachments";
import { ConfirmModal } from "./ConfirmModal";

/** Within this distance of the bottom counts as “at bottom” for auto-scroll. */
const BOTTOM_STICK_PX = 80;
/** Scroll position from top below this loads older history (infinite scroll). */
const NEAR_TOP_LOAD_PX = 120;

type Props = {
  messages: ChatMessage[];
  selfId: string;
  /** Resets scroll / “prepend” detection when the conversation changes. */
  conversationKey: string;
  /** Show sender names for others' messages in group rooms */
  variant?: "dm" | "room";
  /** If set, "Delete" is shown when this returns true (own message or moderator). */
  canDeleteMessage?: (m: ChatMessage) => boolean;
  onDeleteMessage?: (messageId: string) => void;
  /** Own messages only; opens composer to edit the message text. */
  onStartEdit?: (m: ChatMessage) => void;
  /** Reply / reference: compose a reply to this message. */
  onReply?: (m: ChatMessage) => void;
  /** Persistent history: more rows exist on the server. */
  hasMoreHistory?: boolean;
  loadingOlderHistory?: boolean;
  onLoadOlder?: () => void;
};

function formatTime(ts: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts));
}

function fileNameFromDataUrl(dataUrl: string): string {
  const mimeMatch = /^data:([^;]+);/.exec(dataUrl);
  const mime = mimeMatch?.[1] ?? "image/png";
  const ext =
    mime === "image/jpeg"
      ? "jpg"
      : mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : mime === "image/gif"
            ? "gif"
            : "png";
  return `image.${ext}`;
}

function downloadDataUrl(dataUrl: string) {
  const name = fileNameFromDataUrl(dataUrl);
  fetch(dataUrl)
    .then((r) => r.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = name;
      a.click();
    });
}

function DownloadChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

function InlineDataUrlImage({
  imageDataUrl,
  mine,
}: {
  imageDataUrl: string;
  mine: boolean;
}) {
  return (
    <div className="mb-2 flex flex-col gap-1.5">
      <img
        src={imageDataUrl}
        alt=""
        className="max-h-64 max-w-full rounded-lg object-contain"
      />
      <button
        type="button"
        onClick={() => downloadDataUrl(imageDataUrl)}
        className={`inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition ${
          mine
            ? "bg-white/15 text-white hover:bg-white/25"
            : "bg-black/20 text-slate-200 hover:bg-black/30"
        }`}
      >
        <DownloadChevronIcon className="shrink-0 opacity-90" />
        Download
      </button>
    </div>
  );
}

export function ChatThread({
  messages,
  selfId,
  conversationKey,
  variant = "dm",
  canDeleteMessage,
  onDeleteMessage,
  onStartEdit,
  onReply,
  hasMoreHistory = false,
  loadingOlderHistory = false,
  onLoadOlder,
}: Props) {
  /** True if the user is within BOTTOM_THRESHOLD px of the bottom (sticky stream). */
  const userAtBottomRef = useRef(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const prevListHeadRef = useRef<{
    firstId: string | undefined;
    scrollHeight: number;
  }>({ firstId: undefined, scrollHeight: 0 });
  const skipScrollToBottomRef = useRef(false);
  const loadOlderCooldownRef = useRef(false);
  const [deleteMessageId, setDeleteMessageId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    prevListHeadRef.current = { firstId: undefined, scrollHeight: 0 };
    userAtBottomRef.current = true;
  }, [conversationKey]);

  useEffect(() => {
    setDeleteMessageId(null);
  }, [conversationKey]);

  useLayoutEffect(() => {
    const el = scrollRootRef.current;
    if (!el || messages.length === 0) return;
    const firstId = messages[0].id;
    const prev = prevListHeadRef.current;
    if (
      prev.firstId !== undefined &&
      firstId !== prev.firstId &&
      prev.scrollHeight > 0
    ) {
      el.scrollTop += el.scrollHeight - prev.scrollHeight;
      skipScrollToBottomRef.current = true;
    }
    prevListHeadRef.current = {
      firstId,
      scrollHeight: el.scrollHeight,
    };
  }, [messages]);

  const lastMessageId = messages.at(-1)?.id;
  useLayoutEffect(() => {
    if (messages.length === 0) return;
    if (skipScrollToBottomRef.current) {
      skipScrollToBottomRef.current = false;
      return;
    }
    const last = messages[messages.length - 1];
    const shouldStick =
      userAtBottomRef.current ||
      (last != null && last.senderId === selfId);
    if (!shouldStick) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    userAtBottomRef.current = true;
  }, [messages, lastMessageId, selfId]);

  const onScroll = useCallback(() => {
    const el = scrollRootRef.current;
    if (!el) return;

    const distFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    userAtBottomRef.current = distFromBottom <= BOTTOM_STICK_PX;

    if (
      !hasMoreHistory ||
      loadingOlderHistory ||
      !onLoadOlder ||
      loadOlderCooldownRef.current
    ) {
      return;
    }
    const hasOverflow = el.scrollHeight > el.clientHeight + 8;
    if (!hasOverflow) return;
    if (el.scrollTop > NEAR_TOP_LOAD_PX) return;
    loadOlderCooldownRef.current = true;
    onLoadOlder();
  }, [hasMoreHistory, loadingOlderHistory, onLoadOlder]);

  useEffect(() => {
    if (!loadingOlderHistory) {
      loadOlderCooldownRef.current = false;
    }
  }, [loadingOlderHistory]);

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-slate-500 sm:p-8">
        No messages yet. Say hello — or send a photo or file.
      </div>
    );
  }

  return (
    <div
      ref={scrollRootRef}
      onScroll={onScroll}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4"
    >
      {hasMoreHistory ? (
        <div className="flex shrink-0 flex-col items-center gap-2 pb-1">
          {loadingOlderHistory ? (
            <span className="text-xs text-slate-500">Loading older…</span>
          ) : onLoadOlder ? (
            <button
              type="button"
              onClick={() => onLoadOlder()}
              className="rounded-lg border border-white/15 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
            >
              Load older messages
            </button>
          ) : null}
        </div>
      ) : null}
      {messages.map((m) => {
        const mine = m.senderId === selfId;
        return (
          <div
            key={m.id}
            className={`flex ${mine ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[min(85%,28rem)] rounded-md px-3 py-2 ${
                mine
                  ? "rounded-ee-sm bg-sky-800 text-white"
                  : "rounded-es-sm bg-slate-800 text-slate-100"
              }`}
            >
              {variant === "room" &&
              !mine &&
              (m.senderDisplayName || m.senderUsername) ? (
                <p className="mb-1 text-xs font-medium text-sky-200/95">
                  {m.senderDisplayName ?? m.senderUsername}
                  {m.senderUsername && m.senderDisplayName ? (
                    <span className="font-normal text-slate-400">
                      {" "}
                      @{m.senderUsername}
                    </span>
                  ) : null}
                </p>
              ) : null}
              {m.replyTo ? (
                <blockquote
                  className={`mb-2.5 rounded-md border border-white/15 bg-black/25 py-2 pl-3 pr-2 text-xs leading-snug shadow-inner ring-1 ring-inset ring-white/5 ${
                    mine
                      ? "border-l-white/50 border-l-[3px] bg-sky-950/40 text-sky-50/95"
                      : "border-l-sky-400/70 border-l-[3px] bg-slate-950/50 text-slate-300"
                  }`}
                >
                  <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                    Quoted message
                  </p>
                  <p className="font-medium text-slate-200">
                    <span className="text-slate-100">
                      {m.replyTo.senderDisplayName ??
                        m.replyTo.senderUsername ??
                        "Someone"}
                    </span>
                    {m.replyTo.senderUsername && m.replyTo.senderDisplayName ? (
                      <span className="font-normal text-slate-500">
                        {" "}
                        @{m.replyTo.senderUsername}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words border-t border-white/10 pt-1.5 text-[0.8rem] text-slate-400 italic">
                    {m.replyTo.deleted
                      ? "This message was deleted."
                      : m.replyTo.preview}
                  </p>
                </blockquote>
              ) : null}
              {m.imageDataUrl ? (
                <InlineDataUrlImage
                  imageDataUrl={m.imageDataUrl}
                  mine={mine}
                />
              ) : null}
              {m.attachments?.length ? (
                <ChatAttachmentsList items={m.attachments} mine={mine} />
              ) : null}
              {m.text ? (
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {m.text}
                </p>
              ) : null}
              <div
                className={`mt-1 flex items-center gap-3 text-[0.65rem] tabular-nums opacity-70 ${
                  mine ? "justify-end" : "justify-between"
                }`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  {onReply ? (
                    <button
                      type="button"
                      className={
                        mine
                          ? "text-white/80 underline-offset-2 hover:underline"
                          : "text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
                      }
                      onClick={() => onReply(m)}
                    >
                      Reply
                    </button>
                  ) : null}
                  {mine && onStartEdit ? (
                    <button
                      type="button"
                      className="text-white/80 underline-offset-2 hover:underline"
                      onClick={() => onStartEdit(m)}
                    >
                      Edit
                    </button>
                  ) : null}
                  {canDeleteMessage?.(m) && onDeleteMessage ? (
                    <button
                      type="button"
                      className={
                        mine
                          ? "text-white/80 underline-offset-2 hover:underline"
                          : "text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
                      }
                      onClick={() => setDeleteMessageId(m.id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </span>
                <span
                  className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 ${
                    mine ? "text-right text-white/70" : "text-left"
                  }`}
                >
                  <span>{formatTime(m.createdAt)}</span>
                  {m.editedAt != null ? (
                    <span
                      className={
                        mine ? "font-normal text-white/45" : "text-slate-500"
                      }
                    >
                      edited
                    </span>
                  ) : null}
                </span>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
      <ConfirmModal
        open={deleteMessageId != null && !!onDeleteMessage}
        title="Delete message"
        message="Remove this message for everyone in this chat?"
        confirmLabel="Delete"
        destructive
        busy={deleteBusy}
        onClose={() => {
          if (!deleteBusy) setDeleteMessageId(null);
        }}
        onConfirm={async () => {
          if (!deleteMessageId || !onDeleteMessage) return;
          setDeleteBusy(true);
          try {
            await onDeleteMessage(deleteMessageId);
            setDeleteMessageId(null);
          } finally {
            setDeleteBusy(false);
          }
        }}
        zClassName="z-[100]"
      />
    </div>
  );
}
