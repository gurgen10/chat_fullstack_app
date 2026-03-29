import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UsersService } from '../users/users.service';
import { SetPlatformRoleDto } from './dto/set-platform-role.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly users: UsersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  @Get('users')
  listUsers(@Query('q') q?: string) {
    return this.users.listUsersForAdmin(q ?? '');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch('users/:id/role')
  setUserRole(
    @CurrentUser() actor: { id: string },
    @Param('id') userId: string,
    @Body() dto: SetPlatformRoleDto,
  ) {
    return this.users.setPlatformRole(actor.id, userId, dto.role);
  }
}
