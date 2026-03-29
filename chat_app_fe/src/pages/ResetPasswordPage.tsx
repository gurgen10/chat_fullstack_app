import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiResetPassword } from "../lib/api";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenFromUrl = searchParams.get("token") ?? "";
  const emailFromUrl = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(emailFromUrl);
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (emailFromUrl) setEmail(emailFromUrl);
    if (tokenFromUrl) setToken(tokenFromUrl);
  }, [emailFromUrl, tokenFromUrl]);

  const canSubmit = useMemo(() => {
    return (
      email.trim().length > 0 &&
      token.trim().length > 0 &&
      password.length >= 8 &&
      confirm.length >= 8
    );
  }, [email, token, password, confirm]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setPending(true);
    try {
      await apiResetPassword({
        email: email.trim().toLowerCase(),
        token: token.trim(),
        newPassword: password,
      });
      navigate("/login", {
        replace: true,
        state: { resetOk: true },
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reset password.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-md">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-white">
          Set a new password
        </h1>
        <p className="mt-1 text-center text-sm text-slate-400">
          Use the link from your email, or paste the token and confirm your
          email.
        </p>

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
            Reset token
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-sm text-white outline-none ring-violet-500/40 focus:border-violet-500/50 focus:ring-2"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm text-slate-300">
            New password
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-white outline-none ring-violet-500/40 focus:border-violet-500/50 focus:ring-2"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="block text-sm text-slate-300">
            Confirm new password
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-white outline-none ring-violet-500/40 focus:border-violet-500/50 focus:ring-2"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </label>

          {error ? (
            <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending || !canSubmit}
            title={
              !canSubmit ? "Fill all fields with a password of at least 8 characters" : undefined
            }
            className="mt-2 flex h-11 items-center justify-center rounded-lg bg-violet-600 font-medium text-white transition hover:bg-violet-500 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Update password"}
          </button>
        </form>

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
