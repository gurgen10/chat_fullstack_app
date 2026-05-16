import { io, type Socket } from "socket.io-client";
import { getToken } from "./authStorage";
import { getSocketIoUrl } from "./api";

let socket: Socket | null = null;

function socketUrl(): string {
  return getSocketIoUrl();
}

export function getSocket(): Socket | null {
  return socket;
}

function createSocket(token: string): Socket {
  const s = io(socketUrl(), {
    path: "/socket.io",
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnectionDelay: 400,
    reconnectionDelayMax: 4000,
  });

  s.on("connect_error", (err) => {
    console.warn("Socket connect error:", err);
  });

  s.on("disconnect", (reason) => {
    console.warn("Socket disconnected:", reason);
  });

  return s;
}

export function connectSocket(): Socket {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  if (socket?.connected) {
    socket.auth = { token };
    return socket;
  }

  if (socket) {
    socket.disconnect();
    socket.removeAllListeners();
    socket = null;
  }

  socket = createSocket(token);
  return socket;
}

export async function ensureSocketConnected(): Promise<Socket> {
  const s = connectSocket();
  if (s.connected) return s;

  return new Promise<Socket>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Socket connection timed out"));
    }, 6000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      s.off("connect", onConnect);
      s.off("connect_error", onError);
      s.off("error", onError);
      s.off("disconnect", onDisconnect);
    };

    const onConnect = () => {
      cleanup();
      resolve(s);
    };

    const onError = (err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const onDisconnect = (reason: string) => {
      if (!s.connected) {
        cleanup();
        reject(new Error(`Socket disconnected before connect: ${reason}`));
      }
    };

    s.once("connect", onConnect);
    s.once("connect_error", onError);
    s.once("error", onError);
    s.once("disconnect", onDisconnect);
  });
}

export async function emitWithAck(
  event: string,
  payload: unknown,
  timeoutMs = 5000,
): Promise<unknown> {
  const s = await ensureSocketConnected();
  return await new Promise<unknown>((resolve, reject) => {
    let finished = false;
    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error("Socket ack timed out"));
    }, timeoutMs);

    s.emit(event, payload, (res: unknown) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      resolve(res);
    });
  });
}

export function disconnectSocket() {
  socket?.disconnect();
  socket?.removeAllListeners();
  socket = null;
}
