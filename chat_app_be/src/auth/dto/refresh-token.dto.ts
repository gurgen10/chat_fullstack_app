import { IsString, IsUUID } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;

  @IsUUID('4')
  sessionId!: string;
}
