import { useEffect, useState } from "react";
import { connectSocket } from "../lib/socketClient";

/** Global presence from `presence:sync` (online / AFK). */
export function usePresenceMap(sessionActive: boolean) {
  const [presenceByUserId, setPresenceByUserId] = useState<
    Record<string, "online" | "afk">
  >({});

  useEffect(() => {
    if (!sessionActive) return;

    const socket = connectSocket();

    const onPresence = (payload: unknown) => {
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const next: Record<string, "online" | "afk"> = {};
        for (const [k, v] of Object.entries(
          payload as Record<string, unknown>,
        )) {
          if (v === "online" || v === "afk") next[k] = v;
        }
        setPresenceByUserId(next);
        return;
      }
      if (Array.isArray(payload)) {
        const next: Record<string, "online" | "afk"> = {};
        for (const id of payload) {
          if (typeof id === "string") next[id] = "online";
        }
        setPresenceByUserId(next);
      }
    };

    socket.on("presence:sync", onPresence);
    return () => {
      socket.off("presence:sync", onPresence);
    };
  }, [sessionActive]);

  return presenceByUserId;
}
