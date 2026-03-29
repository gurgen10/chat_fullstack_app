import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  contactPresenceFromMap,
  type ContactPresence,
  type FriendRequestIncoming,
  type FriendRequestOutgoing,
  type PublicUser,
} from "../types";
import { ConfirmModal } from "./ConfirmModal";
import { Modal } from "./Modal";
import { UnreadBadge } from "./UnreadBadge";
import { UserAvatar } from "./UserAvatar";

/** Max length for username and request note/message in friend-request dialogs. */
const FRIEND_REQ_FIELD_MAX = 255;

type Props = {
  friends: PublicUser[];
  incoming: FriendRequestIncoming[];
  outgoing: FriendRequestOutgoing[];
  discoverUsers: PublicUser[];
  error: string | null;
  selectedId: string | null;
  /** Unread message counts for friends (personal dialogs). */
  unreadByFriendId?: Record<string, number>;
  presenceByUserId: Record<string, "online" | "afk">;
  displayName: string;
  busy: boolean;
  onSelectFriend: (id: string) => void;
  onSendFriendRequest: (input: {
    username?: string;
    userId?: string;
    message?: string;
  }) => Promise<void>;
  onAcceptRequest: (id: string) => Promise<void>;
  onDeclineRequest: (id: string) => Promise<void>;
  onCancelOutgoing: (id: string) => Promise<void>;
  onRemoveFriend: (peerId: string) => Promise<void>;
  onBanUser: (input: { username?: string; userId?: string }) => Promise<void>;
  onRequestFromDiscover: (user: PublicUser, message?: string) => Promise<void>;
  title?: string;
};

type PendingFriendAction =
  | { kind: "remove"; user: PublicUser }
  | { kind: "ban"; user: PublicUser };

function friendActionConfirm(p: PendingFriendAction): {
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
} {
  if (p.kind === "remove") {
    return {
      title: "Remove friend",
      message: `Remove ${p.user.displayName} (@${p.user.username}) from your friend list? You can send a new request later.`,
      confirmLabel: "Remove",
      destructive: false,
    };
  }
  return {
    title: "Ban user",
    message: `Ban ${p.user.displayName} (@${p.user.username})? They will not be able to message you and your friendship will end.`,
    confirmLabel: "Ban",
    destructive: true,
  };
}

function MoreVerticalIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function FriendsListPanel({
  friends,
  incoming,
  outgoing,
  discoverUsers,
  error,
  selectedId,
  unreadByFriendId,
  presenceByUserId,
  displayName,
  busy,
  onSelectFriend,
  onSendFriendRequest,
  onAcceptRequest,
  onDeclineRequest,
  onCancelOutgoing,
  onRemoveFriend,
  onBanUser,
  onRequestFromDiscover,
  title = "Contacts",
}: Props) {
  function presenceDotClass(p: ContactPresence): string {
    if (p === "online") return "bg-emerald-400";
    if (p === "afk") return "bg-amber-400";
    return "bg-slate-600";
  }

  function presenceLabel(p: ContactPresence): string {
    if (p === "online") return "Online";
    if (p === "afk") return "AFK";
    return "Offline";
  }

  const [sendByUsernameOpen, setSendByUsernameOpen] = useState(false);
  const [dialogUsername, setDialogUsername] = useState("");
  const [dialogNote, setDialogNote] = useState("");
  const [discoverTarget, setDiscoverTarget] = useState<PublicUser | null>(null);
  const [discoverMessage, setDiscoverMessage] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingFriendAction | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [friendMenuOpenId, setFriendMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!friendMenuOpenId) return;
    function onDoc(e: MouseEvent) {
      const el = document.getElementById(`friend-actions-${friendMenuOpenId}`);
      if (!el?.contains(e.target as Node)) setFriendMenuOpenId(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [friendMenuOpenId]);

  const confirmCopy = pending ? friendActionConfirm(pending) : null;

  async function executePending() {
    if (!pending) return;
    setConfirmBusy(true);
    setLocalErr(null);
    try {
      if (pending.kind === "remove") {
        await onRemoveFriend(pending.user.id);
      } else {
        await onBanUser({ userId: pending.user.id });
      }
      setPending(null);
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "Action failed");
      setPending(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  function openSendByUsernameDialog() {
    setLocalErr(null);
    setDialogUsername("");
    setDialogNote("");
    setSendByUsernameOpen(true);
  }

  function closeSendByUsernameDialog() {
    if (busy) return;
    setSendByUsernameOpen(false);
    setDialogUsername("");
    setDialogNote("");
  }

  async function submitSendByUsername() {
    const u = dialogUsername.trim();
    if (!u) return;
    setLocalErr(null);
    try {
      await onSendFriendRequest({
        username: u,
        message: dialogNote.trim() || undefined,
      });
      closeSendByUsernameDialog();
    } catch (err) {
      setLocalErr(err instanceof Error ? err.message : "Request failed");
    }
  }

  function openDiscoverDialog(user: PublicUser) {
    setLocalErr(null);
    setDiscoverMessage("");
    setDiscoverTarget(user);
  }

  function closeDiscoverDialog() {
    if (busy) return;
    setDiscoverTarget(null);
    setDiscoverMessage("");
  }

  async function submitDiscoverRequest() {
    if (!discoverTarget) return;
    setLocalErr(null);
    try {
      await onRequestFromDiscover(
        discoverTarget,
        discoverMessage.trim() || undefined,
      );
      closeDiscoverDialog();
    } catch (err) {
      setLocalErr(err instanceof Error ? err.message : "Request failed");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-600/20 text-sky-300">
          <UsersIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-white">
            {friends.length} friend{friends.length === 1 ? "" : "s"}
          </h2>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-4">
          {error ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}
          {localErr ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              {localErr}
            </p>
          ) : null}

          <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
            <button
              type="button"
              disabled={busy}
              onClick={openSendByUsernameDialog}
              className="w-full rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              Send request
            </button>
          </section>

          {incoming.length > 0 ? (
            <section className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-400/90">
                Requests for you
              </h3>
              <ul className="flex flex-col gap-2">
                {incoming.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-xl border border-white/10 bg-slate-900/50 p-2"
                  >
                    <p className="text-sm font-medium text-white">
                      @{r.requester.username}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {r.requester.displayName}
                    </p>
                    {r.requestMessage ? (
                      <p className="mt-1 text-xs text-slate-300 italic">
                        &ldquo;{r.requestMessage}&rdquo;
                      </p>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAcceptRequest(r.id)}
                        className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDeclineRequest(r.id)}
                        className="flex-1 rounded-lg border border-white/15 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {outgoing.length > 0 ? (
            <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sent requests
              </h3>
              <ul className="flex flex-col gap-2">
                {outgoing.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-slate-200">
                      @{r.addressee.username}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onCancelOutgoing(r.id)}
                      className="shrink-0 text-xs text-slate-400 underline hover:text-white disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-2 shadow-inner shadow-black/20">
            <h3 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Friends
            </h3>
            {friends.length === 0 ? (
              <p className="p-2 text-sm leading-relaxed text-slate-500">
                No friends yet. Send a request by{" "}
                <span className="text-slate-400">username</span> or pick someone
                below.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {friends.map((f) => {
                  const presence = contactPresenceFromMap(f.id, presenceByUserId);
                  const active = selectedId === f.id;
                  return (
                    <li key={f.id}>
                      <div
                        className={`flex items-start gap-1 rounded-xl px-2 py-2 transition ${
                          active
                            ? "bg-sky-600/25 ring-1 ring-sky-500/40"
                            : "hover:bg-white/5"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectFriend(f.id)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="relative shrink-0">
                            <UserAvatar
                              displayName={f.displayName}
                              avatarUrl={f.avatarUrl}
                              size="lg"
                              className="ring-slate-950"
                            />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-950 ${presenceDotClass(presence)}`}
                              title={presenceLabel(presence)}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-medium text-white">
                                {f.displayName}
                              </span>
                              <UnreadBadge
                                count={unreadByFriendId?.[f.id] ?? 0}
                              />
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              @{f.username}
                            </span>
                          </span>
                        </button>
                        <div
                          id={`friend-actions-${f.id}`}
                          className="relative shrink-0"
                        >
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`Actions for ${f.displayName}`}
                            aria-expanded={friendMenuOpenId === f.id}
                            aria-haspopup="menu"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFriendMenuOpenId((id) =>
                                id === f.id ? null : f.id,
                              );
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-slate-200 disabled:opacity-50"
                          >
                            <MoreVerticalIcon className="h-5 w-5" />
                          </button>
                          {friendMenuOpenId === f.id ? (
                            <div
                              role="menu"
                              className="absolute right-0 top-full z-10 mt-0.5 min-w-[7.5rem] rounded-lg border border-white/10 bg-slate-900 py-1 shadow-lg shadow-black/40"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                disabled={busy}
                                className="flex w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                                onClick={() => {
                                  setFriendMenuOpenId(null);
                                  setPending({ kind: "remove", user: f });
                                }}
                              >
                                Remove
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                disabled={busy}
                                className="flex w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                                onClick={() => {
                                  setFriendMenuOpenId(null);
                                  setPending({ kind: "ban", user: f });
                                }}
                              >
                                Ban
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-2">
            <h3 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              People on this server
            </h3>
            <ul className="flex flex-col gap-1">
              {discoverUsers.length === 0 ? (
                <li className="p-2 text-sm text-slate-500">No other users.</li>
              ) : (
                discoverUsers.map((u) => {
                  const isFriend = friends.some((x) => x.id === u.id);
                  const hasOutgoingRequest = outgoing.some(
                    (r) => r.addressee.id === u.id,
                  );
                  const hasIncomingRequest = incoming.some(
                    (r) => r.requester.id === u.id,
                  );
                  return (
                    <li key={u.id}>
                      <div className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-white/5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold">
                          {u.displayName.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-slate-200">
                            {u.displayName}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            @{u.username}
                          </p>
                        </div>
                        {isFriend ? (
                          <span className="shrink-0 text-[0.65rem] text-slate-500">
                            Friend
                          </span>
                        ) : hasOutgoingRequest ? (
                          <span
                            className="shrink-0 text-[0.65rem] font-medium text-slate-500"
                            title="You already sent a friend request"
                          >
                            Request sent
                          </span>
                        ) : hasIncomingRequest ? (
                          <span
                            className="shrink-0 text-[0.65rem] font-medium text-emerald-500/90"
                            title="They sent you a request — use Requests for you above"
                          >
                            Request received
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openDiscoverDialog(u)}
                            className="shrink-0 rounded-lg border border-sky-500/40 px-2 py-1 text-[0.65rem] font-medium text-sky-300 hover:bg-sky-500/10 disabled:opacity-50"
                          >
                            Add
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-xs text-slate-500">
          <p>
            Signed in as{" "}
            <span className="font-medium text-slate-300">{displayName}</span>
          </p>
          <Link
            to="/account"
            className="mt-1 inline-block font-medium text-sky-400 hover:text-sky-300"
          >
            Account & password
          </Link>
        </div>
      </div>

      {confirmCopy ? (
        <ConfirmModal
          open={pending !== null}
          title={confirmCopy.title}
          message={confirmCopy.message}
          confirmLabel={confirmCopy.confirmLabel}
          destructive={confirmCopy.destructive}
          busy={confirmBusy}
          onClose={() => {
            if (!confirmBusy) setPending(null);
          }}
          onConfirm={executePending}
        />
      ) : null}

      <Modal
        open={sendByUsernameOpen}
        title="Send friend request"
        titleId="friend-req-username-title"
        showCloseButton={false}
        onClose={closeSendByUsernameDialog}
        footer={
          <>
            <button
              type="button"
              disabled={busy}
              onClick={closeSendByUsernameDialog}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !dialogUsername.trim()}
              onClick={() => void submitSendByUsername()}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {busy ? "…" : "Send"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="friend-req-username"
              className="mb-1 block text-xs font-medium text-slate-400"
            >
              Username
            </label>
            <input
              id="friend-req-username"
              className="w-full rounded-lg border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-white placeholder:text-slate-500"
              placeholder="Username"
              value={dialogUsername}
              onChange={(e) =>
                setDialogUsername(
                  e.target.value.slice(0, FRIEND_REQ_FIELD_MAX),
                )
              }
              maxLength={FRIEND_REQ_FIELD_MAX}
              disabled={busy}
              autoComplete="off"
            />
          </div>
          <div>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <label
                htmlFor="friend-req-note"
                className="block text-xs font-medium text-slate-400"
              >
                Optional note
              </label>
              <span className="text-[0.65rem] text-slate-500">
                {dialogNote.length}/{FRIEND_REQ_FIELD_MAX}
              </span>
            </div>
            <textarea
              id="friend-req-note"
              rows={3}
              className="min-h-[4.5rem] w-full resize-y rounded-lg border border-white/10 bg-slate-900/90 px-3 py-2 text-sm leading-relaxed text-white placeholder:text-slate-500"
              placeholder="Optional note with request"
              value={dialogNote}
              onChange={(e) =>
                setDialogNote(e.target.value.slice(0, FRIEND_REQ_FIELD_MAX))
              }
              maxLength={FRIEND_REQ_FIELD_MAX}
              disabled={busy}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={discoverTarget !== null}
        title={
          discoverTarget
            ? `Add ${discoverTarget.displayName}`
            : "Add friend"
        }
        titleId="friend-req-discover-title"
        showCloseButton={false}
        onClose={closeDiscoverDialog}
        footer={
          <>
            <button
              type="button"
              disabled={busy}
              onClick={closeDiscoverDialog}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submitDiscoverRequest()}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {busy ? "…" : "Send"}
            </button>
          </>
        }
      >
        {discoverTarget ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-400">
              Request will be sent to{" "}
              <span className="font-medium text-slate-200">
                @{discoverTarget.username}
              </span>
            </p>
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <label
                  htmlFor="friend-req-discover-msg"
                  className="block text-xs font-medium text-slate-400"
                >
                  Optional message
                </label>
                <span className="text-[0.65rem] text-slate-500">
                  {discoverMessage.length}/{FRIEND_REQ_FIELD_MAX}
                </span>
              </div>
              <textarea
                id="friend-req-discover-msg"
                rows={4}
                className="min-h-[5.5rem] w-full resize-y rounded-lg border border-white/10 bg-slate-900/90 px-3 py-2 text-sm leading-relaxed text-white placeholder:text-slate-500"
                placeholder="Optional message with your request"
                value={discoverMessage}
                onChange={(e) =>
                  setDiscoverMessage(
                    e.target.value.slice(0, FRIEND_REQ_FIELD_MAX),
                  )
                }
                maxLength={FRIEND_REQ_FIELD_MAX}
                disabled={busy}
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
