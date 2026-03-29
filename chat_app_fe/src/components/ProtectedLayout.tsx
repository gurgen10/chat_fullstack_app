import { Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePresenceActivity } from "../hooks/usePresenceActivity";
import { UnreadSummaryProvider } from "../hooks/useUnreadSummary";
import { TopNav } from "./TopNav";

/** Logged-in shell: top nav, outlet; presence activity once for all routes. */
export function ProtectedLayout() {
  const { session } = useAuth();
  usePresenceActivity(!!session);

  return (
    <UnreadSummaryProvider sessionActive={!!session}>
      <div className="flex h-[100dvh] min-h-0 flex-col bg-slate-950">
        <TopNav />
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden text-slate-100">
          <Outlet />
        </div>
      </div>
    </UnreadSummaryProvider>
  );
}
