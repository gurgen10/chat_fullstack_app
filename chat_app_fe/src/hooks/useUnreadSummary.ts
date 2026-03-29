import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiUnreadSummary } from "../lib/api";
import { connectSocket } from "../lib/socketClient";
import type { UnreadSummary } from "../types";

export type UnreadSummaryValue = {
  summary: UnreadSummary | null;
  refresh: () => Promise<void>;
  unreadByFriendId: Record<string, number>;
  unreadByRoomId: Record<string, number>;
  roomsUnreadTotal: number;
  dmsUnreadTotal: number;
};

const UnreadSummaryContext = createContext<UnreadSummaryValue | null>(null);

/**
 * Provider: call once under the logged-in shell so all nav and pages share one
 * subscription (API + `unread:refresh` socket).
 */
export function UnreadSummaryProvider({
  sessionActive,
  children,
}: {
  sessionActive: boolean;
  children: ReactNode;
}) {
  const value = useUnreadSummaryState(sessionActive);
  return createElement(
    UnreadSummaryContext.Provider,
    { value },
    children,
  );
}

/**
 * Server-backed unread counts for DMs and group rooms, refreshed on socket
 * `unread:refresh` (emitted after new messages) and when the tab becomes visible.
 */
export function useUnreadSummary(): UnreadSummaryValue {
  const ctx = useContext(UnreadSummaryContext);
  if (!ctx) {
    throw new Error(
      "useUnreadSummary must be used within UnreadSummaryProvider",
    );
  }
  return ctx;
}

function useUnreadSummaryState(sessionActive: boolean): UnreadSummaryValue {
  const [summary, setSummary] = useState<UnreadSummary | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionActive) return;
    try {
      const s = await apiUnreadSummary();
      setSummary(s);
    } catch {
      /* ignore */
    }
  }, [sessionActive]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!sessionActive) return;
    const socket = connectSocket();
    const onRefresh = () => {
      void refresh();
    };
    socket.on("unread:refresh", onRefresh);
    return () => {
      socket.off("unread:refresh", onRefresh);
    };
  }, [sessionActive, refresh]);

  useEffect(() => {
    if (!sessionActive) return;
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [sessionActive, refresh]);

  const unreadByFriendId = useMemo(() => {
    const m: Record<string, number> = {};
    if (!summary) return m;
    for (const e of summary.dms) {
      m[e.peerId] = e.unreadCount;
    }
    return m;
  }, [summary]);

  const unreadByRoomId = useMemo(() => {
    const m: Record<string, number> = {};
    if (!summary) return m;
    for (const e of summary.rooms) {
      m[e.roomId] = e.unreadCount;
    }
    return m;
  }, [summary]);

  const roomsUnreadTotal = useMemo(() => {
    if (!summary) return 0;
    return summary.rooms.reduce((acc, r) => acc + r.unreadCount, 0);
  }, [summary]);

  const dmsUnreadTotal = useMemo(() => {
    if (!summary) return 0;
    return summary.dms.reduce((acc, d) => acc + d.unreadCount, 0);
  }, [summary]);

  return {
    summary,
    refresh,
    unreadByFriendId,
    unreadByRoomId,
    roomsUnreadTotal,
    dmsUnreadTotal,
  };
}
