import { pool } from "./pool";
import type { MessageRow } from "../types";

function mapMessage(row: {
  id: string;
  thread_id: string;
  sender_id: string;
  text: string;
  image_data_url: string | null;
  created_at: Date;
}): MessageRow {
  const msg: MessageRow = {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    text: row.text,
    createdAt: row.created_at.getTime(),
  };
  if (row.image_data_url) msg.imageDataUrl = row.image_data_url;
  return msg;
}

export async function listMessagesByThread(
  threadId: string,
): Promise<MessageRow[]> {
  const { rows } = await pool.query<{
    id: string;
    thread_id: string;
    sender_id: string;
    text: string;
    image_data_url: string | null;
    created_at: Date;
  }>(
    `SELECT id, thread_id, sender_id, text, image_data_url, created_at
     FROM messages WHERE thread_id = $1
     ORDER BY created_at ASC`,
    [threadId],
  );
  return rows.map(mapMessage);
}

export async function insertMessageRow(msg: MessageRow): Promise<MessageRow> {
  const { rows } = await pool.query<{
    id: string;
    thread_id: string;
    sender_id: string;
    text: string;
    image_data_url: string | null;
    created_at: Date;
  }>(
    `INSERT INTO messages (id, thread_id, sender_id, text, image_data_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, thread_id, sender_id, text, image_data_url, created_at`,
    [
      msg.id,
      msg.threadId,
      msg.senderId,
      msg.text,
      msg.imageDataUrl ?? null,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("Insert message failed");
  return mapMessage(row);
}
