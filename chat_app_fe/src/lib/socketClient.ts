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

export function connectSocket(): Socket {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  if (socket?.connected) {
    socket.auth = { token };
    return socket;
  }

  socket = io(socketUrl(), {
    path: "/socket.io",
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnectionDelay: 400,
    reconnectionDelayMax: 4000,
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket?.removeAllListeners();
  socket = null;
}
