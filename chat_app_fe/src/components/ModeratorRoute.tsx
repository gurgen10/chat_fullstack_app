import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/** Requires signed-in platform moderator or admin. */
export function ModeratorRoute({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }
  const r = session.platformRole ?? "user";
  if (r !== "admin" && r !== "moderator") {
    return <Navigate to="/chat" replace />;
  }
  return <>{children}</>;
}
