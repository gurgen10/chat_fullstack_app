import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";

/** Spec §3.4 — keep in sync with server */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Must match server: UTF-8 byte length of message text (plain / multiline / emoji). */
export const MAX_MESSAGE_TEXT_BYTES = 3072;

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

type SendPayload = {
  text: string;
  imageDataUrl?: string;
  file?: File;
  replyToMessageId?: string;
};

type Props = {
  onSend: (payload: SendPayload) => void | Promise<void>;
  disabled?: boolean;
  uploading?: boolean;
  /** When set, the next send includes `replyToMessageId`. */
  replyingTo?: ChatMessage | null;
  onCancelReply?: () => void;
};

function ImageIcon({ className }: { className?: string }) {
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
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

function PaperclipIcon({ className }: { className?: string }) {
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
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.38-8.38a4 4 0 0 1 5.66 5.66l-8.38 8.38a2 2 0 0 1-2.83-2.83l7.07-7.07" />
    </svg>
  );
}

function SmileIcon({ className }: { className?: string }) {
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
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" x2="9.01" y1="9" y2="9" />
      <line x1="15" x2="15.01" y1="9" y2="9" />
    </svg>
  );
}

/** Unicode emoji palette (no images); OS / IME emoji also work in the textarea. */
const EMOJI_GROUPS: { id: string; label: string; chars: string[] }[] = [
  {
    id: "smileys",
    label: "Smileys",
    chars: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😅",
      "🤣",
      "😂",
      "🙂",
      "😉",
      "😊",
      "🥰",
      "😍",
      "🤔",
      "😴",
      "😭",
      "😤",
      "🙄",
      "😬",
      "🤝",
      "👋",
      "🙏",
      "💬",
      "🔥",
      "✨",
      "❤️",
      "💙",
      "👍",
      "👎",
      "🎉",
      "✅",
      "❌",
    ],
  },
  {
    id: "hearts",
    label: "Hearts",
    chars: [
      "❤️",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🖤",
      "🤍",
      "🤎",
      "💔",
      "❣️",
      "💕",
      "💞",
      "💓",
      "💗",
      "💖",
      "💘",
      "💝",
    ],
  },
  {
    id: "objects",
    label: "Objects",
    chars: [
      "📎",
      "📷",
      "🖼️",
      "📁",
      "📄",
      "✉️",
      "🔔",
      "🔒",
      "🔑",
      "⭐",
      "🌟",
      "☀️",
      "🌙",
      "☕",
      "🍕",
      "🎂",
      "🎁",
      "🎮",
      "🎵",
      "⚽",
    ],
  },
];

