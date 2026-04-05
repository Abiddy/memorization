"use client";

import { useCallback, useEffect, useState } from "react";

export type AdminMemberRow = {
  id: string;
  display_name: string;
  username: string | null;
  created_at: string;
};

function formatJoined(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AdminUsersPanel({
  currentMemberId,
  onListChanged,
}: {
  currentMemberId: string;
  onListChanged: () => void;
}) {
  const [rows, setRows] = useState<AdminMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<AdminMemberRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/members");
      const data = (await res.json()) as { members?: AdminMemberRow[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load members.");
        setRows([]);
        return;
      }
      setRows(data.members ?? []);
    } catch {
      setError("Could not load members.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function executeRemove() {
    if (!confirmRemove) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/members/${encodeURIComponent(confirmRemove.id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActionError(data.error ?? "Remove failed.");
        return;
      }
      setConfirmRemove(null);
      await load();
      onListChanged();
    } catch {
      setActionError("Remove failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-4xl min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6 sm:py-6">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Remove a member from the club. Their messages stay in chat; their profile and progress rows are deleted.
        </p>
        {error ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[20rem] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-400 sm:text-xs">
              <tr>
                <th scope="col" className="px-3 py-3 sm:px-4">
                  Name
                </th>
                <th scope="col" className="hidden px-3 py-3 sm:table-cell sm:px-4">
                  Username
                </th>
                <th scope="col" className="hidden px-3 py-3 md:table-cell md:px-4">
                  Joined
                </th>
                <th scope="col" className="px-3 py-3 text-right sm:px-4">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">
                    No members.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isSelf = r.id === currentMemberId;
                  return (
                    <tr key={r.id} className="bg-white dark:bg-zinc-950">
                      <td className="px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100 sm:px-4">
                        {r.display_name}
                        {isSelf ? (
                          <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">(You)</span>
                        ) : null}
                      </td>
                      <td className="hidden px-3 py-2.5 text-zinc-600 dark:text-zinc-300 sm:table-cell sm:px-4">
                        {r.username ?? "—"}
                      </td>
                      <td className="hidden px-3 py-2.5 text-zinc-600 dark:text-zinc-300 md:table-cell md:px-4">
                        {formatJoined(r.created_at)}
                      </td>
                      <td className="px-3 py-2.5 text-right sm:px-4">
                        {isSelf ? (
                          <span className="text-xs text-zinc-400 dark:text-zinc-500">—</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActionError(null);
                              setConfirmRemove(r);
                            }}
                            className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/40"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirmRemove ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              if (!busy) setConfirmRemove(null);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-member-dialog-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h2
              id="remove-member-dialog-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Remove member?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              This permanently deletes{" "}
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{confirmRemove.display_name}</span>
              {confirmRemove.username ? (
                <>
                  {" "}
                  (<span className="font-mono text-xs">@{confirmRemove.username}</span>)
                </>
              ) : null}{" "}
              from the members list. They will need to sign up again to rejoin.
            </p>
            {actionError ? (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
                {actionError}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmRemove(null)}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void executeRemove()}
                className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
              >
                {busy ? "Removing…" : "Remove member"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
