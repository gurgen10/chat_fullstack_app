import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { join, posix } from 'path';
import type { Readable } from 'stream';
import type { MessageKind } from '@prisma/client';
import { FriendsService } from '../friends/friends.service';
import { PrismaService } from '../prisma/prisma.service';

/** Spec §3.4 — inline / pasted images (data URLs). */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
/** Spec §3.4 — attachment uploads. */
const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Max UTF-8 byte length for message text (plain, multiline, emoji). */
const MAX_MESSAGE_TEXT_BYTES = 3072;
const UPLOAD_DIR = 'uploads';

function assertUtf8MessageTextLength(text: string): void {
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_MESSAGE_TEXT_BYTES) {
    throw new BadRequestException(
      `Message text exceeds ${MAX_MESSAGE_TEXT_BYTES} bytes (UTF-8)`,
    );
  }
}

function previewReplyText(text: string, hasImage: boolean): string {
  const t = text.trim();
  if (hasImage && !t) return '📷 Image';
  if (!t) return '';
  const maxChars = 120;
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars - 1)}…`;
}

function dmThreadId(userA: string, userB: string): string {
  return [userA, userB].sort().join(':');
}

export type MessageAttachmentDto = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl: string;
};

export type MessageReplyRefDto = {
  id: string;
  senderId: string;
  preview: string;
  senderDisplayName?: string;
  senderUsername?: string;
  deleted?: boolean;
};

export type ChatMessageDto = {
  id: string;
  threadId: string;
  senderId: string;
  text: string;
  imageDataUrl?: string;
  attachments?: MessageAttachmentDto[];
  createdAt: number;
  /** Present when the message was edited after send */
  editedAt?: number;
  /** Set for group room messages */
  senderDisplayName?: string;
  senderUsername?: string;
  replyTo?: MessageReplyRefDto;
};

export type DmThreadDto = {
  messages: ChatMessageDto[];
  canSend: boolean;
  readOnlyReason: 'not_friends' | 'blocked' | null;
  /** False when no more older messages for this thread (pagination). */
  hasMore: boolean;
};

export type RoomThreadDto = {
  messages: ChatMessageDto[];
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

export type UnreadSummaryDto = {
  dms: UnreadDmEntry[];
  rooms: UnreadRoomEntry[];
};

/** Default page size for infinite scroll; large rooms may have 10k+ messages (spec §3.2 / §3.3). */
const DEFAULT_MESSAGE_PAGE = 100;
const MAX_MESSAGE_PAGE = 100;

function clampMessageLimit(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return DEFAULT_MESSAGE_PAGE;
  const n = Math.floor(raw);
  return Math.min(MAX_MESSAGE_PAGE, Math.max(1, n));
}

const MIXED_BODY_KEY = '_chatMixedV1' as const;

type MixedBody = {
  [MIXED_BODY_KEY]: true;
  text: string;
  image: string;
};

function encodeMessageBody(text: string, image?: string): string {
  if (image && text) {
    const payload: MixedBody = {
      [MIXED_BODY_KEY]: true,
      text,
      image,
    };
    return JSON.stringify(payload);
  }
  if (image) return image;
  return text;
}

function decodeMessageBody(body: string): { text: string; imageDataUrl?: string } {
  if (body.startsWith('data:image')) {
    return { text: '', imageDataUrl: body };
  }
  try {
    const o = JSON.parse(body) as unknown;
    if (
      o &&
      typeof o === 'object' &&
      MIXED_BODY_KEY in o &&
      (o as MixedBody)[MIXED_BODY_KEY] === true &&
      'image' in o &&
      typeof (o as MixedBody).image === 'string' &&
      (o as MixedBody).image.startsWith('data:image')
    ) {
      const m = o as MixedBody;
      return {
        text: typeof m.text === 'string' ? m.text : '',
        imageDataUrl: m.image,
      };
    }
  } catch {
    /* plain text */
  }
  return { text: body };
}

type ReplyToRow = {
  id: string;
  body: string | null;
  senderId: string;
  deletedAt: Date | null;
  sender?: { displayName: string; username: string };
};

type MessageRow = {
  id: string;
  body: string | null;
  senderId: string;
  createdAt: Date;
  editedAt?: Date | null;
  replyTo?: ReplyToRow | null;
  attachments?: Array<{
    id: string;
    mimeType: string;
    originalName: string;
    sizeBytes: number;
  }>;
  sender?: { displayName: string; username: string };
};

const MESSAGE_REPLY_SELECT = {
  select: {
    id: true,
    body: true,
    senderId: true,
    deletedAt: true,
    sender: { select: { displayName: true, username: true } },
  },
} as const;

@Injectable()
export class MessagesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
  ) {}

  onModuleInit() {
    const dir = join(process.cwd(), UPLOAD_DIR);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private mapReplyToDto(replyTo: ReplyToRow): MessageReplyRefDto {
    const { text, imageDataUrl } = decodeMessageBody(replyTo.body ?? '');
    const preview = replyTo.deletedAt
      ? 'Message deleted'
      : previewReplyText(text, !!imageDataUrl);
    return {
      id: replyTo.id,
      senderId: replyTo.senderId,
      preview,
      senderDisplayName: replyTo.sender?.displayName,
      senderUsername: replyTo.sender?.username,
      deleted: replyTo.deletedAt != null,
    };
  }

  private buildMessageDto(m: MessageRow, threadId: string): ChatMessageDto {
    const body = m.body ?? '';
    const { text, imageDataUrl } = decodeMessageBody(body);
    const attRows = m.attachments ?? [];
    const attachments: MessageAttachmentDto[] | undefined =
      attRows.length > 0
        ? attRows.map((a) => ({
            id: a.id,
            fileName: a.originalName,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            downloadUrl: `/messages/attachments/${a.id}/file`,
          }))
        : undefined;

    const dto: ChatMessageDto = {
      id: m.id,
      threadId,
      senderId: m.senderId,
      text,
      imageDataUrl,
      attachments,
      createdAt: m.createdAt.getTime(),
    };
    if (m.editedAt) {
      dto.editedAt = m.editedAt.getTime();
    }
    if (m.sender) {
      dto.senderDisplayName = m.sender.displayName;
      dto.senderUsername = m.sender.username;
    }
    if (m.replyTo) {
      dto.replyTo = this.mapReplyToDto(m.replyTo);
    }
    return dto;
  }

  private mapRow(
    m: MessageRow,
    selfId: string,
    peerId: string,
  ): ChatMessageDto {
    return this.buildMessageDto(m, dmThreadId(selfId, peerId));
  }

  /** Public or private room only (not DM). Banned users cannot access messages or files. */
  private async assertGroupRoomMember(userId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, type: true },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room.type === 'dm') {
      throw new BadRequestException('Not a group room');
    }

    const banned = await this.prisma.roomBan.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true },
    });
    if (banned) {
      throw new ForbiddenException('You are banned from this room');
    }

    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this room');
    }
    return room;
  }

  private async assertValidReplyInRoom(
    roomId: string,
    replyToId: string,
  ): Promise<void> {
    const parent = await this.prisma.message.findFirst({
      where: { id: replyToId, roomId, deletedAt: null },
      select: { id: true },
    });
    if (!parent) {
      throw new BadRequestException('Reply target not found in this chat');
    }
  }

  async listRoomMessages(
    userId: string,
    roomId: string,
    opts?: { before?: string; limit?: number },
  ): Promise<RoomThreadDto> {
    await this.assertGroupRoomMember(userId, roomId);

    const limit = clampMessageLimit(opts?.limit);
    const take = limit + 1;

    const roomSelect = {
      id: true,
      body: true,
      senderId: true,
      createdAt: true,
      editedAt: true,
      sender: { select: { displayName: true, username: true } },
      replyTo: MESSAGE_REPLY_SELECT,
      attachments: {
        select: {
          id: true,
          mimeType: true,
          originalName: true,
          sizeBytes: true,
        },
      },
    } as const;

    let rows: MessageRow[];

    if (opts?.before) {
      const anchor = await this.prisma.message.findFirst({
        where: { id: opts.before, roomId, deletedAt: null },
        select: { id: true, createdAt: true },
      });
      if (!anchor) {
        throw new BadRequestException('Invalid before cursor');
      }
      rows = await this.prisma.message.findMany({
        where: {
          roomId,
          deletedAt: null,
          OR: [
            { createdAt: { lt: anchor.createdAt } },
            {
              AND: [
                { createdAt: anchor.createdAt },
                { id: { lt: anchor.id } },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        select: roomSelect,
      });
    } else {
      rows = await this.prisma.message.findMany({
        where: { roomId, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        select: roomSelect,
      });
    }

    const hasMore = rows.length > limit;
    const slice = rows.slice(0, limit).reverse();
    const threadId = `room:${roomId}`;
    const messages = slice.map((r) => this.buildMessageDto(r, threadId));
    return { messages, canSend: true, hasMore };
  }

  async sendRoomMessage(
    senderId: string,
    roomId: string | undefined,
    textRaw: string | undefined,
    imageDataUrl: string | undefined,
    replyToId?: string | undefined,
  ): Promise<ChatMessageDto> {
    if (!roomId || typeof roomId !== 'string') {
      throw new BadRequestException('roomId required');
    }

    const rawText = typeof textRaw === 'string' ? textRaw : '';
    const image =
      typeof imageDataUrl === 'string' ? imageDataUrl : undefined;

    if (!rawText.trim() && !image) {
      throw new BadRequestException('Message empty');
    }
    if (rawText.length > 0) {
      assertUtf8MessageTextLength(rawText);
    }
    if (image) {
      const approxBytes = Math.ceil((image.length * 3) / 4);
      if (approxBytes > MAX_IMAGE_BYTES) {
        throw new BadRequestException('Image too large (max 3 MB)');
      }
    }

    await this.assertGroupRoomMember(senderId, roomId);

    if (replyToId != null && replyToId !== '') {
      await this.assertValidReplyInRoom(roomId, replyToId);
    }

    const body = encodeMessageBody(rawText, image);
    const kind =
      image && rawText.trim() ? 'mixed' : image ? 'attachment' : 'text';

    const created = await this.prisma.message.create({
      data: {
        roomId,
        senderId,
        body,
        kind,
        replyToId:
          replyToId != null && replyToId !== '' ? replyToId : undefined,
      },
      select: {
        id: true,
        body: true,
        senderId: true,
        createdAt: true,
        editedAt: true,
        sender: { select: { displayName: true, username: true } },
        replyTo: MESSAGE_REPLY_SELECT,
        attachments: {
          select: {
            id: true,
            mimeType: true,
            originalName: true,
            sizeBytes: true,
          },
        },
      },
    });

    return this.buildMessageDto(created, `room:${roomId}`);
  }

  async sendRoomFileAttachment(
    senderId: string,
    roomId: string,
    file: Express.Multer.File,
    captionRaw?: string,
    replyToId?: string,
  ): Promise<ChatMessageDto> {
    if (!roomId || typeof roomId !== 'string') {
      throw new BadRequestException('roomId required');
    }
    if (!file || !file.filename) {
      throw new BadRequestException('file required');
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException('File too large (max 20 MB)');
    }

    const caption =
      typeof captionRaw === 'string' ? captionRaw : '';
    if (caption.trim().length > 0) {
      assertUtf8MessageTextLength(caption);
    }

    await this.assertGroupRoomMember(senderId, roomId);

    if (replyToId != null && replyToId !== '') {
      await this.assertValidReplyInRoom(roomId, replyToId);
    }

    const relativePath = posix.join(UPLOAD_DIR, file.filename);
    const kind = caption.trim().length > 0 ? 'mixed' : 'attachment';

    const created = await this.prisma.message.create({
      data: {
        roomId,
        senderId,
        body: caption.trim().length > 0 ? caption : null,
        kind,
        replyToId:
          replyToId != null && replyToId !== '' ? replyToId : undefined,
        attachments: {
          create: [
            {
              uploaderId: senderId,
              mimeType: file.mimetype || 'application/octet-stream',
              originalName: file.originalname.slice(0, 240),
              storagePath: relativePath,
              sizeBytes: file.size,
            },
          ],
        },
      },
      select: {
        id: true,
        body: true,
        senderId: true,
        createdAt: true,
        editedAt: true,
        sender: { select: { displayName: true, username: true } },
        replyTo: MESSAGE_REPLY_SELECT,
        attachments: {
          select: {
            id: true,
            mimeType: true,
            originalName: true,
            sizeBytes: true,
          },
        },
      },
    });

    return this.buildMessageDto(created, `room:${roomId}`);
  }

  /** Existing DM room only; does not create. */
  private async findDmRoom(userId: string, peerId: string) {
    const candidates = await this.prisma.room.findMany({
      where: {
        type: 'dm',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: peerId } } },
        ],
      },
      select: {
        id: true,
        _count: { select: { members: true } },
      },
    });

    const existing = candidates.find((r) => r._count.members === 2);
    if (!existing) return null;

    return this.prisma.room.findUnique({
      where: { id: existing.id },
      select: { id: true },
    });
  }

  private async createDmRoom(userId: string, peerId: string) {
    return this.prisma.room.create({
      data: {
        type: 'dm',
        createdById: userId,
        members: {
          create: [
            { userId, role: 'member' },
            { userId: peerId, role: 'member' },
          ],
        },
      },
      select: { id: true },
    });
  }

  async getOrCreateDmRoom(userId: string, peerId: string) {
    if (userId === peerId) {
      throw new BadRequestException('Cannot message yourself');
    }

    const peer = await this.prisma.user.findUnique({
      where: { id: peerId },
      select: { id: true },
    });
    if (!peer) throw new NotFoundException('User not found');

    const found = await this.findDmRoom(userId, peerId);
    if (found) return found;

    return this.createDmRoom(userId, peerId);
  }

  /** Existing DM room id for the pair, if any. */
  async resolveDmRoomId(userId: string, peerId: string): Promise<string | null> {
    const room = await this.findDmRoom(userId, peerId);
    return room?.id ?? null;
  }

  async getRoomMemberUserIds(roomId: string): Promise<string[]> {
    const rows = await this.prisma.roomMember.findMany({
      where: { roomId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  private async countUnreadFromOthers(
    userId: string,
    roomId: string,
    lastReadMessageId: string | null,
  ): Promise<number> {
    let anchor: { createdAt: Date; id: string } | null = null;
    if (lastReadMessageId) {
      anchor = await this.prisma.message.findFirst({
        where: { id: lastReadMessageId, roomId },
        select: { id: true, createdAt: true },
      });
    }

    const base = {
      roomId,
      deletedAt: null,
      senderId: { not: userId },
    };

    if (!anchor) {
      return this.prisma.message.count({ where: base });
    }

    return this.prisma.message.count({
      where: {
        ...base,
        OR: [
          { createdAt: { gt: anchor.createdAt } },
          {
            AND: [
              { createdAt: anchor.createdAt },
              { id: { gt: anchor.id } },
            ],
          },
        ],
      },
    });
  }

  async getUnreadSummary(userId: string): Promise<UnreadSummaryDto> {
    const memberships = await this.prisma.roomMember.findMany({
      where: { userId },
      select: {
        roomId: true,
        room: { select: { type: true } },
      },
    });

    const dms: UnreadDmEntry[] = [];
    const rooms: UnreadRoomEntry[] = [];

    for (const m of memberships) {
      if (m.room.type !== 'dm') {
        const banned = await this.prisma.roomBan.findUnique({
          where: { roomId_userId: { roomId: m.roomId, userId } },
          select: { id: true },
        });
        if (banned) continue;
      }

      const readState = await this.prisma.chatReadState.findUnique({
        where: {
          userId_roomId: { userId, roomId: m.roomId },
        },
        select: { lastReadMessageId: true },
      });

      const unreadCount = await this.countUnreadFromOthers(
        userId,
        m.roomId,
        readState?.lastReadMessageId ?? null,
      );

      if (m.room.type === 'dm') {
        const other = await this.prisma.roomMember.findFirst({
          where: { roomId: m.roomId, userId: { not: userId } },
          select: { userId: true },
        });
        if (other) {
          dms.push({
            peerId: other.userId,
            roomId: m.roomId,
            unreadCount,
          });
        }
      } else {
        rooms.push({ roomId: m.roomId, unreadCount });
      }
    }

    return { dms, rooms };
  }

  async markRoomRead(actorId: string, roomId: string): Promise<void> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, type: true },
    });
    if (!room) throw new NotFoundException('Room not found');

    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: actorId } },
      select: { id: true },
    });
    if (!member) throw new ForbiddenException('Not a member');

    if (room.type !== 'dm') {
      const banned = await this.prisma.roomBan.findUnique({
        where: { roomId_userId: { roomId, userId: actorId } },
        select: { id: true },
      });
      if (banned) throw new ForbiddenException('You are banned from this room');
    }

    const latest = await this.prisma.message.findFirst({
      where: { roomId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });

    await this.prisma.chatReadState.upsert({
      where: {
        userId_roomId: { userId: actorId, roomId },
      },
      create: {
        userId: actorId,
        roomId,
        lastReadMessageId: latest?.id ?? null,
      },
      update: {
        lastReadMessageId: latest?.id ?? null,
      },
    });
  }

  async markDmRead(actorId: string, peerId: string): Promise<void> {
    const room = await this.findDmRoom(actorId, peerId);
    if (!room) {
      return;
    }
    await this.markRoomRead(actorId, room.id);
  }

  async listDmMessages(
    userId: string,
    peerId: string,
    opts?: { before?: string; limit?: number },
  ): Promise<DmThreadDto> {
    if (userId === peerId) {
      throw new BadRequestException('Invalid peer');
    }

    const peer = await this.prisma.user.findUnique({
      where: { id: peerId },
      select: { id: true },
    });
    if (!peer) throw new NotFoundException('User not found');

    const room = await this.findDmRoom(userId, peerId);
    const limit = clampMessageLimit(opts?.limit);
    const take = limit + 1;

    const dmSelect = {
      id: true,
      body: true,
      senderId: true,
      createdAt: true,
      editedAt: true,
      replyTo: MESSAGE_REPLY_SELECT,
      attachments: {
        select: {
          id: true,
          mimeType: true,
          originalName: true,
          sizeBytes: true,
        },
      },
    } as const;

    let rows: MessageRow[];

    if (!room) {
      rows = [];
    } else if (opts?.before) {
      const anchor = await this.prisma.message.findFirst({
        where: { id: opts.before, roomId: room.id, deletedAt: null },
        select: { id: true, createdAt: true },
      });
      if (!anchor) {
        throw new BadRequestException('Invalid before cursor');
      }
      rows = await this.prisma.message.findMany({
        where: {
          roomId: room.id,
          deletedAt: null,
          OR: [
            { createdAt: { lt: anchor.createdAt } },
            {
              AND: [
                { createdAt: anchor.createdAt },
                { id: { lt: anchor.id } },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        select: dmSelect,
      });
    } else {
      rows = await this.prisma.message.findMany({
        where: { roomId: room.id, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        select: dmSelect,
      });
    }

    const hasMore = rows.length > limit;
    const slice = rows.slice(0, limit).reverse();
    const messages = slice.map((r) => this.mapRow(r, userId, peerId));

    const canSend = await this.friends.canExchangePersonalMessages(
      userId,
      peerId,
    );
    let readOnlyReason: DmThreadDto['readOnlyReason'] = null;
    if (!canSend) {
      readOnlyReason = (await this.friends.pairHasAnyBan(userId, peerId))
        ? 'blocked'
        : 'not_friends';
    }

    return { messages, canSend, readOnlyReason, hasMore: room ? hasMore : false };
  }

  async sendDmMessage(
    senderId: string,
    peerId: string | undefined,
    textRaw: string | undefined,
    imageDataUrl: string | undefined,
    replyToId?: string | undefined,
  ): Promise<ChatMessageDto> {
    if (!peerId || typeof peerId !== 'string') {
      throw new BadRequestException('peerId required');
    }

    const rawText = typeof textRaw === 'string' ? textRaw : '';
    const image =
      typeof imageDataUrl === 'string' ? imageDataUrl : undefined;

    if (!rawText.trim() && !image) {
      throw new BadRequestException('Message empty');
    }
    if (rawText.length > 0) {
      assertUtf8MessageTextLength(rawText);
    }
    if (image) {
      const approxBytes = Math.ceil((image.length * 3) / 4);
      if (approxBytes > MAX_IMAGE_BYTES) {
        throw new BadRequestException('Image too large (max 3 MB)');
      }
    }

    await this.friends.assertCanSendPersonalMessage(senderId, peerId);

    const room = await this.getOrCreateDmRoom(senderId, peerId);

    if (replyToId != null && replyToId !== '') {
      await this.assertValidReplyInRoom(room.id, replyToId);
    }

    const body = encodeMessageBody(rawText, image);
    const kind =
      image && rawText.trim() ? 'mixed' : image ? 'attachment' : 'text';

    const created = await this.prisma.message.create({
      data: {
        roomId: room.id,
        senderId,
        body,
        kind,
        replyToId:
          replyToId != null && replyToId !== '' ? replyToId : undefined,
      },
      select: {
        id: true,
        body: true,
        senderId: true,
        createdAt: true,
        editedAt: true,
        replyTo: MESSAGE_REPLY_SELECT,
        attachments: {
          select: {
            id: true,
            mimeType: true,
            originalName: true,
            sizeBytes: true,
          },
        },
      },
    });

    return this.mapRow(created, senderId, peerId);
  }

  async sendDmFileAttachment(
    senderId: string,
    peerId: string,
    file: Express.Multer.File,
    captionRaw?: string,
    replyToId?: string,
  ): Promise<ChatMessageDto> {
    if (!peerId || typeof peerId !== 'string') {
      throw new BadRequestException('peerId required');
    }
    if (!file || !file.filename) {
      throw new BadRequestException('file required');
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException('File too large (max 20 MB)');
    }

    const caption =
      typeof captionRaw === 'string' ? captionRaw : '';
    if (caption.trim().length > 0) {
      assertUtf8MessageTextLength(caption);
    }

    await this.friends.assertCanSendPersonalMessage(senderId, peerId);

    const room = await this.getOrCreateDmRoom(senderId, peerId);

    if (replyToId != null && replyToId !== '') {
      await this.assertValidReplyInRoom(room.id, replyToId);
    }

    const relativePath = posix.join(UPLOAD_DIR, file.filename);

    const kind = caption.trim().length > 0 ? 'mixed' : 'attachment';

    const created = await this.prisma.message.create({
      data: {
        roomId: room.id,
        senderId,
        body: caption.trim().length > 0 ? caption : null,
        kind,
        replyToId:
          replyToId != null && replyToId !== '' ? replyToId : undefined,
        attachments: {
          create: [
            {
              uploaderId: senderId,
              mimeType: file.mimetype || 'application/octet-stream',
              originalName: file.originalname.slice(0, 240),
              storagePath: relativePath,
              sizeBytes: file.size,
            },
          ],
        },
      },
      select: {
        id: true,
        body: true,
        senderId: true,
        createdAt: true,
        editedAt: true,
        replyTo: MESSAGE_REPLY_SELECT,
        attachments: {
          select: {
            id: true,
            mimeType: true,
            originalName: true,
            sizeBytes: true,
          },
        },
      },
    });

    return this.mapRow(created, senderId, peerId);
  }

  async getAttachmentFileStream(
    userId: string,
    attachmentId: string,
  ): Promise<{
    stream: Readable;
    fileName: string;
    mimeType: string;
  }> {
    const att = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        message: { select: { roomId: true } },
      },
    });

    if (!att?.message?.roomId) {
      throw new NotFoundException('Attachment not found');
    }

    const roomId = att.message.roomId;

    const banned = await this.prisma.roomBan.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true },
    });
    if (banned) {
      throw new ForbiddenException('You are banned from this room');
    }

    const member = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId,
        },
      },
    });
    if (!member) {
      throw new ForbiddenException('Cannot access this file');
    }

    const fullPath = join(process.cwd(), att.storagePath);
    if (!existsSync(fullPath)) {
      throw new NotFoundException('File missing on server');
    }

    return {
      stream: createReadStream(fullPath),
      fileName: att.originalName,
      mimeType: att.mimeType,
    };
  }

  /** Used by WebSocket to join `room:{id}` only if user may access group chat. */
  async verifyRoomChatMembership(userId: string, roomId: string): Promise<void> {
    await this.assertGroupRoomMember(userId, roomId);
  }

  private computeEditedBodyAndKind(
    body: string | null,
    attachmentCount: number,
    newText: string,
  ): { body: string | null; kind: MessageKind } {
    const decoded = decodeMessageBody(body ?? '');
    const hasInlineImage = !!decoded.imageDataUrl;
    const hasFiles = attachmentCount > 0;

    if (!hasInlineImage && !hasFiles) {
      if (!newText.trim()) {
        throw new BadRequestException('Message cannot be empty');
      }
      assertUtf8MessageTextLength(newText);
      return { body: newText, kind: 'text' };
    }

    if (hasInlineImage) {
      if (newText.length > 0) {
        assertUtf8MessageTextLength(newText);
      }
      const nextBody = encodeMessageBody(newText, decoded.imageDataUrl);
      const d2 = decodeMessageBody(nextBody);
      if (d2.imageDataUrl) {
        if (d2.text?.trim()) {
          return { body: nextBody, kind: 'mixed' };
        }
        return { body: nextBody, kind: 'attachment' };
      }
      return { body: newText, kind: 'text' };
    }

    if (newText.length > 0) {
      assertUtf8MessageTextLength(newText);
    }
    const nextBody = newText.trim() ? newText : null;
    if (!nextBody && !hasFiles) {
      throw new BadRequestException('Message cannot be empty');
    }
    return {
      body: nextBody,
      kind: nextBody ? 'mixed' : 'attachment',
    };
  }

  /** Sender only; updates body/kind and sets `editedAt`. */
  async updateMessage(
    actorId: string,
    messageId: string,
    textRaw: string,
  ): Promise<ChatMessageDto> {
    const newText = typeof textRaw === 'string' ? textRaw : '';

    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        body: true,
        kind: true,
        senderId: true,
        deletedAt: true,
        roomId: true,
        room: { select: { type: true } },
        attachments: { select: { id: true } },
      },
    });

    if (!msg || msg.deletedAt) {
      throw new NotFoundException('Message not found');
    }
    if (msg.kind === 'system') {
      throw new ForbiddenException('Cannot edit this message');
    }
    if (msg.senderId !== actorId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    let dmPeerId: string | undefined;

    if (msg.room.type === 'dm') {
      const members = await this.prisma.roomMember.findMany({
        where: { roomId: msg.roomId },
        select: { userId: true },
      });
      if (members.length !== 2) {
        throw new BadRequestException('Invalid conversation');
      }
      const a = members[0].userId;
      const b = members[1].userId;
      if (actorId !== a && actorId !== b) {
        throw new ForbiddenException('Not a participant');
      }
      dmPeerId = a === actorId ? b : a;
    } else {
      await this.assertGroupRoomMember(actorId, msg.roomId);
    }

    const { body: nextBody, kind: nextKind } = this.computeEditedBodyAndKind(
      msg.body,
      msg.attachments.length,
      newText,
    );

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        body: nextBody,
        kind: nextKind,
        editedAt: new Date(),
      },
      select: {
        id: true,
        body: true,
        senderId: true,
        createdAt: true,
        editedAt: true,
        sender: { select: { displayName: true, username: true } },
        replyTo: MESSAGE_REPLY_SELECT,
        attachments: {
          select: {
            id: true,
            mimeType: true,
            originalName: true,
            sizeBytes: true,
          },
        },
      },
    });

    if (dmPeerId != null) {
      return this.mapRow(updated, actorId, dmPeerId);
    }
    return this.buildMessageDto(updated, `room:${msg.roomId}`);
  }

  /**
   * Soft-delete a message. DM: sender only. Group room: own messages, or (for others' messages)
   * room owner / room admin, or platform moderator/admin.
   */
  async deleteMessage(
    actorId: string,
    messageId: string,
  ): Promise<{
    messageId: string;
    threadId: string;
    roomId: string;
    roomKind: 'dm' | 'group';
    dmUserIds?: [string, string];
  }> {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        roomId: true,
        senderId: true,
        deletedAt: true,
        room: { select: { type: true } },
      },
    });
    if (!msg?.room || msg.deletedAt) {
      throw new NotFoundException('Message not found');
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { role: true },
    });
    const isPlatformStaff =
      actor?.role === 'admin' || actor?.role === 'moderator';

    if (msg.room.type === 'dm') {
      if (msg.senderId !== actorId) {
        throw new ForbiddenException('You can only delete your own messages');
      }
      const members = await this.prisma.roomMember.findMany({
        where: { roomId: msg.roomId },
        select: { userId: true },
      });
      if (members.length !== 2) {
        throw new BadRequestException('Invalid conversation');
      }
      const a = members[0].userId;
      const b = members[1].userId;
      if (actorId !== a && actorId !== b) {
        throw new ForbiddenException('Not a participant');
      }
      const threadId = dmThreadId(a, b);
      await this.prisma.message.update({
        where: { id: messageId },
        data: { deletedAt: new Date() },
      });
      return {
        messageId,
        threadId,
        roomId: msg.roomId,
        roomKind: 'dm',
        dmUserIds: [a, b],
      };
    }

    await this.assertGroupRoomMember(actorId, msg.roomId);

    const membership = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: msg.roomId, userId: actorId } },
      select: { role: true },
    });
    const isRoomOwnerOrAdmin =
      membership != null &&
      (membership.role === 'owner' || membership.role === 'admin');

    if (msg.senderId !== actorId && !isRoomOwnerOrAdmin && !isPlatformStaff) {
      throw new ForbiddenException('Cannot delete this message');
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    return {
      messageId,
      threadId: `room:${msg.roomId}`,
      roomId: msg.roomId,
      roomKind: 'group',
    };
  }
}
