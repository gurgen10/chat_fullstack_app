import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { withPublicAvatar } from '../users/user-public.mapper';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

export type ClientMeta = {
  ip: string;
  userAgent: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** IP and User-Agent for session attribution. */
  getClientMeta(req: Request): ClientMeta {
    const xf = req.headers['x-forwarded-for'];
    const ipFromForwarded =
      typeof xf === 'string'
        ? xf.split(',')[0]?.trim()
        : Array.isArray(xf)
          ? xf[0]?.trim()
          : '';
    const rawIp =
      ipFromForwarded ||
      req.socket?.remoteAddress ||
      (req as Request & { ip?: string }).ip ||
      '';
    const ua = String(req.headers['user-agent'] ?? '').slice(0, 512);
    return {
      ip: rawIp.slice(0, 128),
      userAgent: ua,
    };
  }

  /** Refresh-token session window; spec §3.5 — no inactivity-based logout. */
  private sessionExpiry(): Date {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    return expiresAt;
  }

  private async signAccessToken(
    user: { id: string; email: string; role: string },
    sessionId: string,
  ) {
    return this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        sid: sessionId,
      },
      { expiresIn: '15m' },
    );
  }

  async register(dto: RegisterDto, meta: ClientMeta) {
    const email = dto.email.toLowerCase();
    /** Stored lowercase so uniqueness matches user expectations (case-insensitive identity). */
    const username = dto.username.trim().toLowerCase();

    const [existingEmail, existingUsername] = await Promise.all([
      this.prisma.user.findUnique({ where: { email }, select: { id: true } }),
      this.prisma.user.findUnique({
        where: { username },
        select: { id: true },
      }),
    ]);
    if (existingEmail) throw new ConflictException('Email already in use');
    if (existingUsername)
      throw new ConflictException('Username already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    const expiresAt = this.sessionExpiry();

    const { user, session } = await this.prisma.$transaction(async (tx) => {
      const userRow = await tx.user.create({
        data: {
          email,
          username,
          passwordHash,
          displayName: dto.displayName,
        },
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
      const sess = await tx.authSession.create({
        data: {
          userId: userRow.id,
          refreshTokenHash,
          userAgent: meta.userAgent,
          ipAddress: meta.ip,
          expiresAt,
        },
      });
      return { user: userRow, session: sess };
    });

    const accessToken = await this.signAccessToken(user, session.id);

    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      user: withPublicAvatar(user),
    };
  }

  async login(dto: LoginDto, meta: ClientMeta) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: {
        id: true,
        email: true,
        username: true,
        passwordHash: true,
        displayName: true,
        role: true,
        createdAt: true,
        avatarStoragePath: true,
      },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    const expiresAt = this.sessionExpiry();

    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        userAgent: meta.userAgent,
        ipAddress: meta.ip,
        expiresAt,
      },
    });

    const accessToken = await this.signAccessToken(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      session.id,
    );

    const { passwordHash: _ph, ...rest } = user;
    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      user: withPublicAvatar(rest),
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: dto.sessionId,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });

    if (!session?.user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const isValid = await bcrypt.compare(
      dto.refreshToken,
      session.refreshTokenHash,
    );
    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const accessToken = await this.signAccessToken(
      {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
      },
      session.id,
    );

    return { accessToken };
  }

  async listSessions(userId: string, currentSessionId?: string) {
    const rows = await this.prisma.authSession.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      userAgent: r.userAgent || '—',
      ipAddress: r.ipAddress || '—',
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      isCurrent: currentSessionId != null && r.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, targetSessionId: string) {
    const result = await this.prisma.authSession.deleteMany({
      where: { id: targetSessionId, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Session not found');
    }
    return { ok: true };
  }

  /**
   * Revokes only the given refresh session. Other devices keep working.
   * If the JWT has no `sid` (legacy token), we do not delete every session.
   */
  async logout(userId: string, sessionId?: string) {
    if (sessionId) {
      await this.prisma.authSession.deleteMany({
        where: { id: sessionId, userId },
      });
    }
    return { message: 'Logged out successfully' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentPasswordValid)
      throw new BadRequestException('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from your current password',
      );
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      }),
      this.prisma.authSession.deleteMany({ where: { userId } }),
    ]);

    return { message: 'Password changed successfully' };
  }

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true },
    });

    if (!user) {
      return {
        message: 'If the email exists, a password reset link has been sent',
      };
    }

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenHash = await bcrypt.hash(resetToken, 12);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetTokenHash,
        passwordResetExpires: expiresAt,
      },
    });

    const frontendOrigin =
      this.config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:5173';
    const resetPath = `/reset-password?${new URLSearchParams({
      token: resetToken,
      email: dto.email.toLowerCase(),
    }).toString()}`;
    const resetUrl = `${frontendOrigin.replace(/\/$/, '')}${resetPath}`;

    this.logger.warn(`Password reset link (use email integration in production): ${resetUrl}`);

    const nodeEnv =
      this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? 'development';
    const debug =
      this.config.get<string>('PASSWORD_RESET_DEBUG') === 'true' ||
      nodeEnv !== 'production';

    if (debug) {
      return {
        message:
          'If the email exists, a password reset link has been sent. (Debug: reset URL included.)',
        resetUrl,
        resetToken,
      };
    }

    return {
      message: 'If the email exists, a password reset link has been sent',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        passwordResetToken: true,
        passwordResetExpires: true,
      },
    });

    if (
      !user?.passwordResetToken ||
      !user.passwordResetExpires ||
      user.passwordResetExpires <= new Date()
    ) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const isValidToken = await bcrypt.compare(
      dto.token,
      user.passwordResetToken,
    );
    if (!isValidToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      }),
      this.prisma.authSession.deleteMany({ where: { userId: user.id } }),
    ]);

    return { message: 'Password reset successfully' };
  }
}
