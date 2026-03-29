import { clearSessionClient, getToken } from "./authStorage";
import type {
  ChatMessage,
  DmThreadPayload,
  FriendRequestIncoming,
  FriendRequestOutgoing,
  MyRoomSummary,
  PlatformRole,
  PublicRoomCatalogItem,
  PublicUser,
  RoomDetail,
  RoomMemberProfile,
  RoomThreadPayload,
  Session,
  UnreadSummary,
} from "../types";

export function normalizeChatMessage(m: ChatMessage): ChatMessage {
  const createdAt =
    typeof m.createdAt === "number" ? m.createdAt : Number(m.createdAt);
  let editedAt: number | undefined;
  if (m.editedAt != null && m.editedAt !== undefined) {
    const n =
      typeof m.editedAt === "number" ? m.editedAt : Number(m.editedAt);
    if (!Number.isNaN(n)) editedAt = n;
  }
  return { ...m, createdAt, editedAt };
}

/** Set in `.env` for production or when the API is not on localhost:3000. */
function configuredApiOrigin(): string | undefined {
  const raw = import.meta.env.VITE_API_ORIGIN;
  if (raw == null || String(raw).trim() === "") return undefined;
  return String(raw).replace(/\/$/, "");
}

/**
 * Full URL for REST and file paths (`/auth/login`, `/uploads/...`).
 * - **Dev** without `VITE_API_ORIGIN`: same-origin `/api/...` (Vite proxies to Nest).
 * - **Prod** build: `http://localhost:3000` unless `VITE_API_ORIGIN` is set.
 */
export function resolveApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = configuredApiOrigin();
  if (base) return `${base}${p}`;
  if (import.meta.env.DEV) return `/api${p}`;
  return `http://localhost:3000${p}`;
}

/** Socket.IO server origin (no path). Uses the Vite dev server origin when proxying. */
export function getSocketIoUrl(): string {
  const base = configuredApiOrigin();
  if (base) return base;
  if (import.meta.env.DEV) {
    return typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:5173";
  }
  return "http://localhost:3000";
}

type LoginBody = { email: string; password: string };
type RegisterBody = LoginBody & {
  username: string;
  displayName: string;
};

type AuthResponseUser = {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
  email?: string;
  role?: PlatformRole;
  avatarUrl?: string | null;
};

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user: AuthResponseUser;
};

function normalizePublicUser(u: AuthResponseUser): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    createdAt: new Date(u.createdAt).getTime(),
    avatarUrl: u.avatarUrl ?? null,
  };
}

function normalizeAuthUser(
  u: AuthResponseUser,
): PublicUser & { role?: PlatformRole } {
  return {
    ...normalizePublicUser(u),
    role: u.role,
  };
}

async function parseErrorResponse(res: Response): Promise<string> {
  let msg = res.statusText;
  try {
    const j = (await res.json()) as { message?: unknown; error?: string };
    if (typeof j.message === "string") msg = j.message;
    else if (Array.isArray(j.message)) msg = j.message.join(", ");
    else if (j.error) msg = j.error;
  } catch {
    /* ignore */
  }
  return msg;
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: boolean } = {},
): Promise<T> {
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers: HeadersInit = {
    ...(init.body && !isFormData
      ? { "Content-Type": "application/json" }
      : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.token !== false) {
    const t = getToken();
    if (t) (headers as Record<string, string>)["Authorization"] = `Bearer ${t}`;
  }

  let res: Response;
  try {
    res = await fetch(resolveApiUrl(path), { ...init, headers });
  } catch (e) {
    const devHint =
      import.meta.env.DEV && !configuredApiOrigin()
        ? " Start the API (e.g. in chat_app_be: npm run start:dev) so it listens on port 3000."
        : " Check VITE_API_ORIGIN and that the API is running.";
    throw new Error(
      e instanceof TypeError || (e instanceof Error && e.name === "TypeError")
        ? `Cannot reach the server.${devHint}`
        : e instanceof Error
          ? e.message
          : "Network error",
    );
  }
  if (!res.ok) {
    const msg = await parseErrorResponse(res);
    if (res.status === 401 && init.token !== false) {
      clearSessionClient();
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiLogin(
  body: LoginBody,
): Promise<{
  token: string;
  refreshToken: string;
  sessionId: string;
  user: PublicUser & { role?: PlatformRole };
}> {
  const data = await request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    token: false,
  });
  return {
    token: data.accessToken,
    refreshToken: data.refreshToken,
    sessionId: data.sessionId,
    user: normalizeAuthUser(data.user),
  };
}

export async function apiRegister(
  body: RegisterBody,
): Promise<{
  token: string;
  refreshToken: string;
  sessionId: string;
  user: PublicUser & { role?: PlatformRole };
}> {
  const data = await request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
    token: false,
  });
  return {
    token: data.accessToken,
    refreshToken: data.refreshToken,
    sessionId: data.sessionId,
    user: normalizeAuthUser(data.user),
  };
}

