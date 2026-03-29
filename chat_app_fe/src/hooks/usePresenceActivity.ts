import { useEffect, useRef } from "react";
import { connectSocket } from "../lib/socketClient";

/** No interaction in any tab for this long ⇒ AFK. */
const AFK_IDLE_MS = 60 * 1000;

const STORAGE_KEY = "gug-presence:lastActivity";
const BC_NAME = "gug-presence-activity";

type ActivityMsg = { type: "activity"; t: number };

/**
 * Reports `online` / `afk` to the server. AFK after {@link AFK_IDLE_MS} with no
 * user interaction in **any** open tab (same origin); activity in one tab keeps
 * all tabs reporting online.
 */
export function usePresenceActivity(session: boolean) {
  const lastMoveRef = useRef(0);

  useEffect(() => {
    if (!session) return;

    let socket: ReturnType<typeof connectSocket>;
    try {
      socket = connectSocket();
    } catch {
      return;
    }

    let isAfk = false;
    const lastGlobalActivity = { current: Date.now() };
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel(BC_NAME);
      }
    } catch {
      bc = null;
    }

    function emit(status: "online" | "afk") {
      socket.emit("presence:set", { status }, () => {});
    }

    function clearIdleTimer() {
      if (idleTimer != null) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    }

    function scheduleIdleDeadline() {
      clearIdleTimer();
      const deadline = lastGlobalActivity.current + AFK_IDLE_MS;
      const delay = Math.max(0, deadline - Date.now());
      idleTimer = setTimeout(() => {
        idleTimer = null;
        if (Date.now() - lastGlobalActivity.current >= AFK_IDLE_MS) {
          if (!isAfk) {
            isAfk = true;
            emit("afk");
          }
        }
      }, delay);
    }

    function applyGlobalActivity(t: number, fromLocalBump: boolean) {
      const next = Math.max(lastGlobalActivity.current, t);
      lastGlobalActivity.current = next;

      if (isAfk) {
        isAfk = false;
        emit("online");
      }
      scheduleIdleDeadline();

      if (fromLocalBump) {
        try {
          localStorage.setItem(STORAGE_KEY, String(next));
        } catch {
          /* private mode */
        }
        bc?.postMessage({ type: "activity", t: next } satisfies ActivityMsg);
      }
    }

    function bumpLocalActivity() {
      applyGlobalActivity(Date.now(), true);
    }

    function onBcMessage(ev: MessageEvent<ActivityMsg>) {
      const d = ev.data;
      if (!d || d.type !== "activity" || typeof d.t !== "number") return;
      applyGlobalActivity(d.t, false);
    }

    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY || e.newValue == null) return;
      const t = Number.parseInt(e.newValue, 10);
      if (!Number.isFinite(t)) return;
      applyGlobalActivity(t, false);
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw != null) {
        const t = Number.parseInt(raw, 10);
        if (Number.isFinite(t)) {
          lastGlobalActivity.current = Math.max(lastGlobalActivity.current, t);
        }
      }
    } catch {
      /* ignore */
    }

    if (bc) {
      bc.addEventListener("message", onBcMessage);
    }
    window.addEventListener("storage", onStorage);

    function onMouseMove() {
      const now = Date.now();
      if (now - lastMoveRef.current < 200) return;
      lastMoveRef.current = now;
      bumpLocalActivity();
    }

    const opts = { passive: true } as AddEventListenerOptions;
    const scrollOpts = { capture: true, passive: true } as const;

    window.addEventListener("keydown", bumpLocalActivity, opts);
    window.addEventListener("mousedown", bumpLocalActivity, opts);
    window.addEventListener("touchstart", bumpLocalActivity, opts);
    window.addEventListener("wheel", bumpLocalActivity, opts);
    window.addEventListener("mousemove", onMouseMove, opts);
    window.addEventListener("scroll", bumpLocalActivity, scrollOpts);

    const onConnect = () => {
      isAfk = false;
      bumpLocalActivity();
    };
    socket.on("connect", onConnect);
    if (socket.connected) {
      bumpLocalActivity();
    } else {
      scheduleIdleDeadline();
    }

    return () => {
      clearIdleTimer();
      window.removeEventListener("keydown", bumpLocalActivity);
      window.removeEventListener("mousedown", bumpLocalActivity);
      window.removeEventListener("touchstart", bumpLocalActivity);
      window.removeEventListener("wheel", bumpLocalActivity);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("scroll", bumpLocalActivity, scrollOpts);
      window.removeEventListener("storage", onStorage);
      if (bc) {
        bc.removeEventListener("message", onBcMessage);
        bc.close();
      }
      socket.off("connect", onConnect);
    };
  }, [session]);
}
