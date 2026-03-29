import { IsString, MaxLength, MinLength } from 'class-validator';

/** Username, email, or user id (UUID). */
export class InviteToRoomDto {
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  invite!: string;
}