export type AuthSessionRow = {
  id: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

export async function apiListAuthSessions(): Promise<AuthSessionRow[]> {
  return request<AuthSessionRow[]>("/auth/sessions");
}

export async function apiRevokeAuthSession(sessionId: string): Promise<void> {
  await request(`/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}

/** Ends the current refresh session on the server (other devices unchanged). */
export async function apiLogout(): Promise<void> {
  await request("/auth/logout", { method: "POST" });
}

export async function apiGetMe(): Promise<
  PublicUser & { email?: string; role?: PlatformRole }
> {
  const u = await request<AuthResponseUser>("/users/me");
  return normalizeAuthUser(u);
}

export async function apiUploadProfileAvatar(file: File): Promise<
  PublicUser & { email?: string; role?: PlatformRole }
> {
  const form = new FormData();
  form.append("file", file);
  const u = await request<AuthResponseUser>("/users/me/avatar", {
    method: "POST",
    body: form,
  });
  return normalizeAuthUser(u);
}

export async function apiDeleteProfileAvatar(): Promise<
  PublicUser & { email?: string; role?: PlatformRole }
> {
  const u = await request<AuthResponseUser>("/users/me/avatar", {
    method: "DELETE",
  });
  return normalizeAuthUser(u);
}

export async function apiChangePassword(body: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ message: string }> {
  return request("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiDeleteAccount(password: string): Promise<{
  message: string;
}> {
  return request("/users/me", {
    method: "DELETE",
    body: JSON.stringify({ password }),
  });
}

export async function apiRequestPasswordReset(email: string): Promise<{
  message: string;
  resetUrl?: string;
  resetToken?: string;
}> {
  return request("/auth/request-password-reset", {
    method: "POST",
    body: JSON.stringify({ email }),
    token: false,
  });
}

export async function apiResetPassword(body: {
  email: string;
  token: string;
  newPassword: string;
}): Promise<{ message: string }> {
  return request("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(body),
    token: false,
  });
}

export async function apiListUsers(): Promise<PublicUser[]> {
  const list = await request<AuthResponseUser[]>("/users");
  return list.map(normalizePublicUser);
}

export async function apiListFriends(): Promise<PublicUser[]> {
  const list = await request<AuthResponseUser[]>("/friends");
  return list.map(normalizePublicUser);
}

export async function apiIncomingFriendRequests(): Promise<FriendRequestIncoming[]> {
  return request<FriendRequestIncoming[]>("/friends/requests/incoming");
}

export async function apiOutgoingFriendRequests(): Promise<
  FriendRequestOutgoing[]
> {
  return request<FriendRequestOutgoing[]>("/friends/requests/outgoing");
}

export async function apiSendFriendRequest(body: {
  username?: string;
  userId?: string;
  message?: string;
}): Promise<unknown> {
  return request("/friends/requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiAcceptFriendRequest(requestId: string): Promise<unknown> {
  return request(`/friends/requests/${encodeURIComponent(requestId)}/accept`, {
    method: "POST",
  });
}

export async function apiDeclineFriendRequest(requestId: string): Promise<unknown> {
  return request(`/friends/requests/${encodeURIComponent(requestId)}/decline`, {
    method: "POST",
  });
}

export async function apiCancelOutgoingFriendRequest(
  requestId: string,
): Promise<void> {
  return request(`/friends/requests/outgoing/${encodeURIComponent(requestId)}`, {
    method: "DELETE",
  });
}

export async function apiRemoveFriend(peerUserId: string): Promise<void> {
  return request(`/friends/${encodeURIComponent(peerUserId)}`, {
    method: "DELETE",
  });
}

export async function apiBanUser(body: {
  username?: string;
  userId?: string;
}): Promise<void> {
  return request("/friends/bans", { method: "POST", body: JSON.stringify(body) });
}

export async function apiUnbanUser(bannedUserId: string): Promise<void> {
  return request(`/friends/bans/${encodeURIComponent(bannedUserId)}`, {
    method: "DELETE",
  });
}

export async function apiRoomMembers(roomId: string): Promise<RoomMemberProfile[]> {
  const list = await request<(AuthResponseUser & { role: string })[]>(
    `/rooms/${encodeURIComponent(roomId)}/members`,
  );
  return list.map((r) => ({
    ...normalizePublicUser(r),
    role: r.role,
  }));
}

export async function apiPublicRoomCatalog(q?: string): Promise<
  PublicRoomCatalogItem[]
> {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return request<PublicRoomCatalogItem[]>(`/rooms/catalog${qs}`);
}

export async function apiMyRooms(): Promise<MyRoomSummary[]> {
  return request<MyRoomSummary[]>("/rooms");
}

export async function apiCreateRoom(body: {
  type: "public" | "private";
  name: string;
  description?: string;
}): Promise<{ id: string }> {
  return request("/rooms", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiJoinRoom(roomId: string): Promise<void> {
  await request(`/rooms/${encodeURIComponent(roomId)}/join`, {
    method: "POST",
  });
}

export async function apiLeaveRoom(roomId: string): Promise<void> {
  await request(`/rooms/${encodeURIComponent(roomId)}/leave`, {
    method: "POST",
  });
}

export async function apiDeleteRoom(roomId: string): Promise<void> {
  await request(`/rooms/${encodeURIComponent(roomId)}`, {
    method: "DELETE",
  });
}

export async function apiGetRoom(roomId: string): Promise<RoomDetail> {
  return request<RoomDetail>(`/rooms/${encodeURIComponent(roomId)}`);
}

/** `invite` is username, email, or user id (UUID). */
export async function apiInviteToRoom(
  roomId: string,
  invite: string,
): Promise<void> {
  await request(`/rooms/${encodeURIComponent(roomId)}/invite`, {
    method: "POST",
    body: JSON.stringify({ invite }),
  });
}

export async function apiRoomMessages(
  roomId: string,
  opts?: { before?: string; limit?: number },
): Promise<RoomThreadPayload> {
  const params = new URLSearchParams();
  if (opts?.before) params.set("before", opts.before);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  const q = params.toString();
  const raw = await request<{
    messages: ChatMessage[];
    canSend: boolean;
    hasMore?: boolean;
  }>(
    `/messages/room/${encodeURIComponent(roomId)}${q ? `?${q}` : ""}`,
  );
  return {
    messages: raw.messages.map((m) => normalizeChatMessage(m)),
    canSend: raw.canSend,
    hasMore: raw.hasMore ?? false,
  };
}

export async function apiUploadRoomAttachment(
  roomId: string,
  file: File,
  caption?: string,
  replyToMessageId?: string,
): Promise<ChatMessage> {
  const form = new FormData();
  form.append("file", file);
  if (caption != null && caption.trim() !== "") {
    form.append("caption", caption);
  }
  if (replyToMessageId) form.append("replyToMessageId", replyToMessageId);
  const raw = await request<ChatMessage>(
    `/messages/room/${encodeURIComponent(roomId)}/attachment`,
    {
      method: "POST",
      body: form,
    },
  );
  return normalizeChatMessage(raw);
}

export async function apiMessages(
  peerId: string,
  opts?: { before?: string; limit?: number },
): Promise<DmThreadPayload> {
  const params = new URLSearchParams();
  if (opts?.before) params.set("before", opts.before);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  const q = params.toString();
  const raw = await request<{
    messages: ChatMessage[];
    canSend: boolean;
    readOnlyReason: "not_friends" | "blocked" | null;
    hasMore?: boolean;
  }>(`/messages/dm/${encodeURIComponent(peerId)}${q ? `?${q}` : ""}`);
  return {
    messages: raw.messages.map((m) => normalizeChatMessage(m)),
    canSend: raw.canSend,
    readOnlyReason: raw.readOnlyReason,
    hasMore: raw.hasMore ?? false,
  };
}

export async function apiUploadDmAttachment(
  peerId: string,
  file: File,
  caption?: string,
  replyToMessageId?: string,
): Promise<ChatMessage> {
  const form = new FormData();
  form.append("file", file);
  if (caption != null && caption.trim() !== "") {
    form.append("caption", caption);
  }
  if (replyToMessageId) form.append("replyToMessageId", replyToMessageId);
  const raw = await request<ChatMessage>(
    `/messages/dm/${encodeURIComponent(peerId)}/attachment`,
    {
      method: "POST",
      body: form,
    },
  );
  return normalizeChatMessage(raw);
}

export async function apiPatchMessage(
  messageId: string,
  body: { text: string },
): Promise<ChatMessage> {
  const raw = await request<ChatMessage>(
    `/messages/msg/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
  return normalizeChatMessage(raw);
}

export type AdminUserRow = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: PlatformRole;
  createdAt: string;
};

export async function apiAdminUsers(q?: string): Promise<AdminUserRow[]> {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return request<AdminUserRow[]>(`/admin/users${qs}`);
}

export async function apiAdminSetUserRole(
  userId: string,
  role: PlatformRole,
): Promise<AdminUserRow> {
  return request(`/admin/users/${encodeURIComponent(userId)}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function apiDeleteMessage(messageId: string): Promise<void> {
  await request(`/messages/msg/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
  });
}

