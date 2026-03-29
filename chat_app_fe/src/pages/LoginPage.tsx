import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { useAuth } from "../hooks/useAuth";
import { apiLogin, sessionFromPublicUser } from "../lib/api";

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/chat";
  const resetOk = (location.state as { resetOk?: boolean } | null)?.resetOk;
  const passwordChanged = (location.state as { passwordChanged?: boolean } | null)
    ?.passwordChanged;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { token, refreshToken, sessionId, user } = await apiLogin({
        email,
        password,
      });
      signIn({
        token,
        refreshToken,
        sessionId,
        session: sessionFromPublicUser(user),
      });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-md">
        <div className="mb-6 flex justify-center">
          <BrandLogo />
        </div>
        <h1 className="text-center text-2xl font-semibold tracking-tight text-white">
          Sign in
        </h1>
        <p className="mt-1 text-center text-sm text-slate-400">
          Welcome back — continue your conversations
        </p>

        {resetOk ? (
          <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-100">
            Your password was reset. Sign in with your new password.
          </p>
        ) : null}
        {passwordChanged ? (
          <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-100">
            Password updated. All other sessions were signed out — sign in again
            on this device.
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <label className="block text-sm text-slate-300">
            Email
            <input
              type="email"
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-white outline-none ring-violet-500/40 focus:border-violet-500/50 focus:ring-2"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm text-slate-300">
            Password
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-white outline-none ring-violet-500/40 focus:border-violet-500/50 focus:ring-2"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error ? (
            <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 flex h-11 items-center justify-center rounded-lg bg-violet-600 font-medium text-white transition hover:bg-violet-500 disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link
            to="/forgot-password"
            className="font-medium text-slate-400 hover:text-violet-300"
          >
            Forgot password?
          </Link>
        </p>

        <p className="mt-6 text-center text-sm text-slate-400">
          No account?{" "}
          <Link
            to="/register"
            className="font-medium text-violet-400 hover:text-violet-300"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
