import {
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
  useSyncExternalStore,
} from "react";
import type { StoredAuth } from "../lib/authStorage";
import {
  getSession,
  notifyAuthChange,
  SESSION_CHANGE_EVENT,
  setStoredAuth,
  clearSessionClient,
} from "../lib/authStorage";
import { disconnectSocket } from "../lib/socketClient";
import { AuthContext } from "./auth-context";

function subscribeSession(cb: () => void) {
  window.addEventListener(SESSION_CHANGE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SESSION_CHANGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot() {
  return getSession();
}

function getServerSnapshot() {
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(
    subscribeSession,
    getSnapshot,
    getServerSnapshot,
  );

  const signIn = useCallback((auth: StoredAuth) => {
    setStoredAuth(auth);
    disconnectSocket();
    notifyAuthChange();
  }, []);

  const signOut = useCallback(() => {
    disconnectSocket();
    clearSessionClient();
  }, []);

  useEffect(() => {
    if (!session) disconnectSocket();
  }, [session]);

  const value = useMemo(
    () => ({ session, signIn, signOut }),
    [session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
