import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { basename, join } from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatGateway } from './chat.gateway';
import { UpdateMessageDto } from './dto/update-message.dto';
import { MessagesService } from './messages.service';

/** Spec §3.4 — must match messages.service.ts */
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const UPLOAD_DIR = 'uploads';

@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('unread-summary')
  unreadSummary(@CurrentUser() user: { id: string }) {
    return this.messages.getUnreadSummary(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('room/:roomId/read')
  markRoomRead(
    @CurrentUser() user: { id: string },
    @Param('roomId') roomId: string,
  ) {
    return this.messages.markRoomRead(user.id, roomId).then(() => ({ ok: true }));
  }

  @UseGuards(JwtAuthGuard)
  @Post('dm/:peerId/read')
  markDmRead(
    @CurrentUser() user: { id: string },
    @Param('peerId') peerId: string,
  ) {
    return this.messages.markDmRead(user.id, peerId).then(() => ({ ok: true }));
  }

  @UseGuards(JwtAuthGuard)
  @Get('room/:roomId')
  listRoom(
    @CurrentUser() user: { id: string },
    @Param('roomId') roomId: string,
    @Query('before') before?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit =
      limitStr !== undefined && limitStr !== ''
        ? Number.parseInt(limitStr, 10)
        : undefined;
    return this.messages.listRoomMessages(user.id, roomId, {
      before,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('dm/:peerId')
  listDm(
    @CurrentUser() user: { id: string },
    @Param('peerId') peerId: string,
    @Query('before') before?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit =
      limitStr !== undefined && limitStr !== ''
        ? Number.parseInt(limitStr, 10)
        : undefined;
    return this.messages.listDmMessages(user.id, peerId, {
      before,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('dm/:peerId/attachment')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), UPLOAD_DIR);
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const base = basename(file.originalname).replace(
            /[^a-zA-Z0-9._-]/g,
            '_',
          );
          cb(null, `${randomUUID()}-${base}`);
        },
      }),
      limits: { fileSize: MAX_FILE_BYTES },
    }),
  )
  async uploadDmAttachment(
    @CurrentUser() user: { id: string },
    @Param('peerId') peerId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('caption') caption?: string,
    @Body('replyToMessageId') replyToMessageId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('file required');
    }
    const saved = await this.messages.sendDmFileAttachment(
      user.id,
      peerId,
      file,
      caption,
      replyToMessageId,
    );
    this.chatGateway.emitDmMessage(user.id, peerId, saved);
    return saved;
  }

  @UseGuards(JwtAuthGuard)
  @Post('room/:roomId/attachment')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), UPLOAD_DIR);
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const base = basename(file.originalname).replace(
            /[^a-zA-Z0-9._-]/g,
            '_',
          );
          cb(null, `${randomUUID()}-${base}`);
        },
      }),
      limits: { fileSize: MAX_FILE_BYTES },
    }),
  )
  async uploadRoomAttachment(
    @CurrentUser() user: { id: string },
    @Param('roomId') roomId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('caption') caption?: string,
    @Body('replyToMessageId') replyToMessageId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('file required');
    }
    const saved = await this.messages.sendRoomFileAttachment(
      user.id,
      roomId,
      file,
      caption,
      replyToMessageId,
    );
    this.chatGateway.emitRoomMessage(roomId, saved);
    return saved;
  }

  @UseGuards(JwtAuthGuard)
  @Get('attachments/:attachmentId/file')
  async getAttachmentFile(
    @CurrentUser() user: { id: string },
    @Param('attachmentId') attachmentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, fileName, mimeType } =
      await this.messages.getAttachmentFileStream(user.id, attachmentId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    return new StreamableFile(stream);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('msg/:messageId')
  patchMessage(
    @CurrentUser() user: { id: string },
    @Param('messageId') messageId: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messages.updateMessage(user.id, messageId, dto.text).then((saved) => {
      this.chatGateway.emitMessageEdited(saved);
      return saved;
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete('msg/:messageId')
  removeMessage(
    @CurrentUser() user: { id: string },
    @Param('messageId') messageId: string,
  ) {
    return this.messages.deleteMessage(user.id, messageId).then((meta) => {
      if (meta.roomKind === 'group') {
        this.chatGateway.emitMessageDeletedInGroup(
          meta.roomId,
          meta.messageId,
          meta.threadId,
        );
      } else if (meta.dmUserIds) {
        this.chatGateway.emitMessageDeletedInDm(
          meta.dmUserIds,
          meta.messageId,
          meta.threadId,
        );
      }
      return { ok: true };
    });
  }
}
