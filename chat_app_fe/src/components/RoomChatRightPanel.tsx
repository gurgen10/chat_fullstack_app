import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  apiMyRooms,
  apiRoomMembers,
} from "../lib/api";
import type { MyRoomSummary, RoomMemberProfile } from "../types";
import { contactPresenceFromMap } from "../types";
import { UnreadBadge } from "./UnreadBadge";

type Props = {
  roomId: string;
  currentRoomName: string | null;
  selfId: string;
  presenceByUserId: Record<string, "online" | "afk">;
  /** Per-room unread counts (same source as rooms list / catalog). */
  unreadByRoomId?: Record<string, number>;
  /** Refetch members when room moderation changes */
  membersVersion?: number;
};

function presenceDotClass(
  p: ReturnType<typeof contactPresenceFromMap>,
): string {
  if (p === "online") return "bg-emerald-400";
  if (p === "afk") return "bg-amber-400";
  return "bg-slate-600";
}

export function RoomChatRightPanel({
  roomId,
  currentRoomName,
  selfId,
  presenceByUserId,
  unreadByRoomId = {},
  membersVersion = 0,
}: Props) {
  const [myRooms, setMyRooms] = useState<MyRoomSummary[]>([]);
  const [members, setMembers] = useState<RoomMemberProfile[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiMyRooms()
      .then((list) => {
        if (!cancelled) {
          setMyRooms(list.filter((r) => r.type !== "dm"));
        }
      })
      .catch(() => {
        if (!cancelled) setMyRooms([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadErr(null);
    apiRoomMembers(roomId)
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch((e) => {
        if (!cancelled) {
          setMembers([]);
          setLoadErr(e instanceof Error ? e.message : "Could not load members.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, membersVersion]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto border-s border-white/10 bg-slate-900/80 p-2 sm:p-3">
      <details className="group rounded-xl border border-white/10 bg-slate-950/50">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span>Your rooms</span>
            <span className="text-[0.65rem] font-normal text-slate-600 group-open:hidden">
              {myRooms.length} · expand
            </span>
            <span className="hidden text-[0.65rem] font-normal text-slate-600 group-open:inline">
              compact
            </span>
          </span>
        </summary>
        <ul className="max-h-40 space-y-0.5 overflow-y-auto border-t border-white/5 px-2 py-2">
          {myRooms.length === 0 ? (
            <li className="px-1 py-1 text-xs text-slate-500">No joined rooms.</li>
          ) : (
            myRooms.map((r) => {
              const here = r.id === roomId;
              return (
                <li key={r.id}>
                  <Link
                    to={`/rooms/${r.id}`}
                    className={`flex items-center gap-1.5 truncate rounded-lg px-2 py-1.5 text-xs ${
                      here
                        ? "bg-violet-600/25 font-medium text-violet-100"
                        : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {r.name ?? "Room"}
                      {here ? (
                        <span className="ms-1 text-[0.65rem] text-violet-300/80">
                          · here
                        </span>
                      ) : null}
                    </span>
                    <UnreadBadge count={unreadByRoomId[r.id] ?? 0} />
                  </Link>
                </li>
              );
            })
          )}
        </ul>
        <div className="border-t border-white/5 px-2 py-2">
          <Link
            to="/rooms"
            className="text-xs font-medium text-violet-400 hover:text-violet-300"
          >
            Browse all rooms →
          </Link>
        </div>
      </details>

      <details open className="rounded-xl border border-white/10 bg-slate-950/50">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 marker:content-none [&::-webkit-details-marker]:hidden">
          Members
          {currentRoomName ? (
            <span className="mt-0.5 block truncate font-normal normal-case text-slate-500">
              {currentRoomName}
            </span>
          ) : null}
        </summary>
        {loadErr ? (
          <p className="border-t border-white/5 px-2 py-2 text-xs text-red-300/90">
            {loadErr}
          </p>
        ) : (
          <ul className="max-h-[min(50vh,24rem)] space-y-1 overflow-y-auto border-t border-white/5 px-2 py-2">
            {members.map((m) => {
              const pres = contactPresenceFromMap(m.id, presenceByUserId);
              const mine = m.id === selfId;
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm"
                >
                  <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-white">
                    {m.displayName.slice(0, 1).toUpperCase()}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 ${presenceDotClass(pres)}`}
                      title={
                        pres === "online"
                          ? "Online"
                          : pres === "afk"
                            ? "AFK"
                            : "Offline"
                      }
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="block truncate text-slate-100">
                      {m.displayName}
                      {mine ? (
                        <span className="ms-1 text-[0.65rem] text-slate-500">
                          (you)
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-[0.65rem] text-slate-500">
                      @{m.username} · {m.role}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </details>

      <div className="mt-auto border-t border-white/10 pt-2">
        <Link
          to="/chat"
          className="block rounded-lg px-2 py-2 text-center text-xs font-medium text-violet-400 hover:bg-white/5 hover:text-violet-300"
        >
          Personal messages
        </Link>
      </div>
    </div>
  );
}
