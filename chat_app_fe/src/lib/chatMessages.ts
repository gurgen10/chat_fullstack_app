import type { ChatMessage } from "../types";
import { normalizeChatMessage } from "./api";

/** Prepend a page of older messages (API returns ascending within the page). */
export function mergeOlderMessages(
  prev: ChatMessage[],
  older: ChatMessage[],
): ChatMessage[] {
  const seen = new Set(prev.map((m) => m.id));
  return [...older.filter((m) => !seen.has(m.id)), ...prev];
}

export function sortMessagesChronologically(
  messages: ChatMessage[],
): ChatMessage[] {
  return [...messages].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
}

/**
 * Merge the latest server page (most recent N messages) with in-memory history.
 * Preserves scrolled-back older rows, inserts missed messages, and refreshes
 * overlapping rows (e.g. after reconnect or edits).
 */
export function mergeLatestPageWithExisting(
  prev: ChatMessage[],
  latestPage: ChatMessage[],
): ChatMessage[] {
  const latest = latestPage.map((m) => normalizeChatMessage(m));
  const latestById = new Map(latest.map((m) => [m.id, m]));
  const prevIds = new Set(prev.map((m) => m.id));

  const merged: ChatMessage[] = [];
  for (const m of prev) {
    merged.push(latestById.get(m.id) ?? m);
  }
  for (const m of latest) {
    if (!prevIds.has(m.id)) {
      merged.push(m);
    }
  }
  return sortMessagesChronologically(merged);
}

/** Append or ignore duplicate; keep strict chronological order. */
export function appendIncomingMessage(
  prev: ChatMessage[],
  msg: ChatMessage,
): ChatMessage[] {
  const n = normalizeChatMessage(msg);
  if (prev.some((m) => m.id === n.id)) return prev;
  return sortMessagesChronologically([...prev, n]);
}