export async function apiUnreadSummary(): Promise<UnreadSummary> {
  return request<UnreadSummary>("/messages/unread-summary");
}

export async function apiMarkDmRead(peerId: string): Promise<void> {
  await request(`/messages/dm/${encodeURIComponent(peerId)}/read`, {
    method: "POST",
  });
}

export async function apiMarkRoomRead(roomId: string): Promise<void> {
  await request(`/messages/room/${encodeURIComponent(roomId)}/read`, {
    method: "POST",
  });
}

export async function apiRoomKick(
  roomId: string,
  userId: string,
): Promise<void> {
  await request(`/rooms/${encodeURIComponent(roomId)}/kick`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export async function apiRoomAddAdmin(
  roomId: string,
  userId: string,
): Promise<void> {
  await request(`/rooms/${encodeURIComponent(roomId)}/admins`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export async function apiRoomRemoveAdmin(
  roomId: string,
  userId: string,
): Promise<void> {
  await request(
    `/rooms/${encodeURIComponent(roomId)}/admins/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export async function apiRoomPromoteMod(
  roomId: string,
  userId: string,
): Promise<void> {
  await request(`/rooms/${encodeURIComponent(roomId)}/promote-mod`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export async function apiRoomDemoteMod(
  roomId: string,
  userId: string,
): Promise<void> {
  await request(
    `/rooms/${encodeURIComponent(roomId)}/moderators/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export type RoomBanEntry = {
  userId: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    createdAt: string;
  };
  /** Staff member who issued the ban (null for legacy rows). */
  bannedBy: {
    id: string;
    username: string;
    displayName: string;
    createdAt: string;
  } | null;
};

export async function apiRoomBanList(roomId: string): Promise<RoomBanEntry[]> {
  return request(`/rooms/${encodeURIComponent(roomId)}/bans`);
}

export async function apiRoomBanUser(
  roomId: string,
  userId: string,
): Promise<void> {
  await request(`/rooms/${encodeURIComponent(roomId)}/bans`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export async function apiRoomUnbanUser(
  roomId: string,
  bannedUserId: string,
): Promise<void> {
  await request(
    `/rooms/${encodeURIComponent(roomId)}/bans/${encodeURIComponent(bannedUserId)}`,
    { method: "DELETE" },
  );
}

export function sessionFromPublicUser(
  user: PublicUser & { role?: PlatformRole },
): Session {
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    platformRole: user.role ?? "user",
    avatarUrl: user.avatarUrl ?? null,
  };
}
