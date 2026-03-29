/** Public URL path for a user's profile image (GET serves the file). */
export function userAvatarUrl(userId: string): string {
  return `/users/avatar/${userId}`;
}

export type UserRowWithAvatar = {
  id: string;
  username: string;
  displayName: string;
  createdAt: Date;
  avatarStoragePath: string | null;
  email?: string;
  role?: string;
};

export function withPublicAvatar<T extends UserRowWithAvatar>(
  row: T,
): Omit<T, 'avatarStoragePath'> & { avatarUrl: string | null } {
  const { avatarStoragePath, ...rest } = row;
  return {
    ...(rest as Omit<T, 'avatarStoragePath'>),
    avatarUrl: avatarStoragePath ? userAvatarUrl(row.id) : null,
  };
}
