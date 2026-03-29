export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  createdAt: number;
  /** Set when the user has a profile photo (`/users/avatar/:id`). */
  avatarUrl?: string | null;
};

export type PlatformRole = "user" | "moderator" | "admin";

export type Session = {
  userId: string;
  username: string;
  displayName: string;
  /** From JWT / login; omitted in older stored sessions */
  platformRole?: PlatformRole;
  avatarUrl?: string | null;
};

/** Contact presence from the server (`offline` = not connected or not in sync payload). */
export type ContactPresence = "online" | "afk" | "offline";

export function contactPresenceFromMap(
  userId: string,
  map: Record<string, "online" | "afk">,
): ContactPresence {
  const s = map[userId];
  if (s === "online" || s === "afk") return s;
  return "offline";
}

export type ChatAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Path under API origin, e.g. `/messages/attachments/:id/file` */
  downloadUrl: string;
};

/** Reference to a parent message (reply). */
export type MessageReplyRef = {
  id: string;
  senderId: string;
  preview: string;
  senderDisplayName?: string;
  senderUsername?: string;
  deleted?: boolean;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  senderId: string;
  text: string;
  imageDataUrl?: string;
  attachments?: ChatAttachment[];
  createdAt: number;
  /** Set when the message was edited (ms since epoch). */
  editedAt?: number;
  /** Group room messages */
  senderDisplayName?: string;
  senderUsername?: string;
  replyTo?: MessageReplyRef;
};

export type DmReadOnlyReason = "not_friends" | "blocked";

export type DmThreadPayload = {
  messages: ChatMessage[];
  canSend: boolean;
  readOnlyReason: DmReadOnlyReason | null;
  /** More older messages available via `before` cursor. */
  hasMore: boolean;
};

export type RoomThreadPayload = {
  messages: ChatMessage[];
  canSend: boolean;
  hasMore: boolean;
};

export type UnreadDmEntry = {
  peerId: string;
  roomId: string;
  unreadCount: number;
};

export type UnreadRoomEntry = {
  roomId: string;
  unreadCount: number;
};

export type UnreadSummary = {
  dms: UnreadDmEntry[];
  rooms: UnreadRoomEntry[];
};

/** Room creator / owner account (see also `myRole` on RoomMember). */
export type RoomOwnerSummary = {
  id: string;
  username: string;
  displayName: string;
};

export type RoomDetail = {
  id: string;
  type: "public" | "private" | "dm";
  name: string | null;
  description: string;
  createdById: string;
  createdBy: RoomOwnerSummary;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  myRole: string | null;
  youAreMember: boolean;
  youAreBannedFromRoom: boolean;
};

export type FriendRequestIncoming = {
  id: string;
  requestMessage: string | null;
  createdAt: string;
  requester: PublicUser;
};

export type FriendRequestOutgoing = {
  id: string;
  requestMessage: string | null;
  createdAt: string;
  addressee: PublicUser;
};

export type RoomMemberProfile = PublicUser & { role: string };

export type PublicRoomCatalogItem = {
  id: string;
  name: string | null;
  description: string;
  memberCount: number;
  createdAt: string;
};

export type MyRoomSummary = {
  id: string;
  type: "public" | "private" | "dm";
  name: string | null;
  description: string;
  createdById: string;
  createdAt: string;
  memberCount: number;
  myRole: string;
};
