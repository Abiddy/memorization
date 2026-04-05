"use client";

import { useCallback, useState } from "react";

export type MyCircleSummary = {
  id: string;
  name: string;
  invite_token: string;
  created_at: string;
  member_count: number;
};

function formatCreated(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function MyCirclesListPanel({
  circle,
  onOpenCircle,
  onCircleUpdated,
}: {
  circle: MyCircleSummary | null;
  onOpenCircle: (c: MyCircleSummary) => void;
  onCircleUpdated: () => void;
}) {
  const [joinOpen, setJoinOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [joinLink, setJoinLink] = useState("");
  const [newName, setNewName] = useState("");
  const [joinConfirmOpen, setJoinConfirmOpen] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetJoinFlow = useCallback(() => {
    setJoinOpen(false);
    setJoinConfirmOpen(false);
    setJoinLink("");
    setError(null);
  }, []);

  const resetStartFlow = useCallback(() => {
    setStartOpen(false);
    setStartConfirmOpen(false);
    setNewName("");
    setError(null);
  }, []);

  async function executeJoin() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/circles/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteLinkOrToken: joinLink }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not join.");
        return;
      }
      resetJoinFlow();
      onCircleUpdated();
    } catch {
      setError("Could not join.");
    } finally {
      setBusy(false);
    }
  }

  async function executeStart() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/circles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not create circle.");
        return;
      }
      resetStartFlow();
      onCircleUpdated();
    } catch {
      setError("Could not create circle.");
    } finally {
      setBusy(false);
    }
  }

  if (circle) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6">
        <button
          type="button"
          onClick={() => onOpenCircle(circle)}
          className="w-full rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/80"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{circle.name}</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {circle.member_count} member{circle.member_count === 1 ? "" : "s"}
              </p>
            </div>
            <p className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">{formatCreated(circle.created_at)}</p>
          </div>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Tap to open chat, stats, and group views.</p>
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-10 sm:px-6">
      <p className="text-center text-base font-medium text-zinc-800 dark:text-zinc-200">
        You haven&apos;t joined a Suhbah yet
      </p>
      <p className="mt-2 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Practice stays private until you join or start a circle. Then your progress and stats are visible to members
        of that circle.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setStartOpen(true);
          }}
          className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Start a New Circle
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setJoinOpen(true);
          }}
          className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Join Circle
        </button>
      </div>

      {joinOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/50"
            onClick={() => !busy && resetJoinFlow()}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-circle-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h2 id="join-circle-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Join a circle
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Paste the invite link (or invite code) you received from your circle host.
            </p>
            <label className="mt-4 block text-xs font-medium text-zinc-600 dark:text-zinc-400" htmlFor="join-link">
              Invite link or code
            </label>
            <textarea
              id="join-link"
              rows={3}
              value={joinLink}
              onChange={(e) => setJoinLink(e.target.value)}
              placeholder="https://… or paste the code"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {error ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => resetJoinFlow()}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !joinLink.trim()}
                onClick={() => {
                  setError(null);
                  setJoinConfirmOpen(true);
                }}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {joinConfirmOpen ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/50"
            onClick={() => !busy && setJoinConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-confirm-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h2 id="join-confirm-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Join this Suhbah?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              By joining, members of this circle will be able to see your memorisation progress, goals-related activity,
              and statistics alongside theirs. Your data remains visible only within this circle, not publicly.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setJoinConfirmOpen(false)}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void executeJoin()}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                {busy ? "Joining…" : "Join circle"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {startOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/50"
            onClick={() => !busy && resetStartFlow()}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-circle-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h2 id="start-circle-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Name your circle
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Choose a name your group will recognise (e.g. family name or class).
            </p>
            <label className="mt-4 block text-xs font-medium text-zinc-600 dark:text-zinc-400" htmlFor="circle-name">
              Circle name
            </label>
            <input
              id="circle-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={80}
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {error ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => resetStartFlow()}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !newName.trim()}
                onClick={() => {
                  setError(null);
                  setStartConfirmOpen(true);
                }}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {startConfirmOpen ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/50"
            onClick={() => !busy && setStartConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-confirm-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h2 id="start-confirm-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Create this Suhbah?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              You will be the host. Anyone you invite can join and see circle-wide progress, stats, and chat. Your own
              activity in this app will be visible to members of this circle once they join.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setStartConfirmOpen(false)}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void executeStart()}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                {busy ? "Creating…" : "Create circle"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
