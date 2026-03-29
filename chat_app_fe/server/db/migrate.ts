import { pool } from "./pool";

export async function migrate(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required. Example: postgres://user:password@127.0.0.1:5432/mychat",
    );
  }

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        username VARCHAR(32) NOT NULL UNIQUE,
        display_name VARCHAR(128) NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY,
        thread_id TEXT NOT NULL,
        sender_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        text TEXT NOT NULL DEFAULT '',
        image_data_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_thread_created
      ON messages (thread_id, created_at);
    `);
  } finally {
    client.release();
  }
}
