"use client";

import { useCallback, useState, type ReactNode } from "react";
import { OnboardingResumeSheet } from "@/app/components/onboarding-modal";
import { IconTrackMemorising, IconTrackReciting, IconTrackRevising } from "@/app/components/track-activity-icons";

export type GoalTrackPayload = {
  entries: { surahId: number; name: string }[];
  targetEnd: string;
  daysLeft: number;
};

export type MyGoalsPayload = {
  /** UTC YYYY-MM-DD when `member_goals` was last saved — start of the bar window. */
  progressAnchorYmd?: string;
  memorizing: GoalTrackPayload;
  revising: GoalTrackPayload;
  reciting: GoalTrackPayload;
};

export type StatusLogEntry = {
  line: string;
  dateIso: string;
  dateDisplay: string;
};

type GoalTrackKey = "memorizing" | "revising" | "reciting";

function formatSurahList(entries: { surahId: number; name: string }[]): string {
  if (entries.length === 0) return "—";
  return entries.map((e) => e.name).join(", ");
}

function utcTodayYmd(): string {
  const t = new Date();
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole calendar days from `fromYmd` to `toYmd` (can be negative if `toYmd` is earlier). */
function calendarDaysBetweenYmd(fromYmd: string, toYmd: string): number {
  const [y1, m1, d1] = fromYmd.split("-").map(Number);
  const [y2, m2, d2] = toYmd.split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;
  const t0 = Date.UTC(y1, m1 - 1, d1);
  const t1 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t1 - t0) / 86400000);
}

/**
 * Elapsed fraction from anchor → deadline (matches server `daysLeft` when anchor is goal save date).
 * Falls back to legacy 60-day stub if `progressAnchorYmd` is missing.
 */
function goalBarElapsed01(progressAnchorYmd: string | undefined, targetEnd: string, daysLeft: number): number {
  if (progressAnchorYmd) {
    const span = calendarDaysBetweenYmd(progressAnchorYmd, targetEnd);
    if (span <= 0) {
      return utcTodayYmd() >= targetEnd ? 1 : 0;
    }
    const elapsed = calendarDaysBetweenYmd(progressAnchorYmd, utcTodayYmd());
    return Math.min(1, Math.max(0, elapsed / span));
  }
  const cap = 60;
  const d = Math.min(Math.max(daysLeft, 0), cap);
  return Math.min(1, Math.max(0, (cap - d) / cap));
}

