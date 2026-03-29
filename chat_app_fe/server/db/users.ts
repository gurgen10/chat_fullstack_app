import { randomUUID } from "node:crypto";
import { pool } from "./pool";
import type { UserRow } from "../types";

function mapUser(row: {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  created_at: Date;
}): UserRow {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    createdAt: row.created_at.getTime(),
  };
}

export async function createUserRow(
  username: string,
  displayName: string,
  passwordHash: string,
): Promise<{ ok: true; user: UserRow } | { ok: false; error: string }> {
  const normalized = username.trim().toLowerCase();
  if (normalized.length < 2 || normalized.length > 32) {
    return { ok: false, error: "Username must be 2–32 characters." };
  }

  const id = randomUUID();
  const disp = displayName.trim() || normalized;

  try {
    const { rows } = await pool.query<{
      id: string;
      username: string;
      display_name: string;
      password_hash: string;
      created_at: Date;
    }>(
      `INSERT INTO users (id, username, display_name, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, display_name, password_hash, created_at`,
      [id, normalized, disp, passwordHash],
    );
    const row = rows[0];
    if (!row) return { ok: false, error: "Could not create user." };
    return { ok: true, user: mapUser(row) };
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "23505"
    ) {
      return { ok: false, error: "That username is already taken." };
    }
    throw e;
  }
}

export async function findUserByUsername(
  username: string,
): Promise<UserRow | undefined> {
  const normalized = username.trim().toLowerCase();
  const { rows } = await pool.query<{
    id: string;
    username: string;
    display_name: string;
    password_hash: string;
    created_at: Date;
  }>(
    `SELECT id, username, display_name, password_hash, created_at
     FROM users WHERE username = $1`,
    [normalized],
  );
  const row = rows[0];
  return row ? mapUser(row) : undefined;
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  const { rows } = await pool.query<{
    id: string;
    username: string;
    display_name: string;
    password_hash: string;
    created_at: Date;
  }>(
    `SELECT id, username, display_name, password_hash, created_at
     FROM users WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  return row ? mapUser(row) : undefined;
}

export async function listUsersExcept(excludeId: string): Promise<UserRow[]> {
  const { rows } = await pool.query<{
    id: string;
    username: string;
    display_name: string;
    password_hash: string;
    created_at: Date;
  }>(
    `SELECT id, username, display_name, password_hash, created_at
     FROM users WHERE id <> $1
     ORDER BY username ASC`,
    [excludeId],
  );
  return rows.map(mapUser);
}

export async function userExists(id: string): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT true AS ok FROM users WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows.length > 0;
}
