import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Platform roles from JWT (`user` | `moderator` | `admin`). */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