function IconGoalDeadlineCheck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function GoalTrackCard({
  trackLabel,
  verb,
  entries,
  daysLeft,
  targetEnd,
  progressAnchorYmd,
  icon,
  onCompleted,
  busy,
  error,
}: {
  trackLabel: string;
  verb: string;
  entries: { surahId: number; name: string }[];
  daysLeft: number;
  targetEnd: string;
  progressAnchorYmd?: string;
  icon: ReactNode;
  onCompleted: () => void;
  busy: boolean;
  error: string | null;
}) {
  const list = formatSurahList(entries);
  const dayLabel = daysLeft === 1 ? "day" : "days";
  const pct = goalBarElapsed01(progressAnchorYmd, targetEnd, daysLeft) * 100;

  return (
    <div className="overflow-hidden rounded-2xl bg-zinc-900 text-white shadow-xl ring-1 ring-white/10 dark:bg-zinc-950 dark:ring-white/5">
      <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{trackLabel}</p>
          <p className="mt-2 flex items-center gap-2 text-sm text-zinc-300">
            <span className="shrink-0 opacity-90">{icon}</span>
            <span className="min-w-0 leading-snug">
              <span className="font-semibold text-white">{verb}</span>{" "}
              <span className="text-zinc-400">{list}</span>
            </span>
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onCompleted}
          className="shrink-0 rounded-full border border-white/20 bg-white/5 px-2.5 py-2 text-center text-[10px] font-semibold leading-tight text-white shadow-inner transition hover:bg-white/10 disabled:opacity-50 sm:px-3 sm:text-[11px]"
        >
          Mark as Complete
        </button>
      </div>

      <div className="px-4 sm:px-5">
        <p className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
          <span className="text-zinc-500">in </span>
          <span className="text-zinc-100">{daysLeft}</span>
          <span className="text-zinc-500"> {dayLabel}</span>
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          On track · deadline <span className="text-zinc-400">{targetEnd}</span>
        </p>
      </div>

      <div className="mt-5 px-4 pb-5 sm:px-5">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div
            className="h-2 w-2 shrink-0 rounded-full bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.12)]"
            title="Goal set"
          />
          <div className="relative h-1.5 min-w-0 flex-1 rounded-full bg-white/10">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
            <div
              className="absolute -top-2.5 size-5 max-w-[calc(100%-0.25rem)] -translate-x-1/2 rounded-full border-2 border-white bg-violet-500 shadow-md"
              style={{ left: `clamp(0.625rem, ${pct}%, calc(100% - 0.625rem))` }}
              title={`${Math.round(pct)}% of the way to your deadline`}
            />
          </div>
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-white/35 bg-white/5 text-white"
            title="Deadline"
          >
            <IconGoalDeadlineCheck className="text-white" />
          </div>
        </div>
      </div>

      {error ? (
        <p className="border-t border-white/10 px-4 py-2 text-xs text-red-400 sm:px-5" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function GoalsStatusLog({ entries }: { entries: StatusLogEntry[] }) {
  return (
    <section className="mt-6 border-t border-zinc-200 pt-5 dark:border-zinc-800" aria-labelledby="goals-status-log-heading">
      <h2 id="goals-status-log-heading" className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        Status log
      </h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          No activity yet. Updates from the <span className="font-medium text-zinc-600 dark:text-zinc-300">I am…</span> picker and
          goal completions appear here.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {entries.map((e, i) => (
            <li key={`${e.dateIso}-${i}`} className="text-sm leading-snug">
              <span className="text-zinc-800 dark:text-zinc-200">{e.line}</span>
              <span className="text-zinc-500 dark:text-zinc-400"> — {e.dateDisplay}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function MyGoalsPanel({
  goals,
  statusLog = [],
  resumeWelcomeSetup = false,
  onWelcomeDone,
  onGoalsUpdated,
}: {
  goals: MyGoalsPayload | null;
  statusLog?: StatusLogEntry[];
  resumeWelcomeSetup?: boolean;
  onWelcomeDone?: () => void;
  onGoalsUpdated?: () => void;
}) {
  const [busyTrack, setBusyTrack] = useState<GoalTrackKey | null>(null);
  const [errTrack, setErrTrack] = useState<Partial<Record<GoalTrackKey, string>>>({});

  const completeTrack = useCallback(
    async (track: GoalTrackKey) => {
      setBusyTrack(track);
      setErrTrack((e) => {
        const n = { ...e };
        delete n[track];
        return n;
      });
      try {
        const res = await fetch("/api/goal-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setErrTrack((e) => ({ ...e, [track]: data.error ?? "Could not save." }));
          return;
        }
        setErrTrack((e) => {
          const n = { ...e };
          delete n[track];
          return n;
        });
        onGoalsUpdated?.();
      } finally {
        setBusyTrack(null);
      }
    },
    [onGoalsUpdated]
  );

  if (!goals) {
    return (
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-6 sm:px-8">
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            You don’t have active goals yet. Open the <span className="font-medium text-zinc-700 dark:text-zinc-300">Add Goals</span>{" "}
            bar below, or use the chat picker (<span className="font-medium text-zinc-700 dark:text-zinc-300">I am…</span>) for
            active tracks.
          </p>
          <GoalsStatusLog entries={statusLog} />
        </div>
        {resumeWelcomeSetup && onWelcomeDone ? <OnboardingResumeSheet onDone={onWelcomeDone} /> : null}
      </div>
    );
  }

  const hasAny =
    goals.memorizing.entries.length > 0 ||
    goals.revising.entries.length > 0 ||
    goals.reciting.entries.length > 0;

  if (!hasAny) {
    return (
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-6 sm:px-8">
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            No goal surahs on file. Use <span className="font-medium text-zinc-700 dark:text-zinc-300">Add Goals</span> below or
            finish onboarding. Active tracks (for Focus) still come from the chat bubble.
          </p>
          <GoalsStatusLog entries={statusLog} />
        </div>
      </div>
    );
  }

  const sections: ReactNode[] = [];
  if (goals.memorizing.entries.length) {
    sections.push(
      <GoalTrackCard
        key="m"
        trackLabel="Memorising goal"
        verb="Memorise"
        entries={goals.memorizing.entries}
        daysLeft={goals.memorizing.daysLeft}
        targetEnd={goals.memorizing.targetEnd}
        progressAnchorYmd={goals.progressAnchorYmd}
        icon={<IconTrackMemorising className="h-4 w-4 text-emerald-400" />}
        busy={busyTrack === "memorizing"}
        error={errTrack.memorizing || null}
        onCompleted={() => void completeTrack("memorizing")}
      />
    );
  }
  if (goals.revising.entries.length) {
    sections.push(
      <GoalTrackCard
        key="r"
        trackLabel="Revising goal"
        verb="Revise"
        entries={goals.revising.entries}
        daysLeft={goals.revising.daysLeft}
        targetEnd={goals.revising.targetEnd}
        progressAnchorYmd={goals.progressAnchorYmd}
        icon={<IconTrackRevising className="h-4 w-4 text-indigo-400" />}
        busy={busyTrack === "revising"}
        error={errTrack.revising || null}
        onCompleted={() => void completeTrack("revising")}
      />
    );
  }
  if (goals.reciting.entries.length) {
    sections.push(
      <GoalTrackCard
        key="c"
        trackLabel="Reciting goal"
        verb="Recite"
        entries={goals.reciting.entries}
        daysLeft={goals.reciting.daysLeft}
        targetEnd={goals.reciting.targetEnd}
        progressAnchorYmd={goals.progressAnchorYmd}
        icon={<IconTrackReciting className="h-4 w-4 text-amber-400" />}
        busy={busyTrack === "reciting"}
        error={errTrack.reciting || null}
        onCompleted={() => void completeTrack("reciting")}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pt-6 pb-4 sm:px-8 sm:pb-6">
        {sections}
        <GoalsStatusLog entries={statusLog} />
      </div>
    </div>
  );
}
