import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function GuestRoute({ children }: { children: ReactNode }) {
  const { session } = useAuth();

  if (session) {
    return <Navigate to="/chat" replace />;
  }

  return children;
}
