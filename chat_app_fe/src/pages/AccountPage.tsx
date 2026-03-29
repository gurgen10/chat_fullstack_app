import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  apiChangePassword,
  apiDeleteAccount,
  apiListAuthSessions,
  apiRevokeAuthSession,
  type AuthSessionRow,
} from "../lib/api";
import { useAuth } from "../hooks/useAuth";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function AccountPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const [sessions, setSessions] = useState<AuthSessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setSessionsError(null);
    setSessionsLoading(true);
    try {
      const rows = await apiListAuthSessions();
      setSessions(rows);
    } catch (err) {
      setSessionsError(
        err instanceof Error ? err.message : "Could not load sessions.",
      );
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from your current password.");
      return;
    }
    setPending(true);
    try {
      await apiChangePassword({
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      signOut();
      navigate("/login", {
        replace: true,
        state: { passwordChanged: true },
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not change password.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleRevokeSession(row: AuthSessionRow) {
    if (
      !window.confirm(
        row.isCurrent
          ? "Sign out this browser? You will need to sign in again."
          : "End this session? That device will be signed out.",
      )
    ) {
      return;
    }
    setRevokingId(row.id);
    setSessionsError(null);
    try {
      await apiRevokeAuthSession(row.id);
      if (row.isCurrent) {
        signOut();
        navigate("/login", { replace: true });
        return;
      }
      await loadSessions();
    } catch (err) {
      setSessionsError(
        err instanceof Error ? err.message : "Could not end session.",
      );
    } finally {
      setRevokingId(null);
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteError(null);
    if (
      !window.confirm(
        "Delete your account permanently? Rooms you created (including their messages and files) will be removed. You will be removed from other rooms. This cannot be undone.",
      )
    ) {
      return;
    }
    setDeletePending(true);
    try {
      await apiDeleteAccount(deletePassword);
      setDeletePassword("");
      signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete account.",
      );
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <div className="bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 pb-16">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Account
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Change your password. Passwords are stored securely (hashed). No
          periodic password rotation is required.
        </p>

        <section className="mt-10 rounded-2xl border border-white/10 bg-slate-900/50 p-6">
          <h2 className="text-lg font-semibold text-white">Active sessions</h2>
          <p className="mt-1 text-sm text-slate-400">
            Browsers and devices where you are signed in. Ending a session
            signs out only that device.
          </p>
          {sessionsError ? (
            <p className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">
              {sessionsError}
            </p>
          ) : null}
          {sessionsLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading sessions…</p>
          ) : sessions.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No active sessions.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-white/10 bg-slate-950/40 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm text-slate-200">
                        {s.userAgent}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        IP {s.ipAddress}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Signed in {formatWhen(s.createdAt)} · Expires{" "}
                        {formatWhen(s.expiresAt)}
                      </p>
                      {s.isCurrent ? (
                        <span className="mt-2 inline-block rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-200">
                          This browser
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={revokingId === s.id}
                      onClick={() => void handleRevokeSession(s)}
                      className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                    >
                      {revokingId === s.id
                        ? "Ending…"
                        : s.isCurrent
                          ? "Sign out"
                          : "End session"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form
          onSubmit={handleSubmit}
          className="mt-10 flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/50 p-6"
        >
          <h2 className="text-lg font-semibold text-white">Password</h2>
          <label className="block text-sm text-slate-300">
            Current password
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-white outline-none ring-violet-500/40 focus:border-violet-500/50 focus:ring-2"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm text-slate-300">
            New password
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-white outline-none ring-violet-500/40 focus:border-violet-500/50 focus:ring-2"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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
            disabled={pending}
            className="mt-2 flex h-11 items-center justify-center rounded-lg bg-violet-600 font-medium text-white transition hover:bg-violet-500 disabled:opacity-60"
          >
            {pending ? "Updating…" : "Change password"}
          </button>
        </form>

        <section className="mt-12 rounded-2xl border border-red-500/25 bg-red-950/20 p-6">
          <h2 className="text-lg font-semibold text-red-100">Delete account</h2>
          <p className="mt-2 text-sm text-slate-400">
            Your profile is removed. Only rooms you created are deleted, along
            with all messages and files in those rooms. In other rooms you are
            removed as a member; your messages there are removed so the account
            can be deleted.
          </p>
          <form onSubmit={handleDeleteAccount} className="mt-4 flex flex-col gap-3">
            <label className="block text-sm text-slate-300">
              Confirm with your password
              <input
                type="password"
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-white outline-none ring-violet-500/40 focus:border-violet-500/50 focus:ring-2"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                required
              />
            </label>
            {deleteError ? (
              <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">
                {deleteError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={deletePending || deletePassword.length === 0}
              className="flex h-11 items-center justify-center rounded-lg border border-red-500/50 bg-red-900/40 font-medium text-red-100 transition hover:bg-red-900/60 disabled:opacity-50"
            >
              {deletePending ? "Deleting…" : "Delete my account"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
