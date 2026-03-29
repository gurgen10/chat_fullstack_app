import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService } from './users.service';

const UPLOAD_DIR = 'uploads';
const AVATAR_SUBDIR = 'avatars';
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  listUsers(@CurrentUser() user: { id: string }) {
    return this.users.listDirectory(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: { id: string }) {
    return this.users.getById(user.id);
  }

  /** Public profile image (no auth). */
  @Get('avatar/:userId')
  async getAvatar(
    @Param('userId') userId: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const result = await this.users.getAvatarFileStream(userId);
    if (!result) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    result.stream.pipe(res);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), UPLOAD_DIR, AVATAR_SUBDIR);
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = UsersService.avatarExtensionForMime(file.mimetype);
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: AVATAR_MAX_BYTES },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('file required');
    }
    return this.users.saveAvatarFromUpload(user.id, file);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/avatar')
  removeAvatar(@CurrentUser() user: { id: string }) {
    return this.users.removeAvatar(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@CurrentUser() user: { id: string }, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  deleteAccount(
    @CurrentUser() user: { id: string },
    @Body() dto: DeleteAccountDto,
  ) {
    return this.users.deleteAccount(user.id, dto.password);
  }

  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.users.getById(id);
  }
}