export function MessageComposer({
  onSend,
  disabled,
  uploading,
  replyingTo,
  onCancelReply,
}: Props) {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPanelRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!emojiOpen) return;
    function onDocPointerDown(ev: PointerEvent) {
      const t = ev.target as Node;
      if (emojiPanelRef.current?.contains(t)) return;
      setEmojiOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [emojiOpen]);

  function insertEmoji(emoji: string) {
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? text.length;
    const end = ta?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    setError(null);
    const pos = start + emoji.length;
    setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    }, 0);
  }

  function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(file);
    });
  }

  async function attachImageFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image too large (max 3 MB).");
      return;
    }
    try {
      setPendingFile(null);
      const dataUrl = await readFile(file);
      setImagePreview(dataUrl);
    } catch {
      setError("Could not read that file.");
    }
  }

  function attachBinaryFile(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError("File too large (max 20 MB).");
      return;
    }
    setImagePreview(null);
    setPendingFile(file);
  }

  async function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await attachImageFile(file);
  }

  function onAnyFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    attachBinaryFile(file);
  }

  async function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const cd = e.clipboardData;
    if (!cd) return;

    const fromFiles = cd.files?.[0];
    if (fromFiles) {
      e.preventDefault();
      if (fromFiles.type.startsWith("image/")) {
        await attachImageFile(fromFiles);
      } else {
        attachBinaryFile(fromFiles);
      }
      return;
    }

    for (let i = 0; i < cd.items.length; i++) {
      const item = cd.items[i];
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (!file) continue;
      if (file.type.startsWith("image/")) {
        e.preventDefault();
        await attachImageFile(file);
        return;
      }
      e.preventDefault();
      attachBinaryFile(file);
      return;
    }
  }

  function validateTextBytes(s: string): string | null {
    if (utf8ByteLength(s) > MAX_MESSAGE_TEXT_BYTES) {
      return `Message text must be at most ${MAX_MESSAGE_TEXT_BYTES} bytes (UTF-8), including emoji and newlines.`;
    }
    return null;
  }

  async function submit() {
    const trimmed = text;
    const replyId = replyingTo?.id;

    if (pendingFile) {
      const capErr = trimmed ? validateTextBytes(trimmed) : null;
      if (capErr) {
        setError(capErr);
        return;
      }
      setError(null);
      await onSend({
        text: trimmed,
        file: pendingFile,
        replyToMessageId: replyId,
      });
      setText("");
      setPendingFile(null);
      onCancelReply?.();
      return;
    }
    if (!trimmed.trim() && !imagePreview) return;

    const textErr = trimmed.length > 0 ? validateTextBytes(trimmed) : null;
    if (textErr) {
      setError(textErr);
      return;
    }

    await onSend({
      text: trimmed,
      imageDataUrl: imagePreview ?? undefined,
      replyToMessageId: replyId,
    });
    setText("");
    setImagePreview(null);
    onCancelReply?.();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !uploading) void submit();
    }
  }

  const busy = disabled || uploading;
  const canSend =
    pendingFile || imagePreview || text.trim().length > 0;

  const replyLabel = replyingTo
    ? replyingTo.senderDisplayName ??
      replyingTo.senderUsername ??
      "Message"
    : "";

  return (
    <div className="border-t border-white/10 bg-slate-950/80 px-3 py-3 sm:px-4">
      <div className="mx-auto w-full max-w-4xl">
        <p className="mb-2 hidden text-xs text-slate-500 sm:block">
          Multiline (Shift+Enter for new line, Enter to send). Emoji: picker
          button, system keyboard, or paste. Attach images or files via buttons
          or paste. Optional caption with attachment. Max{" "}
          {MAX_MESSAGE_TEXT_BYTES} bytes UTF-8 per message; image 3 MB or file 20
          MB.
        </p>
        <p className="mb-2 text-[0.7rem] leading-snug text-slate-500 sm:hidden">
          Shift+Enter new line · Enter sends ·{" "}
          <span className="whitespace-nowrap">Image / File / Emoji</span>
        </p>
        {error ? (
          <p className="mb-2 text-sm text-red-300">{error}</p>
        ) : null}
        {replyingTo ? (
          <div className="mb-3 flex items-start justify-between gap-2 rounded-lg border border-sky-500/30 border-l-[3px] border-l-sky-400/80 bg-slate-900/80 py-2 pl-3 pr-2 shadow-inner ring-1 ring-inset ring-white/5">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-sky-300/95">
                Reply to {replyLabel}
              </p>
              <p className="mt-1 line-clamp-2 border-t border-white/10 pt-1.5 text-xs italic text-slate-400">
                {replyingTo.text?.trim()
                  ? replyingTo.text
                  : replyingTo.attachments?.length
                    ? "📎 Attachment"
                    : replyingTo.imageDataUrl
                      ? "📷 Image"
                      : "…"}
              </p>
            </div>
            {onCancelReply ? (
              <button
                type="button"
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
                onClick={() => onCancelReply()}
              >
                Cancel
              </button>
            ) : null}
          </div>
        ) : null}
        {imagePreview ? (
          <div className="relative mb-3 inline-block max-h-40 overflow-hidden rounded-xl border border-white/10 bg-slate-900/50">
            <img
              src={imagePreview}
              alt="Attachment preview"
              className="max-h-40 max-w-full object-contain"
            />
            <button
              type="button"
              className="absolute right-2 top-2 rounded-lg bg-black/70 px-2 py-1 text-xs font-medium text-white hover:bg-black/90"
              onClick={() => setImagePreview(null)}
            >
              Remove image
            </button>
          </div>
        ) : null}
        {pendingFile ? (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-sm text-slate-200">
            <span className="min-w-0 truncate" title={pendingFile.name}>
              {pendingFile.name}
            </span>
            <button
              type="button"
              className="shrink-0 rounded-lg bg-black/40 px-2 py-1 text-xs font-medium text-white hover:bg-black/60"
              onClick={() => setPendingFile(null)}
            >
              Remove
            </button>
          </div>
        ) : null}

        <label className="sr-only" htmlFor="chat-message">
          Message
        </label>
        <textarea
          ref={textareaRef}
          id="chat-message"
          rows={4}
          disabled={busy}
          placeholder="Type your message…"
          enterKeyHint="send"
          autoComplete="off"
          className="mb-3 min-h-[6.5rem] w-full resize-y rounded-xl border border-white/10 bg-slate-900/90 px-3 py-3 text-[15px] leading-relaxed text-white placeholder:text-slate-500 outline-none ring-sky-500/30 focus:border-sky-500/40 focus:ring-2 disabled:opacity-50 sm:min-h-[5.5rem]"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
        />

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={onImageChange}
        />
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          onChange={onAnyFileChange}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex flex-wrap gap-2">
            <div className="relative" ref={emojiPanelRef}>
              <button
                type="button"
                disabled={busy}
                aria-expanded={emojiOpen}
                aria-haspopup="dialog"
                aria-label="Insert emoji"
                onClick={() => setEmojiOpen((o) => !o)}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-slate-800/80 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50 sm:inline-flex sm:justify-start"
              >
                <SmileIcon className="shrink-0 text-sky-300" />
                Emoji
              </button>
              {emojiOpen ? (
                <div
                  className="absolute bottom-full left-0 z-50 mb-2 w-[min(100vw-2rem,20rem)] rounded-xl border border-white/15 bg-slate-900 p-2 shadow-2xl shadow-black/50"
                  role="dialog"
                  aria-label="Emoji picker"
                >
                  <div
                    className="mb-2 flex gap-1 overflow-x-auto border-b border-white/10 pb-2"
                    role="tablist"
                  >
                    {EMOJI_GROUPS.map((g, i) => (
                      <button
                        key={g.id}
                        type="button"
                        role="tab"
                        aria-selected={emojiTab === i}
                        className={`shrink-0 rounded-lg px-2 py-1 text-xs font-medium ${
                          emojiTab === i
                            ? "bg-sky-600/40 text-white"
                            : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                        }`}
                        onClick={() => setEmojiTab(i)}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <div
                    className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto p-0.5 sm:grid-cols-9"
                    role="tabpanel"
                  >
                    {EMOJI_GROUPS[emojiTab]?.chars.map((ch) => (
                      <button
                        key={`${emojiTab}-${ch}`}
                        type="button"
                        className="flex h-9 items-center justify-center rounded-lg text-lg leading-none hover:bg-white/10"
                        title={ch}
                        aria-label={`Insert ${ch}`}
                        onClick={() => {
                          insertEmoji(ch);
                          setEmojiOpen(false);
                        }}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => imageInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-slate-800/80 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50 sm:inline-flex sm:justify-start"
            >
              <ImageIcon className="shrink-0 text-sky-300" />
              Image
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-slate-800/80 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50 sm:inline-flex sm:justify-start"
            >
              <PaperclipIcon className="shrink-0 text-sky-300" />
              File
            </button>
          </div>
          <button
            type="button"
            disabled={busy || !canSend}
            onClick={() => void submit()}
            className="w-full rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-900/25 transition hover:bg-sky-500 disabled:opacity-50 sm:w-auto sm:min-w-[7.5rem]"
          >
            {uploading ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
