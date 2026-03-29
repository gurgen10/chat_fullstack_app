import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  apiDeleteProfileAvatar,
  apiLogout,
  apiUploadProfileAvatar,
  sessionFromPublicUser,
} from "../lib/api";
import { getStoredAuth } from "../lib/authStorage";
import { useUnreadSummary } from "../hooks/useUnreadSummary";
import type { PlatformRole, Session } from "../types";
import { ConfirmModal } from "./ConfirmModal";
import { UnreadBadge } from "./UnreadBadge";
import { UserAvatar } from "./UserAvatar";

type Props = {
  session: Session;
};

function navRow(active: boolean) {
  return `flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
    active
      ? "bg-sky-800/90 text-white"
      : "text-slate-200 hover:bg-slate-800"
  }`;
}

export function ProfileMenu({ session }: Props) {
  const { signIn, signOut } = useAuth();
  const location = useLocation();
  const { dmsUnreadTotal, roomsUnreadTotal } = useUnreadSummary();
  const totalUnread = dmsUnreadTotal + roomsUnreadTotal;
  const [open, setOpen] = useState(false);
  const [removePhotoConfirmOpen, setRemovePhotoConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cacheKey, setCacheKey] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const path = location.pathname;
  const activeMessages = path === "/chat" || path.startsWith("/chat/");
  const activeRooms = path === "/rooms" || path.startsWith("/rooms/");
  const activeAccount = path === "/account" || path.startsWith("/account/");
  const activeAdmin = path === "/admin" || path.startsWith("/admin/");
  const showAdmin =
    session.platformRole === "admin" || session.platformRole === "moderator";

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function mergeSession(user: {
    id: string;
    username: string;
    displayName: string;
    createdAt: number;
    avatarUrl?: string | null;
    role?: PlatformRole;
  }) {
    const stored = getStoredAuth();
    if (!stored) return;
    signIn({
      ...stored,
      session: sessionFromPublicUser({
        ...user,
        role: user.role ?? stored.session.platformRole,
      }),
    });
    setCacheKey(Date.now());
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const user = await apiUploadProfileAvatar(file);
      mergeSession(user);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemoveProfilePhoto() {
    setBusy(true);
    try {
      const user = await apiDeleteProfileAvatar();
      mergeSession(user);
      setRemovePhotoConfirmOpen(false);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setOpen(false);
    try {
      await apiLogout();
    } catch {
      /* still sign out locally */
    }
    signOut();
  }

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          totalUnread > 0
            ? `Menu, ${totalUnread} unread`
            : "Menu"
        }
        title={
          totalUnread > 0
            ? `${totalUnread} unread (messages and rooms)`
            : "Account menu"
        }
      >
        <span className="relative inline-flex shrink-0">
          <UserAvatar
            displayName={session.displayName}
            avatarUrl={session.avatarUrl}
            cacheKey={cacheKey}
            size="md"
          />
          {totalUnread > 0 ? (
            <span
              className="pointer-events-none absolute -right-1 -top-1 z-10"
              aria-hidden
            >
              <UnreadBadge
                count={totalUnread}
                className="!min-h-[1.125rem] !min-w-[1.125rem] !bg-red-500 !px-1 !text-[0.6rem] !leading-none ring-2 ring-slate-800"
              />
            </span>
          ) : null}
        </span>
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-1 min-w-[min(100vw-2rem,13rem)] rounded-md border border-slate-600/80 bg-slate-900 py-1 shadow-lg"
          role="menu"
        >
          <Link
            to="/chat"
            role="menuitem"
            className={navRow(activeMessages)}
            onClick={() => setOpen(false)}
          >
            <span className="min-w-0 flex-1">Messages</span>
            <UnreadBadge count={dmsUnreadTotal} />
          </Link>
          <Link
            to="/rooms"
            role="menuitem"
            className={navRow(activeRooms)}
            onClick={() => setOpen(false)}
          >
            <span className="min-w-0 flex-1">Rooms</span>
            <UnreadBadge count={roomsUnreadTotal} />
          </Link>
          <Link
            to="/account"
            role="menuitem"
            className={navRow(activeAccount)}
            onClick={() => setOpen(false)}
          >
            Account
          </Link>
          {showAdmin ? (
            <Link
              to="/admin"
              role="menuitem"
              className={navRow(activeAdmin)}
              onClick={() => setOpen(false)}
            >
              Admin
            </Link>
          ) : null}

          <div className="my-1 border-t border-slate-700" />

          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              fileRef.current?.click();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            Change photo…
          </button>
          {session.avatarUrl ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setRemovePhotoConfirmOpen(true);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              Remove photo
            </button>
          ) : null}

          <div className="my-1 border-t border-slate-700" />

          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => void onLogout()}
            className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            Log out
          </button>
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={onPickFile}
      />

      <ConfirmModal
        open={removePhotoConfirmOpen}
        title="Remove profile photo?"
        message="Your profile picture will be removed. You can upload a new one anytime."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
        busy={busy}
        onConfirm={confirmRemoveProfilePhoto}
        onClose={() => {
          if (!busy) setRemovePhotoConfirmOpen(false);
        }}
      />
    </div>
  );
}
