import { IsUUID } from 'class-validator';

export class RoomUserIdDto {
  @IsUUID()
  userId!: string;
}
