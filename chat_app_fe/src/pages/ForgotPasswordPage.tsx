import { useState } from "react";
import { Link } from "react-router-dom";
import { apiRequestPasswordReset } from "../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [devHint, setDevHint] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDevHint(null);
    setPending(true);
    try {
      const res = await apiRequestPasswordReset(email.trim());
      setDone(true);
      if (res.resetUrl) {
        setDevHint(
          `Development: open this link to reset your password: ${res.resetUrl}`,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not request a reset.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-md">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-white">
          Forgot password
        </h1>
        <p className="mt-1 text-center text-sm text-slate-400">
          Enter your account email. If it exists, you will receive reset
          instructions (in production, via email).
        </p>

        {done ? (
          <div className="mt-8 space-y-4">
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              If an account exists for that address, we have sent a password
              reset link. Check your inbox and spam folder.
            </p>
            {devHint ? (
              <p className="break-all rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                {devHint}
              </p>
            ) : null}
            <Link
              to="/login"
              className="block text-center text-sm font-medium text-violet-400 hover:text-violet-300"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
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
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-400">
          <Link
            to="/login"
            className="font-medium text-violet-400 hover:text-violet-300"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
