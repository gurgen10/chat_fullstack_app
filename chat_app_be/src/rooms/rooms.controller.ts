import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateRoomDto } from './dto/create-room.dto';
import { InviteToRoomDto } from './dto/invite-to-room.dto';
import { RoomUserIdDto } from './dto/room-user-id.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('catalog')
  publicCatalog(
    @CurrentUser() user: { id: string },
    @Query('q') q?: string,
  ) {
    return this.rooms.publicCatalog(user.id, q ?? '');
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  listMyRooms(@CurrentUser() user: { id: string }) {
    return this.rooms.listMyRooms(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  createRoom(@CurrentUser() user: { id: string }, @Body() dto: CreateRoomDto) {
    return this.rooms.createRoom({
      creatorId: user.id,
      type: dto.type,
      name: dto.name,
      description: dto.description,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  updateRoom(
    @CurrentUser() user: { id: string },
    @Param('id') roomId: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.rooms.updateRoom(roomId, user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  deleteRoom(@CurrentUser() user: { id: string }, @Param('id') roomId: string) {
    return this.rooms.deleteRoom(roomId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/members')
  listMembers(@CurrentUser() user: { id: string }, @Param('id') roomId: string) {
    return this.rooms.listMemberProfiles(roomId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/bans')
  listBans(@CurrentUser() user: { id: string }, @Param('id') roomId: string) {
    return this.rooms.listRoomBans(roomId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/bans')
  banUser(
    @CurrentUser() user: { id: string },
    @Param('id') roomId: string,
    @Body() dto: RoomUserIdDto,
  ) {
    return this.rooms.banFromRoom(roomId, user.id, dto.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/bans/:bannedUserId')
  unbanUser(
    @CurrentUser() user: { id: string },
    @Param('id') roomId: string,
    @Param('bannedUserId') bannedUserId: string,
  ) {
    return this.rooms.unbanFromRoom(roomId, user.id, bannedUserId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/admins')
  addAdmin(
    @CurrentUser() user: { id: string },
    @Param('id') roomId: string,
    @Body() dto: RoomUserIdDto,
  ) {
    return this.rooms.addRoomAdmin(roomId, user.id, dto.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/admins/:userId')
  removeAdmin(
    @CurrentUser() user: { id: string },
    @Param('id') roomId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.rooms.removeRoomAdmin(roomId, user.id, targetUserId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getRoom(@CurrentUser() user: { id: string }, @Param('id') roomId: string) {
    return this.rooms.getRoom(roomId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/join')
  join(@CurrentUser() user: { id: string }, @Param('id') roomId: string) {
    return this.rooms.joinPublicRoom(roomId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/leave')
  leave(@CurrentUser() user: { id: string }, @Param('id') roomId: string) {
    return this.rooms.leaveRoom(roomId, user.id);
  }

  /** 2.4.9 — Private rooms: staff invite users by username, email, or id. */
  @UseGuards(JwtAuthGuard)
  @Post(':id/invite')
  invite(
    @CurrentUser() user: { id: string },
    @Param('id') roomId: string,
    @Body() dto: InviteToRoomDto,
  ) {
    return this.rooms.inviteToPrivateRoom(roomId, user.id, dto.invite);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/kick')
  kickMember(
    @CurrentUser() user: { id: string },
    @Param('id') roomId: string,
    @Body() dto: RoomUserIdDto,
  ) {
    return this.rooms.kickMember(roomId, user.id, dto.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/promote-mod')
  promoteModerator(
    @CurrentUser() user: { id: string },
    @Param('id') roomId: string,
    @Body() dto: RoomUserIdDto,
  ) {
    return this.rooms.promoteToModerator(roomId, user.id, dto.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/moderators/:userId')
  demoteModerator(
    @CurrentUser() user: { id: string },
    @Param('id') roomId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.rooms.demoteModerator(roomId, user.id, targetUserId);
  }
}
