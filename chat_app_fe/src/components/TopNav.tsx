import { Link } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import { ProfileMenu } from "./ProfileMenu";
import { useAuth } from "../hooks/useAuth";

export function TopNav() {
  const { session } = useAuth();

  if (!session) return null;

  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-slate-600/60 bg-slate-800 px-3 py-2 sm:px-4">
      <Link
        to="/chat"
        className="shrink-0 self-center"
        aria-label="Home"
      >
        <BrandLogo variant="compact" className="!mx-0 max-h-8" />
      </Link>
      <div className="min-w-0 flex-1" aria-hidden />
      <ProfileMenu session={session} />
    </header>
  );
}
