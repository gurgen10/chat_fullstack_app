import type { Session } from "../types";

/** Spec §3.5 — session in localStorage survives browser restarts (refresh tokens). */
export const SESSION_CHANGE_EVENT = "mychat_session_change";

const KEY = "mychat_auth";

export type StoredAuth = {
  token: string;
  refreshToken?: string;
  /** Server auth session (device); used for refresh and revoke. */
  sessionId?: string;
  session: Session;
};

let cachedRaw: string | null | undefined = undefined;
let cachedAuth: StoredAuth | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function syncFromStorage(): void {
  const raw = readRaw();
  if (raw === cachedRaw) return;
  cachedRaw = raw;
  if (!raw) {
    cachedAuth = null;
    return;
  }
  try {
    cachedAuth = JSON.parse(raw) as StoredAuth;
  } catch {
    cachedAuth = null;
  }
}

export function getStoredAuth(): StoredAuth | null {
  syncFromStorage();
  return cachedAuth;
}

export function getSession(): Session | null {
  syncFromStorage();
  return cachedAuth?.session ?? null;
}

export function getToken(): string | null {
  syncFromStorage();
  return cachedAuth?.token ?? null;
}

export function setStoredAuth(auth: StoredAuth | null) {
  if (auth) {
    const raw = JSON.stringify(auth);
    localStorage.setItem(KEY, raw);
    cachedRaw = raw;
    cachedAuth = auth;
  } else {
    localStorage.removeItem(KEY);
    cachedRaw = null;
    cachedAuth = null;
  }
}

export function notifyAuthChange() {
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
}

/** Clears stored credentials and notifies listeners (e.g. redirect to login on 401). */
export function clearSessionClient() {
  setStoredAuth(null);
  notifyAuthChange();
}
