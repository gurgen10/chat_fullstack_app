import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [UsersModule, AuthModule],
  controllers: [AdminController],
})
export class AdminModule {}
