import { createContext } from "react";
import type { Session } from "../types";

import type { StoredAuth } from "../lib/authStorage";

export type AuthContextValue = {
  session: Session | null;
  signIn: (auth: StoredAuth) => void;
  signOut: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
