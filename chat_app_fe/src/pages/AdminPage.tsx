import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  apiAdminSetUserRole,
  apiAdminUsers,
  type AdminUserRow,
} from "../lib/api";
import type { PlatformRole } from "../types";
import { Modal } from "../components/Modal";

function MenuChevron({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export default function AdminPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState<AdminUserRow | null>(null);
  const [roleDraft, setRoleDraft] = useState<PlatformRole>("user");
  const [roleBusy, setRoleBusy] = useState(false);

  const isAdmin = session?.platformRole === "admin";

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const list = await apiAdminUsers(applied || undefined);
      setUsers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load users.");
    } finally {
      setBusy(false);
    }
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

  function openRoleModal(u: AdminUserRow, ev?: React.MouseEvent) {
    const d = ev?.currentTarget.closest("details");
    if (d) (d as HTMLDetailsElement).open = false;
    setRoleModalUser(u);
    setRoleDraft(u.role);
  }

  async function saveRole() {
    if (!roleModalUser) return;
    setRoleBusy(true);
    setError(null);
    try {
      await apiAdminSetUserRole(roleModalUser.id, roleDraft);
      setRoleModalUser(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update role.");
    } finally {
      setRoleBusy(false);
    }
  }

  if (!session) return null;

  return (
    <div className="bg-slate-950 px-4 py-8 pb-12 text-slate-100">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white">
              Platform administration
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Search accounts, manage platform roles (moderators / admins), and
              open room tools from each room&apos;s chat screen.
            </p>
          </div>
        </header>

        {!isAdmin ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95">
            You can browse accounts. Only platform administrators can change
            roles. Sign in again after your role is updated.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <input
            className="min-w-[12rem] flex-1 rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm"
            placeholder="Search email, username, display name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setApplied(q);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => setApplied(q)}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
          >
            Search
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-slate-900/50 text-xs uppercase text-slate-500">
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                {isAdmin ? (
                  <th className="px-3 py-2 font-medium">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-white/5 hover:bg-white/[0.02]"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-white">{u.displayName}</div>
                    <div className="text-xs text-slate-500">@{u.username}</div>
                    <div className="text-[0.65rem] text-slate-600">{u.id}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{u.email}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-violet-200">
                      {u.role}
                    </span>
                  </td>
                  {isAdmin ? (
                    <td className="px-3 py-2">
                      {u.id === session.userId ? (
                        <span className="text-xs text-slate-500">—</span>
                      ) : (
                        <details className="relative inline-block">
                          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-white/15 bg-slate-950/80 px-2 py-1 text-xs font-medium text-slate-300 marker:content-none hover:bg-white/5 [&::-webkit-details-marker]:hidden">
                            Menu
                            <MenuChevron className="opacity-70" />
                          </summary>
                          <ul className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-white/10 bg-slate-900 py-1 shadow-xl">
                            <li>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/10"
                                onClick={(e) => openRoleModal(u, e)}
                              >
                                Change platform role…
                              </button>
                            </li>
                          </ul>
                        </details>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={roleModalUser != null}
        title="Change platform role"
        titleId="admin-role-modal-title"
        onClose={() => {
          if (!roleBusy) setRoleModalUser(null);
        }}
        zClassName="z-[100]"
        footer={
          <>
            <button
              type="button"
              disabled={roleBusy}
              onClick={() => setRoleModalUser(null)}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={roleBusy}
              onClick={() => void saveRole()}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {roleBusy ? "Saving…" : "Save role"}
            </button>
          </>
        }
      >
        {roleModalUser ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              <span className="font-medium text-white">
                {roleModalUser.displayName}
              </span>{" "}
              <span className="text-slate-500">
                @{roleModalUser.username}
              </span>
            </p>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              Platform role
            </label>
            <select
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              value={roleDraft}
              disabled={roleBusy}
              onChange={(e) =>
                setRoleDraft(e.target.value as PlatformRole)
              }
            >
              <option value="user">user</option>
              <option value="moderator">moderator</option>
              <option value="admin">admin</option>
            </select>
            <p className="text-xs text-slate-500">
              Moderators and admins can use the admin dashboard. Only admins can
              assign roles. The user may need to sign in again for JWT to
              reflect the new role.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
