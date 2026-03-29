import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RoomMemberRole } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { unlink } from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { withPublicAvatar } from '../users/user-public.mapper';

const publicMemberSelect = {
  id: true,
  username: true,
  displayName: true,
  createdAt: true,
  avatarStoragePath: true,
} as const;

function resolveSafeUploadFile(
  uploadDir: string,
  storagePath: string,
): string | null {
  const root = path.resolve(uploadDir);
  const full = path.resolve(path.join(root, storagePath));
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

function isStaffRole(role: RoomMemberRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'mod';
}

/** Room owner or room-level admin (not moderator). */
function isRoomAdminOrOwnerRole(role: RoomMemberRole): boolean {
  return role === 'owner' || role === 'admin';
}

/** Spec §3.1 — max participants per room (excludes unlimited rooms-per-user). */
export const MAX_ROOM_PARTICIPANTS = 1000;

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createRoom(params: {
    creatorId: string;
    type: 'public' | 'private';
    name: string;
    description?: string;
  }) {
    const name = params.name.trim();
    if (!name) throw new ConflictException('Room name is required');

    try {
      const room = await this.prisma.room.create({
        data: {
          type: params.type,
          name,
          description: (params.description ?? '').trim(),
          createdById: params.creatorId,
          members: {
            create: {
              userId: params.creatorId,
              role: 'owner',
            },
          },
        },
        select: {
          id: true,
          type: true,
          name: true,
          description: true,
          createdById: true,
          createdAt: true,
        },
      });
      return room;
    } catch (e: unknown) {
      if (
        e &&
        typeof e === 'object' &&
        'code' in e &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('A room with this name already exists');
      }
      throw e;
    }
  }

  /** Rooms the user has joined (2.4.5); not the public catalog. */
  async listMyRooms(userId: string) {
    const memberships = await this.prisma.roomMember.findMany({
      where: { userId },
      select: {
        role: true,
        room: {
          select: {
            id: true,
            type: true,
            name: true,
            description: true,
            createdById: true,
            createdAt: true,
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
    return memberships.map((m) => ({
      id: m.room.id,
      type: m.room.type,
      name: m.room.name,
      description: m.room.description,
      createdById: m.room.createdById,
      createdAt: m.room.createdAt,
      memberCount: m.room._count.members,
      myRole: m.role,
    }));
  }

  /** 2.4.3 Public catalog with simple search; excludes private/DM and room bans for viewer. */
  async publicCatalog(userId: string, search: string) {
    const q = search.trim();
    const where: Prisma.RoomWhereInput = {
      type: 'public',
      roomBans: { none: { userId } },
    };
    if (q) {
      where.AND = [
        {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const rooms = await this.prisma.room.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
      orderBy: [{ name: 'asc' }],
    });

    return rooms.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      memberCount: r._count.members,
      createdAt: r.createdAt,
    }));
  }

  async listMemberProfiles(roomId: string, userId: string) {
    await this.assertMember(roomId, userId);

    const members = await this.prisma.roomMember.findMany({
      where: { roomId },
      select: {
        role: true,
        user: { select: publicMemberSelect },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return members.map((m) => ({
      ...withPublicAvatar(m.user),
      role: m.role,
    }));
  }

  private async assertMember(roomId: string, userId: string) {
    const m = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true },
    });
    if (!m) throw new ForbiddenException('Not a member of this room');
  }

  private async assertStaff(roomId: string, userId: string) {
    const m = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { role: true },
    });
    if (!m || !isStaffRole(m.role)) {
      throw new ForbiddenException('Not allowed');
    }
  }

  /** Bans, bans list, and admin demotion (owner or room admin only — not moderators). */
  private async assertRoomAdminOrOwner(roomId: string, userId: string) {
    const m = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { role: true },
    });
    if (!m || !isRoomAdminOrOwnerRole(m.role)) {
      throw new ForbiddenException(
        'Only the room owner or a room admin can do this',
      );
    }
  }

  private async assertOwner(roomId: string, userId: string) {
    const m = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { role: true },
    });
    if (!m || m.role !== 'owner') {
      throw new ForbiddenException('Only the room owner can do this');
    }
  }

  async getRoom(roomId: string, userId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        type: true,
        name: true,
        description: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: { id: true, username: true, displayName: true },
        },
        _count: {
          select: { members: true },
        },
      },
    });
    if (!room) throw new NotFoundException('Room not found');

    const membership = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { role: true },
    });
    const banned = await this.prisma.roomBan.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true },
    });

    const owner = {
      id: room.createdBy.id,
      username: room.createdBy.username,
      displayName: room.createdBy.displayName,
    };

    if (room.type === 'public') {
      return {
        id: room.id,
        type: room.type,
        name: room.name,
        description: room.description,
        createdById: room.createdById,
        createdBy: owner,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        memberCount: room._count.members,
        myRole: membership?.role ?? null,
        youAreMember: !!membership,
        youAreBannedFromRoom: !!banned,
      };
    }

    if (!membership) {
      throw new ForbiddenException('Not allowed');
    }

    return {
      id: room.id,
      type: room.type,
      name: room.name,
      description: room.description,
      createdById: room.createdById,
      createdBy: owner,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      memberCount: room._count.members,
      myRole: membership.role,
      youAreMember: true,
      youAreBannedFromRoom: false,
    };
  }

  async updateRoom(
    roomId: string,
    userId: string,
    data: { name?: string; description?: string },
  ) {
    await this.assertStaff(roomId, userId);

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, type: true },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room.type === 'dm') {
      throw new ForbiddenException('Cannot edit a direct message room here');
    }

    const update: Prisma.RoomUpdateInput = {};
    if (data.name !== undefined) {
      const n = data.name.trim();
      if (n.length < 2) throw new ConflictException('Invalid name');
      update.name = n;
    }
    if (data.description !== undefined) {
      update.description = data.description.trim();
    }

    try {
      return await this.prisma.room.update({
        where: { id: roomId },
        data: update,
        select: {
          id: true,
          type: true,
          name: true,
          description: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (e: unknown) {
      if (
        e &&
        typeof e === 'object' &&
        'code' in e &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('A room with this name already exists');
      }
      throw e;
    }
  }

  async joinPublicRoom(roomId: string, userId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, type: true },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room.type !== 'public') {
      throw new ForbiddenException('Only public rooms can be joined without an invite');
    }

    const banned = await this.prisma.roomBan.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true },
    });
    if (banned) {
      throw new ForbiddenException('You are banned from this room');
    }

    const already = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true },
    });
    if (already) {
      return { ok: true };
    }

    const memberCount = await this.prisma.roomMember.count({
      where: { roomId },
    });
    if (memberCount >= MAX_ROOM_PARTICIPANTS) {
      throw new ConflictException(
        `This room has reached the maximum of ${MAX_ROOM_PARTICIPANTS} participants`,
      );
    }

    await this.prisma.roomMember.create({
      data: { roomId, userId, role: 'member' },
      select: { id: true },
    });

    return { ok: true };
  }

  async leaveRoom(roomId: string, userId: string) {
    const membership = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true, role: true },
    });
    if (!membership) return { ok: true };

    if (membership.role === 'owner') {
      throw new ForbiddenException(
        'The owner cannot leave; delete the room instead',
      );
    }

    await this.prisma.roomMember.delete({
      where: { roomId_userId: { roomId, userId } },
    });

    return { ok: true };
  }

  async deleteRoom(roomId: string, userId: string) {
    const membership = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { role: true },
    });
    if (!membership || membership.role !== 'owner') {
      throw new ForbiddenException('Only the room owner may delete the room');
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true },
    });
    if (!room) throw new NotFoundException('Room not found');

    const attachmentsToPurge = await this.prisma.attachment.findMany({
      where: { message: { roomId } },
      select: { storagePath: true },
    });

    const uploadDir =
      this.config.get<string>('UPLOAD_DIR') ?? path.join(process.cwd(), 'uploads');

    await this.prisma.$transaction(async (tx) => {
      await tx.attachment.deleteMany({
        where: { message: { roomId } },
      });
      await tx.room.delete({
        where: { id: roomId },
      });
    });

    const paths = [...new Set(attachmentsToPurge.map((a) => a.storagePath))];
    await Promise.allSettled(
      paths.map((rel) => {
        const abs = resolveSafeUploadFile(uploadDir, rel);
        return abs ? unlink(abs) : Promise.resolve();
      }),
    );

    return { ok: true };
  }

  /**
   * Resolves `invite` to a user id: UUID, email (contains @), or username (case-insensitive).
   */
  private async resolveUserIdFromInvite(inviteRaw: string): Promise<string> {
    const trimmed = inviteRaw.trim();
    if (!trimmed) {
      throw new BadRequestException('Invite is required');
    }

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRe.test(trimmed)) {
      const byId = await this.prisma.user.findUnique({
        where: { id: trimmed },
        select: { id: true },
      });
      if (!byId) {
        throw new NotFoundException('No user with that id');
      }
      return byId.id;
    }

    if (trimmed.includes('@')) {
      const email = trimmed.toLowerCase();
      const byEmail = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (!byEmail) {
        throw new NotFoundException('No user with that email');
      }
      return byEmail.id;
    }

    const byUsername = await this.prisma.user.findFirst({
      where: {
        username: { equals: trimmed, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (!byUsername) {
      throw new NotFoundException('No user with that username');
    }
    return byUsername.id;
  }

  async inviteToPrivateRoom(
    roomId: string,
    inviterId: string,
    inviteRaw: string,
  ) {
    const invitedUserId = await this.resolveUserIdFromInvite(inviteRaw);

    if (invitedUserId === inviterId) {
      throw new BadRequestException('You cannot invite yourself');
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, type: true },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room.type !== 'private') {
      throw new ForbiddenException('Invites are only for private rooms');
    }

    const inviterMembership = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: inviterId } },
      select: { role: true },
    });
    if (!inviterMembership || !isStaffRole(inviterMembership.role)) {
      throw new ForbiddenException('Not allowed to invite');
    }

    const banned = await this.prisma.roomBan.findUnique({
      where: { roomId_userId: { roomId, userId: invitedUserId } },
      select: { id: true },
    });
    if (banned) {
      throw new ForbiddenException('User is banned from this room');
    }

    const already = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: invitedUserId } },
      select: { id: true },
    });
    if (!already) {
      const memberCount = await this.prisma.roomMember.count({
        where: { roomId },
      });
      if (memberCount >= MAX_ROOM_PARTICIPANTS) {
        throw new ConflictException(
          `This room has reached the maximum of ${MAX_ROOM_PARTICIPANTS} participants`,
        );
      }
    }

    await this.prisma.roomMember.upsert({
      where: { roomId_userId: { roomId, userId: invitedUserId } },
      update: {},
      create: { roomId, userId: invitedUserId, role: 'member' },
    });

    return { ok: true };
  }

  async listRoomBans(roomId: string, userId: string) {
    await this.assertRoomAdminOrOwner(roomId, userId);
    const rows = await this.prisma.roomBan.findMany({
      where: { roomId },
      select: {
        userId: true,
        createdAt: true,
        user: { select: publicMemberSelect },
        bannedBy: { select: publicMemberSelect },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      userId: r.userId,
      createdAt: r.createdAt,
      user: r.user,
      bannedBy: r.bannedBy,
    }));
  }

  async banFromRoom(roomId: string, actorId: string, targetUserId: string) {
    await this.assertRoomAdminOrOwner(roomId, actorId);

    const targetMember = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      select: { role: true },
    });
    if (targetMember?.role === 'owner') {
      throw new ForbiddenException('Cannot ban the room owner');
    }

    await this.prisma.$transaction([
      this.prisma.roomMember.deleteMany({
        where: { roomId, userId: targetUserId },
      }),
      this.prisma.roomBan.upsert({
        where: {
          roomId_userId: { roomId, userId: targetUserId },
        },
        create: {
          roomId,
          userId: targetUserId,
          bannedById: actorId,
        },
        update: { bannedById: actorId },
      }),
    ]);
    return { ok: true };
  }

  async unbanFromRoom(roomId: string, actorId: string, targetUserId: string) {
    await this.assertRoomAdminOrOwner(roomId, actorId);
    await this.prisma.roomBan.deleteMany({
      where: { roomId, userId: targetUserId },
    });
    return { ok: true };
  }

  async addRoomAdmin(roomId: string, ownerId: string, targetUserId: string) {
    await this.assertOwner(roomId, ownerId);

    const m = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      select: { role: true },
    });
    if (!m) throw new NotFoundException('User is not a member of this room');
    if (m.role === 'owner') {
      throw new ConflictException('Owner is already the room owner');
    }

    await this.prisma.roomMember.update({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      data: { role: 'admin' },
    });
    return { ok: true };
  }

  /**
   * Remove room-level admin role. Owner or room admins may demote other admins;
   * the room owner cannot be demoted (they are not `role: admin`).
   */
  async removeRoomAdmin(roomId: string, actorId: string, targetUserId: string) {
    await this.assertRoomAdminOrOwner(roomId, actorId);

    const m = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      select: { role: true },
    });
    if (!m || m.role !== 'admin') {
      throw new NotFoundException('User is not a room admin');
    }

    await this.prisma.roomMember.update({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      data: { role: 'member' },
    });
    return { ok: true };
  }

  private async assertOwnerOrRoomAdmin(roomId: string, userId: string) {
    const m = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { role: true },
    });
    if (!m || (m.role !== 'owner' && m.role !== 'admin')) {
      throw new ForbiddenException('Not allowed');
    }
  }

  /**
   * Remove a member from the room. If the actor is the room owner or a room admin,
   * the removal is recorded as a **room ban** (same as an explicit ban): the user
   * cannot rejoin until unbanned. Moderator kicks do not add a ban (removal only).
   */
  async kickMember(roomId: string, actorId: string, targetUserId: string) {
    if (actorId === targetUserId) {
      throw new BadRequestException('Cannot kick yourself');
    }
    await this.assertStaff(roomId, actorId);

    const actor = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: actorId } },
      select: { role: true },
    });
    const target = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      select: { role: true },
    });
    if (!actor || !target) {
      throw new NotFoundException('Member not found');
    }
    if (target.role === 'owner') {
      throw new ForbiddenException('Cannot kick the room owner');
    }

    if (actor.role === 'mod') {
      if (target.role !== 'member') {
        throw new ForbiddenException(
          'Moderators can only remove regular members',
        );
      }
    } else if (actor.role === 'admin') {
      if (target.role === 'admin') {
        throw new ForbiddenException('Cannot kick another room admin');
      }
    }
    /* Owner may remove any non-owner member (including admins and mods). */

    await this.prisma.roomMember.delete({
      where: { roomId_userId: { roomId, userId: targetUserId } },
    });

    if (isRoomAdminOrOwnerRole(actor.role)) {
      await this.prisma.roomBan.upsert({
        where: { roomId_userId: { roomId, userId: targetUserId } },
        create: {
          roomId,
          userId: targetUserId,
          bannedById: actorId,
        },
        update: { bannedById: actorId },
      });
    }

    return { ok: true };
  }

  async promoteToModerator(
    roomId: string,
    actorId: string,
    targetUserId: string,
  ) {
    await this.assertOwnerOrRoomAdmin(roomId, actorId);

    const target = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      select: { role: true },
    });
    if (!target || target.role !== 'member') {
      throw new BadRequestException(
        'Only regular members can be promoted to moderator',
      );
    }

    await this.prisma.roomMember.update({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      data: { role: 'mod' },
    });
    return { ok: true };
  }

  async demoteModerator(
    roomId: string,
    actorId: string,
    targetUserId: string,
  ) {
    await this.assertOwnerOrRoomAdmin(roomId, actorId);

    const m = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      select: { role: true },
    });
    if (!m || m.role !== 'mod') {
      throw new NotFoundException('User is not a room moderator');
    }

    await this.prisma.roomMember.update({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      data: { role: 'member' },
    });
    return { ok: true };
  }
}
