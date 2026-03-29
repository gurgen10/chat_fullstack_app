import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/jwt-payload';
import type { ChatMessageDto } from './messages.service';
import { MessagesService } from './messages.service';

type PresenceState = 'online' | 'afk';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  path: '/socket.io',
  /** Spec §3.2 — presence / offline detection within ~2s after transport loss. */
  pingInterval: 1000,
  pingTimeout: 1500,
  /** Default 1 MB is too small for §3.4 inline images (base64 in JSON). */
  maxHttpBufferSize: 6 * 1024 * 1024,
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  /**
   * Each browser tab has its own socket. Aggregate per user: **online** if any tab
   * reports online; **afk** only when every tab reports afk (spec: multi-tab presence).
   */
  private readonly presenceBySocket = new Map<
    string,
    { userId: string; state: PresenceState }
  >();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly messages: MessagesService,
  ) {}

  private aggregateForUser(userId: string): PresenceState | undefined {
    let anyOnline = false;
    let anyAfk = false;
    for (const v of this.presenceBySocket.values()) {
      if (v.userId !== userId) continue;
      if (v.state === 'online') anyOnline = true;
      else anyAfk = true;
    }
    if (!anyOnline && !anyAfk) return undefined;
    if (anyOnline) return 'online';
    return 'afk';
  }

  private buildPresencePayload(): Record<string, PresenceState> {
    const userIds = new Set<string>();
    for (const v of this.presenceBySocket.values()) {
      userIds.add(v.userId);
    }
    const out: Record<string, PresenceState> = {};
    for (const uid of userIds) {
      const agg = this.aggregateForUser(uid);
      if (agg) out[uid] = agg;
    }
    return out;
  }

  private broadcastPresence() {
    this.server.emit('presence:sync', this.buildPresencePayload());
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (typeof token !== 'string') {
      client.disconnect();
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET') ?? 'change-me',
      });
      const userId = payload.sub;
      (client.data as { userId?: string }).userId = userId;
      client.join(`user:${userId}`);
      this.presenceBySocket.set(client.id, { userId, state: 'online' });
      this.broadcastPresence();
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client.data as { userId?: string }).userId;
    if (userId) {
      this.presenceBySocket.delete(client.id);
      this.broadcastPresence();
    }
  }

  @SubscribeMessage('presence:set')
  handlePresenceSet(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { status?: string },
  ): { error: string | null } {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) return { error: 'Unauthorized' };
    const s = payload?.status;
    if (s !== 'online' && s !== 'afk') {
      return { error: 'status must be online or afk' };
    }
    const rec = this.presenceBySocket.get(client.id);
    if (!rec || rec.userId !== userId) {
      return { error: 'Not connected' };
    }
    rec.state = s;
    this.broadcastPresence();
    return { error: null };
  }

  emitDmMessage(senderId: string, peerId: string, msg: ChatMessageDto) {
    this.server
      .to(`user:${senderId}`)
      .to(`user:${peerId}`)
      .emit('chat:message', msg);
    void this.messages.resolveDmRoomId(senderId, peerId).then((rid) => {
      if (rid) void this.notifyUnreadRefresh(rid);
    });
  }

  emitRoomMessage(roomId: string, msg: ChatMessageDto) {
    this.server.to(`room:${roomId}`).emit('chat:message', msg);
    void this.notifyUnreadRefresh(roomId);
  }

  /** Prompt clients to refetch unread counts (low-traffic; after new messages). */
  private async notifyUnreadRefresh(roomId: string) {
    const ids = await this.messages.getRoomMemberUserIds(roomId);
    for (const uid of ids) {
      this.server.to(`user:${uid}`).emit('unread:refresh');
    }
  }

  emitMessageDeletedInGroup(
    roomId: string,
    messageId: string,
    threadId: string,
  ) {
    this.server
      .to(`room:${roomId}`)
      .emit('message:deleted', { messageId, threadId });
  }

  emitMessageDeletedInDm(
    userIds: [string, string],
    messageId: string,
    threadId: string,
  ) {
    const [a, b] = userIds;
    this.server
      .to(`user:${a}`)
      .to(`user:${b}`)
      .emit('message:deleted', { messageId, threadId });
  }

  emitMessageEdited(msg: ChatMessageDto) {
    const { threadId } = msg;
    if (threadId.startsWith('room:')) {
      const roomId = threadId.slice('room:'.length);
      this.server.to(`room:${roomId}`).emit('message:edited', msg);
      return;
    }
    const parts = threadId.split(':');
    if (parts.length === 2) {
      const [a, b] = parts;
      this.server.to(`user:${a}`).to(`user:${b}`).emit('message:edited', msg);
    }
  }

  @SubscribeMessage('room:subscribe')
  async handleRoomSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId?: string },
  ): Promise<{ error: string | null }> {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) return { error: 'Unauthorized' };
    const roomId = payload?.roomId;
    if (!roomId || typeof roomId !== 'string') {
      return { error: 'roomId required' };
    }
    try {
      await this.messages.verifyRoomChatMembership(userId, roomId);
      await client.join(`room:${roomId}`);
      return { error: null };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Cannot join room channel';
      return { error: msg };
    }
  }

  @SubscribeMessage('room:unsubscribe')
  async handleRoomUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId?: string },
  ): Promise<{ error: string | null }> {
    const roomId = payload?.roomId;
    if (!roomId || typeof roomId !== 'string') {
      return { error: 'roomId required' };
    }
    await client.leave(`room:${roomId}`);
    return { error: null };
  }

  @SubscribeMessage('room:send')
  async handleRoomSend(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      roomId?: string;
      text?: string;
      imageDataUrl?: string;
      replyToMessageId?: string;
    },
  ): Promise<{ error: string | null }> {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) return { error: 'Unauthorized' };

    try {
      const saved = await this.messages.sendRoomMessage(
        userId,
        payload?.roomId,
        payload?.text,
        payload?.imageDataUrl,
        payload?.replyToMessageId,
      );
      const rid = payload?.roomId;
      if (rid) {
        this.emitRoomMessage(rid, saved);
      }
      return { error: null };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to send message';
      return { error: msg };
    }
  }

  @SubscribeMessage('chat:send')
  async handleChatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      peerId?: string;
      text?: string;
      imageDataUrl?: string;
      replyToMessageId?: string;
    },
  ): Promise<{ error: string | null }> {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) return { error: 'Unauthorized' };

    try {
      const saved = await this.messages.sendDmMessage(
        userId,
        payload?.peerId,
        payload?.text,
        payload?.imageDataUrl,
        payload?.replyToMessageId,
      );
      const peerId = payload.peerId;
      if (peerId) {
        this.emitDmMessage(userId, peerId, saved);
      }
      return { error: null };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to send message';
      return { error: msg };
    }
  }
}
