import { useEffect, useState } from "react";
import { resolveApiUrl } from "../lib/api";
import { getToken } from "../lib/authStorage";
import type { ChatAttachment } from "../types";

function fullUrl(path: string) {
  return resolveApiUrl(path);
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadAuthenticatedFile(
  downloadPath: string,
  fileName: string,
): Promise<void> {
  const token = getToken();
  const res = await fetch(fullUrl(downloadPath), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

function DownloadIcon({ className }: { className?: string }) {
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

function AuthImage({
  attachment,
  mine,
}: {
  attachment: ChatAttachment;
  mine: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    const ac = new AbortController();
    const url = fullUrl(attachment.downloadUrl);
    (async () => {
      try {
        const token = getToken();
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: ac.signal,
        });
        if (!res.ok || revoked) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!revoked) setSrc(objectUrl);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      revoked = true;
      ac.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.downloadUrl]);

  async function onDownload() {
    setDownloading(true);
    try {
      await downloadAuthenticatedFile(
        attachment.downloadUrl,
        attachment.fileName,
      );
    } finally {
      setDownloading(false);
    }
  }

  if (!src) {
    return (
      <div
        className={`h-32 w-full max-w-xs animate-pulse rounded-lg ${
          mine ? "bg-white/15" : "bg-black/20"
        }`}
      />
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <img
        src={src}
        alt={attachment.fileName}
        className="max-h-64 max-w-full rounded-lg object-contain"
      />
      <button
        type="button"
        onClick={() => void onDownload()}
        disabled={downloading}
        className={`inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition disabled:opacity-60 ${
          mine
            ? "bg-white/15 text-white hover:bg-white/25"
            : "bg-black/20 text-slate-200 hover:bg-black/30"
        }`}
      >
        <DownloadIcon className="shrink-0 opacity-90" />
        {downloading ? "Saving…" : "Download"}
      </button>
    </div>
  );
}

function FileDownload({
  attachment,
  mine,
}: {
  attachment: ChatAttachment;
  mine: boolean;
}) {
  const [busy, setBusy] = useState(false);
  async function onDownload(e: React.MouseEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await downloadAuthenticatedFile(
        attachment.downloadUrl,
        attachment.fileName,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <a
      href={fullUrl(attachment.downloadUrl)}
      onClick={onDownload}
      className={`inline-flex max-w-full break-all rounded-lg border px-3 py-2 text-sm font-medium ${
        mine
          ? "border-white/25 bg-white/10 text-white hover:bg-white/15"
          : "border-white/15 bg-black/15 text-slate-100 hover:bg-black/25"
      }`}
    >
      <span className="min-w-0 flex-1">
        {busy ? "Loading… " : null}
        {attachment.fileName}
      </span>
      <span className="ms-2 shrink-0 text-xs opacity-70">
        ({formatBytes(attachment.sizeBytes)})
      </span>
    </a>
  );
}

export function ChatAttachmentsList({
  items,
  mine,
}: {
  items: ChatAttachment[];
  mine: boolean;
}) {
  return (
    <div className="mb-2 flex flex-col gap-2">
      {items.map((a) =>
        a.mimeType.startsWith("image/") ? (
          <AuthImage key={a.id} attachment={a} mine={mine} />
        ) : (
          <FileDownload key={a.id} attachment={a} mine={mine} />
        ),
      )}
    </div>
  );
}
