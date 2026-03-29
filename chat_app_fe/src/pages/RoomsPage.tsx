import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useUnreadSummary } from "../hooks/useUnreadSummary";
import {
  apiCreateRoom,
  apiDeleteRoom,
  apiInviteToRoom,
  apiJoinRoom,
  apiLeaveRoom,
  apiMyRooms,
  apiPublicRoomCatalog,
} from "../lib/api";
import type { MyRoomSummary, PublicRoomCatalogItem } from "../types";
import { ConfirmModal } from "../components/ConfirmModal";
import { UnreadBadge } from "../components/UnreadBadge";

const ROOM_DESCRIPTION_MAX = 500;

function canInviteToPrivate(role: string) {
  return role === "owner" || role === "admin" || role === "mod";
}

function InvitePrivateForm({
  roomId,
  disabled,
  onInvited,
}: {
  roomId: string;
  disabled: boolean;
  onInvited: () => void;
}) {
  const [invite, setInvite] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invite.trim()) return;
    setSubmitting(true);
    setErr(null);
    try {
      await apiInviteToRoom(roomId, invite.trim());
      setInvite("");
      onInvited();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Invite failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-2">
      <p className="text-[0.7rem] text-slate-500">
        Invite by username, email, or user id. They must already have an
        account.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[10rem] flex-1 rounded-lg border border-white/10 bg-slate-950/80 px-2 py-1.5 text-xs"
          placeholder="Username, email, or user id"
          value={invite}
          onChange={(e) => setInvite(e.target.value)}
          disabled={disabled || submitting}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={disabled || submitting || !invite.trim()}
          className="rounded-lg border border-violet-500/40 bg-violet-600/20 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-600/30 disabled:opacity-50"
        >
          {submitting ? "…" : "Invite"}
        </button>
      </div>
      {err ? <p className="text-xs text-red-300">{err}</p> : null}
    </form>
  );
}

export default function RoomsPage() {
  const { session } = useAuth();
  const { unreadByRoomId } = useUnreadSummary();
  const [catalog, setCatalog] = useState<PublicRoomCatalogItem[]>([]);
  const [mine, setMine] = useState<MyRoomSummary[]>([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<"public" | "private">("public");
  const [deleteTarget, setDeleteTarget] = useState<MyRoomSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      const [cat, my] = await Promise.all([
        apiPublicRoomCatalog(appliedSearch || undefined),
        apiMyRooms(),
      ]);
      setCatalog(cat);
      setMine(my);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load rooms.");
    }
  }, [session, appliedSearch]);

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

  if (!session) return null;

  return (
    <div className="bg-slate-950 px-4 py-8 pb-12 text-slate-100">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-white">Chat rooms</h1>
        </header>

        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
          <h2 className="text-sm font-semibold text-white">Create a room</h2>
          <p className="mt-1 text-xs text-slate-500">
            Name must be unique. Private rooms are invite-only and hidden from
            the catalog.
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              try {
                await withBusy(() =>
                  apiCreateRoom({
                    type: newType,
                    name: newName.trim(),
                    description: newDesc.trim() || undefined,
                  }),
                );
                setNewName("");
                setNewDesc("");
                await load();
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Could not create room.",
                );
              }
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <input
                className="min-w-[12rem] flex-1 rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm"
                placeholder="Room name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={busy}
              />
              <select
                className="rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm"
                value={newType}
                onChange={(e) =>
                  setNewType(e.target.value === "private" ? "private" : "public")
                }
                disabled={busy}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
              <button
                type="submit"
                disabled={busy || !newName.trim()}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50 sm:shrink-0"
              >
                Create
              </button>
            </div>
            <div>
              <label
                htmlFor="new-room-description"
                className="mb-1 block text-xs font-medium text-slate-500"
              >
                Description (optional)
              </label>
              <textarea
                id="new-room-description"
                rows={3}
                maxLength={ROOM_DESCRIPTION_MAX}
                className="min-h-[4.5rem] w-full resize-y rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500"
                placeholder="What is this room about?"
                value={newDesc}
                onChange={(e) =>
                  setNewDesc(e.target.value.slice(0, ROOM_DESCRIPTION_MAX))
                }
                disabled={busy}
              />
              <p className="mt-1 text-right text-[0.65rem] tabular-nums text-slate-500">
                {newDesc.length}/{ROOM_DESCRIPTION_MAX}
              </p>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
          <h2 className="text-sm font-semibold text-white">Public catalog</h2>
          <div className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm"
              placeholder="Search name or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setAppliedSearch(search);
              }}
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => setAppliedSearch(search)}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
            >
              Search
            </button>
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {catalog.length === 0 ? (
              <li className="text-sm text-slate-500">No public rooms match.</li>
            ) : (
              catalog.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-1 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-white">
                      <span>{r.name}</span>
                      <UnreadBadge count={unreadByRoomId[r.id] ?? 0} />
                    </p>
                    <p className="text-xs text-slate-400 line-clamp-2">
                      {r.description || "No description."}
                    </p>
                    <p className="text-[0.7rem] text-slate-500">
                      {r.memberCount} member{r.memberCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      to={`/rooms/${r.id}`}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5"
                    >
                      Open
                    </Link>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          await withBusy(() => apiJoinRoom(r.id));
                          await load();
                        } catch (err) {
                          setError(
                            err instanceof Error ? err.message : "Join failed.",
                          );
                        }
                      }}
                      className="rounded-lg bg-violet-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                    >
                      Join
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
          <h2 className="text-sm font-semibold text-white">Your rooms</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {mine.length === 0 ? (
              <li className="text-sm text-slate-500">
                You haven’t joined any rooms yet.
              </li>
            ) : (
              mine.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-white">
                      <span>
                        {r.name ?? "(direct)"}{" "}
                        <span className="text-xs font-normal text-slate-500">
                          {r.type} · {r.myRole}
                        </span>
                      </span>
                      {r.type !== "dm" ? (
                        <UnreadBadge count={unreadByRoomId[r.id] ?? 0} />
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-400 line-clamp-2">
                      {r.description || (r.type === "dm" ? "" : "—")}
                    </p>
                  </div>
                  <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:items-end">
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {r.type !== "dm" ? (
                        <Link
                          to={`/rooms/${r.id}`}
                          className="rounded-lg bg-violet-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
                        >
                          Open chat
                        </Link>
                      ) : null}
                      {r.myRole !== "owner" && r.type !== "dm" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            try {
                              await withBusy(() => apiLeaveRoom(r.id));
                              await load();
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : "Leave failed.",
                              );
                            }
                          }}
                          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
                        >
                          Leave
                        </button>
                      ) : null}
                      {r.myRole === "owner" && r.type !== "dm" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setDeleteTarget(r)}
                          className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                        >
                          Delete room
                        </button>
                      ) : null}
                    </div>
                    {r.type === "private" && canInviteToPrivate(r.myRole) ? (
                      <InvitePrivateForm
                        roomId={r.id}
                        disabled={busy}
                        onInvited={() => void load()}
                      />
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <ConfirmModal
        open={deleteTarget != null}
        title="Delete room"
        message={
          deleteTarget
            ? `Delete “${deleteTarget.name ?? "Room"}” permanently? All messages and files in it will be removed.`
            : ""
        }
        confirmLabel="Delete room"
        destructive
        busy={deleteBusy}
        onClose={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleteBusy(true);
          setError(null);
          try {
            await apiDeleteRoom(deleteTarget.id);
            setDeleteTarget(null);
            await load();
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Delete failed.",
            );
          } finally {
            setDeleteBusy(false);
          }
        }}
        zClassName="z-[100]"
      />
    </div>
  );
}
