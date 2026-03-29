import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRoomDto {
  @IsIn(['public', 'private'])
  type!: 'public' | 'private';

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}
