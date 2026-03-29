import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FriendsModule } from '../friends/friends.module';
import { ChatGateway } from './chat.gateway';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [AuthModule, FriendsModule],
  controllers: [MessagesController],
  providers: [MessagesService, ChatGateway],
  exports: [MessagesService],
})
export class MessagesModule {}
