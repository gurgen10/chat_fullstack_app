import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { createReadStream, existsSync } from 'fs';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import * as path from 'path';
import { posix } from 'path';
import type { Readable } from 'stream';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { withPublicAvatar } from './user-public.mapper';

const UPLOAD_DIR = 'uploads';
const AVATAR_SUBDIR = 'avatars';
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** `storagePath` is relative to cwd, e.g. `uploads/avatars/abc.jpg`. */
function absoluteStoredPath(storagePath: string): string | null {
  const full = path.resolve(process.cwd(), storagePath);
  const uploadsRoot = path.resolve(process.cwd(), UPLOAD_DIR);
  if (full !== uploadsRoot && !full.startsWith(uploadsRoot + path.sep)) {
    return null;
  }
  return full;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsersForAdmin(search: string) {
    const q = search.trim();
    const rows = await this.prisma.user.findMany({
      where: q
        ? {
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        createdAt: true,
        avatarStoragePath: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => withPublicAvatar(r));
  }

  async setPlatformRole(actorId: string, targetId: string, role: Role) {
    if (actorId === targetId) {
      throw new BadRequestException(
        'You cannot change your own role from this screen',
      );
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');
    const row = await this.prisma.user.update({
      where: { id: targetId },
      data: { role },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        createdAt: true,
        avatarStoragePath: true,
      },
    });
    return withPublicAvatar(row);
  }

  async listDirectory(excludeUserId: string) {
    const rows = await this.prisma.user.findMany({
      where: { id: { not: excludeUserId } },
      select: {
        id: true,
        username: true,
        displayName: true,
        createdAt: true,
        avatarStoragePath: true,
      },
      orderBy: { username: 'asc' },
    });
    return rows.map((r) => withPublicAvatar(r));
  }

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        createdAt: true,
        avatarStoragePath: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return withPublicAvatar(user);
  }

  async updateMe(id: string, data: { displayName?: string }) {
    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        createdAt: true,
        avatarStoragePath: true,
      },
    });
    return withPublicAvatar(user);
  }

  /**
   * Saves avatar after multer wrote the file under uploads/avatars.
   * `file.path` must be inside the project upload directory.
   */
  async saveAvatarFromUpload(
    userId: string,
    file: { path: string; mimetype: string; size: number },
  ) {
    if (file.size > AVATAR_MAX_BYTES) {
      await unlink(file.path).catch(() => {});
      throw new BadRequestException('Image must be 2 MB or smaller');
    }
    if (!ALLOWED_AVATAR_MIME.has(file.mimetype)) {
      await unlink(file.path).catch(() => {});
      throw new BadRequestException('Use JPEG, PNG, WebP, or GIF');
    }

    const relFromFile = path
      .relative(process.cwd(), file.path)
      .split(path.sep)
      .join(posix.sep);
    if (!relFromFile.startsWith(`${UPLOAD_DIR}/${AVATAR_SUBDIR}/`)) {
      await unlink(file.path).catch(() => {});
      throw new BadRequestException('Invalid upload path');
    }

    const prev = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarStoragePath: true },
    });
    if (!prev) {
      await unlink(file.path).catch(() => {});
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarStoragePath: relFromFile },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        createdAt: true,
        avatarStoragePath: true,
      },
    });

    if (prev.avatarStoragePath && prev.avatarStoragePath !== relFromFile) {
      const abs = absoluteStoredPath(prev.avatarStoragePath);
      if (abs) await unlink(abs).catch(() => {});
    }

    return withPublicAvatar(updated);
  }

  async removeAvatar(userId: string) {
    const prev = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarStoragePath: true },
    });
    if (!prev?.avatarStoragePath) {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          role: true,
          createdAt: true,
          avatarStoragePath: true,
        },
      });
      if (!u) throw new NotFoundException('User not found');
      return withPublicAvatar(u);
    }

    const abs = absoluteStoredPath(prev.avatarStoragePath);
    if (abs) await unlink(abs).catch(() => {});

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarStoragePath: null },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        createdAt: true,
        avatarStoragePath: true,
      },
    });
    return withPublicAvatar(updated);
  }

  async getAvatarFileStream(userId: string): Promise<{
    stream: Readable;
    mimeType: string;
  } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarStoragePath: true },
    });
    if (!user?.avatarStoragePath) return null;
    const abs = absoluteStoredPath(user.avatarStoragePath);
    if (!abs || !existsSync(abs)) return null;
    const ext = path.extname(user.avatarStoragePath).toLowerCase();
    const mimeType = EXT_TO_MIME[ext] ?? 'application/octet-stream';
    return { stream: createReadStream(abs), mimeType };
  }

  /** Used when choosing extension for multer (from Content-Type). */
  static avatarExtensionForMime(mimetype: string): string {
    return MIME_TO_EXT[mimetype] ?? '.jpg';
  }

  /**
   * Deletes the user account:
   * - Removes rooms **created by** this user (`createdById`), including all messages and
   *   attachments in those rooms, and deletes uploaded files on disk.
   * - In all **other** rooms, removes membership (via cascade when the user row is deleted)
   *   and deletes this user’s messages and attachments so FK constraints are satisfied.
   * - Related rows (friendships, bans, etc.) cascade per schema.
   */
  async deleteAccount(id: string, password: string) {
    const account = await this.prisma.user.findUnique({
      where: { id },
      select: { passwordHash: true, avatarStoragePath: true },
    });
    if (!account) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(password, account.passwordHash);
    if (!valid) throw new BadRequestException('Invalid password');

    const ownedRooms = await this.prisma.room.findMany({
      where: { createdById: id },
      select: { id: true },
    });
    const ownedRoomIds = ownedRooms.map((r) => r.id);

    const attachmentOr: Prisma.AttachmentWhereInput[] = [
      { message: { senderId: id } },
      { uploaderId: id },
    ];
    if (ownedRoomIds.length > 0) {
      attachmentOr.push({ message: { roomId: { in: ownedRoomIds } } });
    }

    const attachmentsToPurge = await this.prisma.attachment.findMany({
      where: { OR: attachmentOr },
      select: { storagePath: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (ownedRoomIds.length > 0) {
        await tx.attachment.deleteMany({
          where: { message: { roomId: { in: ownedRoomIds } } },
        });
        await tx.room.deleteMany({
          where: { id: { in: ownedRoomIds } },
        });
      }

      await tx.attachment.deleteMany({
        where: { message: { senderId: id } },
      });
      await tx.message.deleteMany({
        where: { senderId: id },
      });
      await tx.attachment.deleteMany({
        where: { uploaderId: id },
      });

      await tx.user.delete({
        where: { id },
      });
    });

    const paths = [...new Set(attachmentsToPurge.map((a) => a.storagePath))];
    if (account.avatarStoragePath) {
      paths.push(account.avatarStoragePath);
    }
    await Promise.allSettled(
      paths.map((rel) => {
        const abs = absoluteStoredPath(rel);
        return abs ? unlink(abs) : Promise.resolve();
      }),
    );

    return { message: 'Account deleted successfully' };
  }
}
