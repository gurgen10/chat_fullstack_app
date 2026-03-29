import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}
