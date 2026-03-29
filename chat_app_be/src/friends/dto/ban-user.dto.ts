import {
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class BanUserDto {
  @ValidateIf((o: BanUserDto) => !o.userId)
  @IsString()
  @MinLength(3)
  username?: string;

  @ValidateIf((o: BanUserDto) => !o.username)
  @IsUUID()
  userId?: string;
}
