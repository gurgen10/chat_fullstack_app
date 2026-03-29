import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BanUserDto } from './dto/ban-user.dto';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { FriendsService } from './friends.service';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  listFriends(@CurrentUser() user: { id: string }) {
    return this.friends.listFriends(user.id);
  }

  @Get('requests/incoming')
  incoming(@CurrentUser() user: { id: string }) {
    return this.friends.listIncomingRequests(user.id);
  }

  @Get('requests/outgoing')
  outgoing(@CurrentUser() user: { id: string }) {
    return this.friends.listOutgoingRequests(user.id);
  }

  @Post('requests')
  sendRequest(
    @CurrentUser() user: { id: string },
    @Body() dto: SendFriendRequestDto,
  ) {
    return this.friends.sendFriendRequest(user.id, dto);
  }

  @Post('requests/:id/accept')
  accept(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.friends.acceptRequest(user.id, id);
  }

  @Post('requests/:id/decline')
  decline(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.friends.declineRequest(user.id, id);
  }

  @Delete('requests/outgoing/:id')
  cancelOutgoing(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.friends.cancelOutgoingRequest(user.id, id);
  }

  @Delete(':userId')
  removeFriend(
    @CurrentUser() user: { id: string },
    @Param('userId') peerId: string,
  ) {
    return this.friends.removeFriend(user.id, peerId);
  }

  @Post('bans')
  ban(@CurrentUser() user: { id: string }, @Body() dto: BanUserDto) {
    return this.friends.banUser(user.id, dto);
  }

  @Delete('bans/:userId')
  unban(
    @CurrentUser() user: { id: string },
    @Param('userId') bannedUserId: string,
  ) {
    return this.friends.unbanUser(user.id, bannedUserId);
  }
}
