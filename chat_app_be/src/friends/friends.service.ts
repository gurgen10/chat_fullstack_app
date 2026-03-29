import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  type UserRowWithAvatar,
  withPublicAvatar,
} from '../users/user-public.mapper';
import type { SendFriendRequestDto } from './dto/send-friend-request.dto';
import type { BanUserDto } from './dto/ban-user.dto';

const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  createdAt: true,
  avatarStoragePath: true,
} as const;

export type PublicUserDto = {
  id: string;
  username: string;
  displayName: string;
  createdAt: Date;
  avatarUrl: string | null;
};

function mapPair<
  T extends { requester: UserRowWithAvatar; addressee: UserRowWithAvatar },
>(row: T) {
  return {
    ...row,
    requester: withPublicAvatar(row.requester),
    addressee: withPublicAvatar(row.addressee),
  };
}

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Any directional ban between the two users blocks new personal messaging (both directions). */
  async pairHasAnyBan(userId: string, peerId: string): Promise<boolean> {
    const ban = await this.prisma.userBan.findFirst({
      where: {
        OR: [
          { bannerId: userId, bannedUserId: peerId },
          { bannerId: peerId, bannedUserId: userId },
        ],
      },
      select: { id: true },
    });
    return ban != null;
  }

  async areFriends(userId: string, peerId: string): Promise<boolean> {
    const row = await this.findFriendshipPair(userId, peerId);
    return row?.status === 'accepted';
  }

  /** Personal messaging allowed only when friends and no ban either way (2.3.6). */
  async canExchangePersonalMessages(
    userId: string,
    peerId: string,
  ): Promise<boolean> {
    if (userId === peerId) return false;
    if (await this.pairHasAnyBan(userId, peerId)) return false;
    return await this.areFriends(userId, peerId);
  }

  async assertCanSendPersonalMessage(senderId: string, peerId: string) {
    if (senderId === peerId) {
      throw new ForbiddenException('Cannot message yourself');
    }
    if (await this.pairHasAnyBan(senderId, peerId)) {
      throw new ForbiddenException(
        'Messaging is blocked between these accounts',
      );
    }
    if (!(await this.areFriends(senderId, peerId))) {
      throw new ForbiddenException(
        'You can only message users on your friends list',
      );
    }
  }

  findFriendshipPair(userId: string, peerId: string) {
    return this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: peerId },
          { requesterId: peerId, addresseeId: userId },
        ],
      },
    });
  }

  private async resolveTargetUser(dto: {
    username?: string;
    userId?: string;
  }) {
    if (dto.userId) {
      const u = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: publicUserSelect,
      });
      if (!u) throw new NotFoundException('User not found');
      return withPublicAvatar(u);
    }
    if (dto.username) {
      const u = await this.prisma.user.findUnique({
        where: { username: dto.username.trim().toLowerCase() },
        select: publicUserSelect,
      });
      if (!u) throw new NotFoundException('User not found');
      return withPublicAvatar(u);
    }
    throw new BadRequestException('username or userId is required');
  }

  async sendFriendRequest(meId: string, dto: SendFriendRequestDto) {
    const target = await this.resolveTargetUser(dto);
    if (target.id === meId) {
      throw new ConflictException('Cannot add yourself');
    }

    if (await this.pairHasAnyBan(meId, target.id)) {
      throw new ForbiddenException('Cannot send a friend request here');
    }

    const row = await this.findFriendshipPair(meId, target.id);

    if (!row) {
      const created = await this.prisma.friendship.create({
        data: {
          requesterId: meId,
          addresseeId: target.id,
          status: 'pending',
          requestMessage: dto.message ?? null,
        },
        select: {
          id: true,
          status: true,
          requestMessage: true,
          createdAt: true,
          requester: { select: publicUserSelect },
          addressee: { select: publicUserSelect },
        },
      });
      return mapPair(created);
    }

    if (row.status === 'accepted') {
      throw new ConflictException('Already friends');
    }

    if (row.status === 'pending') {
      if (row.requesterId === meId) {
        throw new ConflictException('Friend request already sent');
      }
      // They sent you a request — confirm automatically
      const accepted = await this.prisma.friendship.update({
        where: { id: row.id },
        data: { status: 'accepted' },
        select: {
          id: true,
          status: true,
          requestMessage: true,
          createdAt: true,
          requester: { select: publicUserSelect },
          addressee: { select: publicUserSelect },
        },
      });
      return mapPair(accepted);
    }

    // declined or blocked → renew request from current user
    const renewed = await this.prisma.friendship.update({
      where: { id: row.id },
      data: {
        requesterId: meId,
        addresseeId: target.id,
        status: 'pending',
        requestMessage: dto.message ?? null,
      },
      select: {
        id: true,
        status: true,
        requestMessage: true,
        createdAt: true,
        requester: { select: publicUserSelect },
        addressee: { select: publicUserSelect },
      },
    });
    return mapPair(renewed);
  }

  async listFriends(userId: string): Promise<PublicUserDto[]> {
    const rows = await this.prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: {
        requesterId: true,
        addresseeId: true,
        requester: { select: publicUserSelect },
        addressee: { select: publicUserSelect },
      },
    });
    return rows.map((r) =>
      withPublicAvatar(
        r.requesterId === userId ? r.addressee : r.requester,
      ),
    );
  }

  async listIncomingRequests(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { addresseeId: userId, status: 'pending' },
      select: {
        id: true,
        requestMessage: true,
        createdAt: true,
        requester: { select: publicUserSelect },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      ...r,
      requester: withPublicAvatar(r.requester),
    }));
  }

  async listOutgoingRequests(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { requesterId: userId, status: 'pending' },
      select: {
        id: true,
        requestMessage: true,
        createdAt: true,
        addressee: { select: publicUserSelect },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      ...r,
      addressee: withPublicAvatar(r.addressee),
    }));
  }

  async acceptRequest(userId: string, friendshipId: string) {
    const row = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (!row) throw new NotFoundException('Request not found');
    if (row.addresseeId !== userId) {
      throw new ForbiddenException('Not allowed to accept this request');
    }
    if (row.status !== 'pending') {
      throw new ConflictException('Request is not pending');
    }
    if (await this.pairHasAnyBan(row.requesterId, row.addresseeId)) {
      throw new ForbiddenException('Cannot accept — accounts are blocked');
    }

    const updated = await this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'accepted' },
      select: {
        id: true,
        status: true,
        requester: { select: publicUserSelect },
        addressee: { select: publicUserSelect },
      },
    });
    return mapPair(updated);
  }

  async declineRequest(userId: string, friendshipId: string) {
    const row = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (!row) throw new NotFoundException('Request not found');
    if (row.addresseeId !== userId) {
      throw new ForbiddenException('Not allowed to decline this request');
    }
    if (row.status !== 'pending') {
      throw new ConflictException('Request is not pending');
    }

    return this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'declined' },
      select: { id: true, status: true },
    });
  }

  async cancelOutgoingRequest(userId: string, friendshipId: string) {
    const row = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (!row) throw new NotFoundException('Request not found');
    if (row.requesterId !== userId) {
      throw new ForbiddenException('Not your outgoing request');
    }
    if (row.status !== 'pending') {
      throw new ConflictException('Request is not pending');
    }

    await this.prisma.friendship.delete({ where: { id: friendshipId } });
    return { ok: true };
  }

  async removeFriend(meId: string, peerId: string) {
    const row = await this.findFriendshipPair(meId, peerId);
    if (!row || row.status !== 'accepted') {
      throw new NotFoundException('Friendship not found');
    }
    await this.prisma.friendship.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async banUser(meId: string, dto: BanUserDto) {
    const target = await this.resolveTargetUser(dto);
    if (target.id === meId) {
      throw new ConflictException('Cannot ban yourself');
    }

    await this.prisma.$transaction([
      this.prisma.friendship.deleteMany({
        where: {
          OR: [
            { requesterId: meId, addresseeId: target.id },
            { requesterId: target.id, addresseeId: meId },
          ],
        },
      }),
      this.prisma.userBan.upsert({
        where: {
          bannerId_bannedUserId: { bannerId: meId, bannedUserId: target.id },
        },
        create: { bannerId: meId, bannedUserId: target.id },
        update: {},
      }),
    ]);

    return { ok: true };
  }

  async unbanUser(meId: string, bannedUserId: string) {
    await this.prisma.userBan.deleteMany({
      where: { bannerId: meId, bannedUserId },
    });
    return { ok: true };
  }

}
