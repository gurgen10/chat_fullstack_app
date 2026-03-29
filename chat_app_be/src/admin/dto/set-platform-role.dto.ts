import { IsIn } from 'class-validator';

export class SetPlatformRoleDto {
  @IsIn(['user', 'moderator', 'admin'])
  role!: 'user' | 'moderator' | 'admin';
}
