import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiRoomAddAdmin,
  apiRoomBanList,
  apiRoomBanUser,
  apiRoomDemoteMod,
  apiRoomKick,
  apiRoomMembers,
  apiRoomPromoteMod,
  apiRoomRemoveAdmin,
  apiRoomUnbanUser,
  type RoomBanEntry,
} from "../lib/api";
import type { RoomMemberProfile } from "../types";
import { ConfirmModal } from "./ConfirmModal";

type Props = {
  roomId: string;
  myRole: string | null;
  selfId: string;
  onChanged?: () => void;
  onClose: () => void;
};

function isRoomStaff(role: string | null) {
  return role === "owner" || role === "admin" || role === "mod";
}

function isOwnerOrRoomAdmin(role: string | null) {
  return role === "owner" || role === "admin";
}

type Tab = "members" | "banned";

type PendingConfirm =
  | {
      kind: "kick";
      user: RoomMemberProfile;
      kickAsBan: boolean;
    }
  | { kind: "ban"; user: RoomMemberProfile }
  | { kind: "removeAdmin"; user: RoomMemberProfile }
  | { kind: "unban"; entry: RoomBanEntry }
  | { kind: "banById"; userId: string };

function MenuChevron({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function RoomModerationPanel({
  roomId,
  myRole,
  selfId,
  onChanged,
  onClose,
}: Props) {
  const [members, setMembers] = useState<RoomMemberProfile[]>([]);
  const [bans, setBans] = useState<RoomBanEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("members");
  const [banUserId, setBanUserId] = useState("");
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const canBanAndAdmin = isOwnerOrRoomAdmin(myRole);

  const load = useCallback(async () => {
    setError(null);
    try {
      const m = await apiRoomMembers(roomId);
      setMembers(m);
      if (canBanAndAdmin) {
        const b = await apiRoomBanList(roomId);
        setBans(b);
      } else {
        setBans([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, [roomId, canBanAndAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function withBusy<T>(fn: () => Promise<T>) {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  async function runPromoteMod(u: RoomMemberProfile) {
    try {
      await withBusy(() => apiRoomPromoteMod(roomId, u.id));
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function runMakeAdmin(u: RoomMemberProfile) {
    try {
      await withBusy(() => apiRoomAddAdmin(roomId, u.id));
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function runDemoteMod(u: RoomMemberProfile) {
    try {
      await withBusy(() => apiRoomDemoteMod(roomId, u.id));
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function executePending() {
    if (!pending) return;
    setConfirmBusy(true);
    setError(null);
    try {
      switch (pending.kind) {
        case "kick":
          await apiRoomKick(roomId, pending.user.id);
          break;
        case "ban":
          await apiRoomBanUser(roomId, pending.user.id);
          break;
        case "removeAdmin":
          await apiRoomRemoveAdmin(roomId, pending.user.id);
          break;
        case "unban":
          await apiRoomUnbanUser(roomId, pending.entry.userId);
          break;
        case "banById":
          await apiRoomBanUser(roomId, pending.userId);
          break;
        default:
          break;
      }
      setPending(null);
      setBanUserId("");
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setConfirmBusy(false);
    }
  }

  function confirmMessage(p: PendingConfirm): { title: string; body: string } {
    switch (p.kind) {
      case "kick":
        return {
          title: p.kickAsBan ? "Remove and ban from room" : "Remove member",
          body: p.kickAsBan
            ? `Remove ${p.user.displayName} (@${p.user.username}) from this room and ban them from rejoining until unbanned?`
            : `Remove ${p.user.displayName} (@${p.user.username}) from this room?`,
        };
      case "ban":
        return {
          title: "Ban from room",
          body: `Ban ${p.user.displayName} (@${p.user.username})? They will not be able to rejoin until unbanned.`,
        };
      case "removeAdmin":
        return {
          title: "Remove room admin",
          body: `Remove admin privileges from ${p.user.displayName} (@${p.user.username})?`,
        };
      case "unban":
        return {
          title: "Unban user",
          body: `Allow ${p.entry.user.displayName} (@${p.entry.user.username}) to join this room again?`,
        };
      case "banById":
        return {
          title: "Ban user by id",
          body: `Ban user id ${p.userId} from this room? They will not be able to rejoin until unbanned.`,
        };
      default:
        return { title: "Confirm", body: "Continue?" };
    }
  }

  if (!isRoomStaff(myRole)) return null;

  const { title: cTitle, body: cBody } = pending
    ? confirmMessage(pending)
    : { title: "", body: "" };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl"
        role="dialog"
        aria-labelledby="mod-panel-title"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="mod-panel-title" className="text-lg font-semibold text-white">
            Room administration
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-white/10 hover:text-white"
          >
            Close
          </button>
        </div>

        <nav
          className="mb-4 flex gap-1 border-b border-white/10 pb-2"
          aria-label="Moderation sections"
        >
          <button
            type="button"
            onClick={() => setTab("members")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "members"
                ? "bg-violet-600/35 text-white"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            Members
          </button>
          {canBanAndAdmin ? (
            <button
              type="button"
              onClick={() => setTab("banned")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === "banned"
                  ? "bg-violet-600/35 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              Banned users
              {bans.length > 0 ? (
                <span className="ms-1 rounded-full bg-slate-700 px-1.5 py-0.5 text-[0.65rem] text-slate-300">
                  {bans.length}
                </span>
              ) : null}
            </button>
          ) : null}
        </nav>

        {error ? (
          <p className="mb-2 text-sm text-red-300">{error}</p>
        ) : null}

        {!canBanAndAdmin ? (
          <p className="mb-3 text-xs text-slate-500">
            Bans and room admins are managed by the room owner and room admins.
          </p>
        ) : null}

        {tab === "members" ? (
          <section>
            <h3 className="sr-only">Members</h3>
            <ul className="space-y-2 text-sm">
              {members.map((u) => (
                <MemberRow
                  key={u.id}
                  u={u}
                  myRole={myRole}
                  selfId={selfId}
                  busy={busy}
                  onPromoteMod={() => void runPromoteMod(u)}
                  onMakeAdmin={() => void runMakeAdmin(u)}
                  onDemoteMod={() => void runDemoteMod(u)}
                  onRequestConfirm={setPending}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {tab === "banned" && canBanAndAdmin ? (
          <section>
            <h3 className="sr-only">Banned users</h3>
            {bans.length === 0 ? (
              <p className="text-sm text-slate-500">No banned users.</p>
            ) : (
              <ul className="space-y-2">
                {bans.map((b) => (
                  <li
                    key={b.userId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/50 px-2 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="text-slate-300">
                        {b.user.displayName}{" "}
                        <span className="text-xs text-slate-500">
                          @{b.user.username}
                        </span>
                      </span>
                      {b.bannedBy ? (
                        <p className="mt-1 text-[0.65rem] text-slate-500">
                          Banned by {b.bannedBy.displayName} (@
                          {b.bannedBy.username})
                        </p>
                      ) : (
                        <p className="mt-1 text-[0.65rem] text-slate-600">
                          Banned by (unknown)
                        </p>
                      )}
                    </div>
                    <details className="relative">
                      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-white/15 bg-slate-950/80 px-2 py-1 text-[0.65rem] font-medium text-slate-300 marker:content-none hover:bg-white/5 [&::-webkit-details-marker]:hidden">
                        Actions
                        <MenuChevron className="opacity-70" />
                      </summary>
                      <ul className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-lg border border-white/10 bg-slate-900 py-1 shadow-xl">
                        <li>
                          <button
                            type="button"
                            disabled={busy}
                            className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                            onClick={(e) => {
                              (e.currentTarget.closest("details") as HTMLDetailsElement).open =
                                false;
                              setPending({ kind: "unban", entry: b });
                            }}
                          >
                            Unban…
                          </button>
                        </li>
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                const id = banUserId.trim();
                if (!id) return;
                setPending({ kind: "banById", userId: id });
              }}
            >
              <input
                className="min-w-[8rem] flex-1 rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-xs"
                placeholder="Ban by user id (UUID)"
                value={banUserId}
                onChange={(e) => setBanUserId(e.target.value)}
                disabled={busy}
              />
              <button
                type="submit"
                disabled={busy || !banUserId.trim()}
                className="rounded bg-red-600/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                Ban by id…
              </button>
            </form>
          </section>
        ) : null}
      </div>

      <ConfirmModal
        open={pending != null}
        title={cTitle}
        message={cBody}
        confirmLabel={
          pending?.kind === "unban"
            ? "Unban"
            : pending?.kind === "kick" && !pending.kickAsBan
              ? "Remove"
              : "Confirm"
        }
        destructive={
          pending != null &&
          pending.kind !== "unban" &&
          !(pending.kind === "kick" && !pending.kickAsBan)
        }
        busy={confirmBusy}
        onClose={() => {
          if (!confirmBusy) setPending(null);
        }}
        onConfirm={executePending}
        zClassName="z-[100]"
      />
    </div>
  );
}

function MemberRow({
  u,
  myRole,
  selfId,
  busy,
  onPromoteMod,
  onMakeAdmin,
  onDemoteMod,
  onRequestConfirm,
}: {
  u: RoomMemberProfile;
  myRole: string | null;
  selfId: string;
  busy: boolean;
  onPromoteMod: () => void;
  onMakeAdmin: () => void;
  onDemoteMod: () => void;
  onRequestConfirm: (p: PendingConfirm) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const isSelf = u.id === selfId;
  const canKick =
    !isSelf &&
    u.role !== "owner" &&
    (myRole === "owner" ||
      (myRole === "admin" && u.role !== "admin" && u.role !== "owner") ||
      (myRole === "mod" && u.role === "member"));
  const canPromote = isOwnerOrRoomAdmin(myRole) && u.role === "member";
  const canMakeAdmin = myRole === "owner" && u.role === "member";
  const canDemote = isOwnerOrRoomAdmin(myRole) && u.role === "mod";
  const canRemoveAdmin = isOwnerOrRoomAdmin(myRole) && u.role === "admin";
  const canBan =
    isOwnerOrRoomAdmin(myRole) && u.role !== "owner" && !isSelf;

  const kickAsBan = myRole === "owner" || myRole === "admin";

  function closeMenu() {
    if (detailsRef.current) detailsRef.current.open = false;
  }

  const hasMenu =
    canPromote ||
    canMakeAdmin ||
    canDemote ||
    canRemoveAdmin ||
    canKick ||
    canBan;

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/50 px-2 py-2">
      <div className="min-w-0 flex-1">
        <span className="font-medium text-slate-200">{u.displayName}</span>{" "}
        <span className="text-xs text-slate-500">
          @{u.username} · {u.role}
        </span>
      </div>
      {hasMenu ? (
        <details ref={detailsRef} className="relative shrink-0">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-white/15 bg-slate-950/80 px-2 py-1 text-[0.65rem] font-medium text-slate-300 marker:content-none hover:bg-white/5 [&::-webkit-details-marker]:hidden">
            Menu
            <MenuChevron className="opacity-70" />
          </summary>
          <ul className="absolute right-0 z-20 mt-1 min-w-[12rem] rounded-lg border border-white/10 bg-slate-900 py-1 shadow-xl ring-1 ring-black/40">
            {canPromote ? (
              <li>
                <button
                  type="button"
                  disabled={busy}
                  className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                  onClick={() => {
                    closeMenu();
                    onPromoteMod();
                  }}
                >
                  Make moderator
                </button>
              </li>
            ) : null}
            {canMakeAdmin ? (
              <li>
                <button
                  type="button"
                  disabled={busy}
                  className="w-full px-3 py-2 text-left text-xs text-violet-200 hover:bg-violet-500/15 disabled:opacity-50"
                  onClick={() => {
                    closeMenu();
                    onMakeAdmin();
                  }}
                >
                  Make room admin
                </button>
              </li>
            ) : null}
            {canDemote ? (
              <li>
                <button
                  type="button"
                  disabled={busy}
                  className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                  onClick={() => {
                    closeMenu();
                    onDemoteMod();
                  }}
                >
                  Demote moderator
                </button>
              </li>
            ) : null}
            {canRemoveAdmin ? (
              <li>
                <button
                  type="button"
                  disabled={busy}
                  className="w-full px-3 py-2 text-left text-xs text-violet-200 hover:bg-violet-500/15 disabled:opacity-50"
                  onClick={() => {
                    closeMenu();
                    onRequestConfirm({ kind: "removeAdmin", user: u });
                  }}
                >
                  Remove admin…
                </button>
              </li>
            ) : null}
            {canKick ? (
              <li>
                <button
                  type="button"
                  disabled={busy}
                  className="w-full px-3 py-2 text-left text-xs text-amber-200 hover:bg-amber-500/15 disabled:opacity-50"
                  onClick={() => {
                    closeMenu();
                    onRequestConfirm({
                      kind: "kick",
                      user: u,
                      kickAsBan,
                    });
                  }}
                >
                  {kickAsBan ? "Remove member (ban)…" : "Remove member…"}
                </button>
              </li>
            ) : null}
            {canBan ? (
              <li>
                <button
                  type="button"
                  disabled={busy}
                  className="w-full px-3 py-2 text-left text-xs text-red-300 hover:bg-red-500/15 disabled:opacity-50"
                  onClick={() => {
                    closeMenu();
                    onRequestConfirm({ kind: "ban", user: u });
                  }}
                >
                  Ban from room…
                </button>
              </li>
            ) : null}
          </ul>
        </details>
      ) : (
        <span className="text-[0.65rem] text-slate-600">—</span>
      )}
    </li>
  );
}
