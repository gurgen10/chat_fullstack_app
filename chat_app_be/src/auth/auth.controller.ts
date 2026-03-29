import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, this.auth.getClientMeta(req));
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, this.auth.getClientMeta(req));
  }

  @Post('refresh')
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.auth.refreshToken(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.listSessions(user.id, user.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:sessionId')
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
  ) {
    return this.auth.revokeSession(user.id, sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.logout(user.id, user.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(user.id, dto);
  }

  @Post('request-password-reset')
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.auth.requestPasswordReset(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }
}
