import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class SendFriendRequestDto {
  @ValidateIf((o: SendFriendRequestDto) => !o.userId)
  @IsString()
  @MinLength(3)
  username?: string;

  @ValidateIf((o: SendFriendRequestDto) => !o.username)
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
