import type { UserRow } from "./types";

export function threadId(userA: string, userB: string): string {
  return [userA, userB].sort().join(":");
}

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    createdAt: u.createdAt,
  };
}
