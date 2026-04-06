"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  /** progress_events.event_kind — drives timeline icon + colour. */
  eventKind: string;
  line: string;
  dateIso: string;
  dateDisplay: string;
};

export type GoalTrackKey = "memorizing" | "revising" | "reciting";

/** Matches filled intention cards so empty dashed cards align in the stack. */
const INTENTION_CARD_MIN_HEIGHT_CLASS = "min-h-[248px]";

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

function IconPencil({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function IconCheckMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
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
  onEdit,
  onRequestComplete,
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
  onEdit?: () => void;
  /** Opens confirmation — actual completion runs after user confirms. */
  onRequestComplete: () => void;
  busy: boolean;
  error: string | null;
}) {
  const list = formatSurahList(entries);
  const dayLabel = daysLeft === 1 ? "day" : "days";
  const pct = goalBarElapsed01(progressAnchorYmd, targetEnd, daysLeft) * 100;
  const iconBtnClass =
    "flex size-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white shadow-inner outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl bg-zinc-900 text-white shadow-xl ring-1 ring-white/10 dark:bg-zinc-950 dark:ring-white/5 ${INTENTION_CARD_MIN_HEIGHT_CLASS}`}
    >
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
        <div className="flex shrink-0 items-center gap-1.5">
          {onEdit ? (
            <button
              type="button"
              disabled={busy}
              onClick={onEdit}
              className={iconBtnClass}
              aria-label="Edit intention"
            >
              <IconPencil />
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onRequestComplete}
            className={iconBtnClass}
            aria-label="Mark as complete"
          >
            <IconCheckMark />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-4 sm:px-5">
        <p className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
          <span className="text-zinc-500">in </span>
          <span className="text-zinc-100">{daysLeft}</span>
          <span className="text-zinc-500"> {dayLabel}</span>
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          On track · deadline <span className="text-zinc-400">{targetEnd}</span>
        </p>
      </div>

      <div className="mt-auto px-4 pb-5 pt-5 sm:px-5">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div
            className="h-2 w-2 shrink-0 rounded-full bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.12)]"
            title="Intention set"
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

function IconTimelineCheck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
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

function IconTimelineActivity({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function timelineNodeForKind(kind: string): { circle: string; icon: ReactNode } {
  switch (kind) {
    case "memorizing":
      return {
        circle: "bg-emerald-100 dark:bg-emerald-950/55 ring-1 ring-emerald-200/80 dark:ring-emerald-800/60",
        icon: <IconTrackMemorising className="h-[18px] w-[18px] text-emerald-700 dark:text-emerald-400" />,
      };
    case "revising":
      return {
        circle: "bg-indigo-100 dark:bg-indigo-950/55 ring-1 ring-indigo-200/80 dark:ring-indigo-800/60",
        icon: <IconTrackRevising className="h-[18px] w-[18px] text-indigo-700 dark:text-indigo-400" />,
      };
    case "reciting":
      return {
        circle: "bg-amber-100 dark:bg-amber-950/55 ring-1 ring-amber-200/80 dark:ring-amber-800/60",
        icon: <IconTrackReciting className="h-[18px] w-[18px] text-amber-800 dark:text-amber-400" />,
      };
    case "completed":
      return {
        circle: "bg-emerald-100 dark:bg-emerald-950/55 ring-1 ring-emerald-200/80 dark:ring-emerald-800/60",
        icon: <IconTimelineCheck className="text-emerald-700 dark:text-emerald-400" />,
      };
    default:
      return {
        circle: "bg-zinc-200 dark:bg-zinc-800 ring-1 ring-zinc-300/80 dark:ring-zinc-600/60",
        icon: <IconTimelineActivity className="text-zinc-600 dark:text-zinc-400" />,
      };
  }
}

function GoalTrackEmptyCard({
  trackLabel,
  bodyLine,
  buttonLabel,
  onSet,
  disabled,
  disabledHint,
  icon,
}: {
  trackLabel: string;
  bodyLine: string;
  buttonLabel: string;
  onSet: () => void;
  disabled?: boolean;
  disabledHint?: string;
  icon: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 shadow-sm dark:border-zinc-600 dark:bg-zinc-900/40 ${INTENTION_CARD_MIN_HEIGHT_CLASS}`}
    >
      <div className="flex min-h-0 flex-1 flex-col px-4 py-5 sm:px-5 sm:py-6">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{trackLabel}</p>
        <div className="mt-3 flex min-h-0 flex-1 items-start gap-3">
          <span className="mt-0.5 shrink-0 opacity-80">{icon}</span>
          <p className="min-w-0 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{bodyLine}</p>
        </div>
        <div className="mt-auto shrink-0 pt-6">
          <button
            type="button"
            disabled={disabled}
            title={disabled ? disabledHint : undefined}
            onClick={onSet}
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-zinc-100 dark:text-zinc-900 dark:enabled:hover:bg-zinc-200"
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function completeTrackConfirmCopy(track: GoalTrackKey): { title: string; body: string } {
  switch (track) {
    case "memorizing":
      return {
        title: "Complete memorisation intention?",
        body: "This marks your current memorisation goal as done. Those surahs will show as memorised on Progress and the Surah matrix.",
      };
    case "revising":
      return {
        title: "Complete revision intention?",
        body: "This marks your revision goal as done for this cycle.",
      };
    case "reciting":
      return {
        title: "Complete recitation intention?",
        body: "This marks your recitation goal as done for this cycle.",
      };
  }
}

function CompleteTrackConfirmModal({
  track,
  busy,
  onCancel,
  onConfirm,
}: {
  track: GoalTrackKey;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { title, body } = completeTrackConfirmCopy(track);
  const titleId = `complete-intention-title-${track}`;
  const descId = `complete-intention-desc-${track}`;
  const node = (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        disabled={busy}
        className="absolute inset-0 bg-black/50"
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <div
        role="alertdialog"
        aria-modal
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-600 dark:bg-zinc-900 sm:p-6"
      >
        <h2 id={titleId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        <p id={descId} className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {body}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {busy ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

function CongratulationToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    const leave = window.setTimeout(() => setVisible(false), 3000);
    const done = window.setTimeout(() => dismissRef.current(), 3330);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, [message]);

  const node = (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[270] flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top,0px))]"
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto max-w-md rounded-2xl border border-emerald-200/90 bg-emerald-50 px-5 py-3 text-center shadow-lg transition-[transform,opacity] duration-300 ease-out dark:border-emerald-800/80 dark:bg-emerald-950/95 ${
          visible ? "translate-y-0 opacity-100" : "-translate-y-[140%] opacity-0"
        }`}
      >
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">{message}</p>
        <p className="mt-0.5 text-xs text-emerald-800/90 dark:text-emerald-200/90">Alhamdulillah</p>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

function GoalsStatusLog({ entries }: { entries: StatusLogEntry[] }) {
  return (
    <section className="mt-6 border-t border-zinc-200 pt-5 dark:border-zinc-800" aria-labelledby="goals-timeline-heading">
      <h2 id="goals-timeline-heading" className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        Timeline
      </h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          No activity yet. Updates from the <span className="font-medium text-zinc-600 dark:text-zinc-300">I am…</span> picker and
          intention completions appear here.
        </p>
      ) : (
        <ul className="mt-4">
          {entries.map((e, i) => {
            const { circle, icon } = timelineNodeForKind(e.eventKind);
            const showLine = i < entries.length - 1;
            return (
              <li key={`${e.dateIso}-${i}`} className="flex gap-3.5 pb-8 last:pb-0">
                <div className="relative flex w-11 shrink-0 flex-col items-center self-stretch">
                  <div
                    className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${circle}`}
                    aria-hidden
                  >
                    {icon}
                  </div>
                  {showLine ? (
                    <div
                      className="absolute left-1/2 top-11 bottom-0 z-0 w-px -translate-x-1/2 bg-zinc-200 dark:bg-zinc-700"
                      aria-hidden
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-100">{e.line}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    <time dateTime={e.dateIso}>{e.dateDisplay}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function MyGoalsPanel({
  goals,
  statusLog = [],
  memorizedSurahCount = 0,
  onSetIntentionForTrack,
  onGoalsUpdated,
}: {
  goals: MyGoalsPayload | null;
  statusLog?: StatusLogEntry[];
  /** Surahs counted as memorised (% Quran) — revision intention needs at least one. */
  memorizedSurahCount?: number;
  onSetIntentionForTrack?: (track: GoalTrackKey) => void;
  onGoalsUpdated?: () => void;
}) {
  const [busyTrack, setBusyTrack] = useState<GoalTrackKey | null>(null);
  const [errTrack, setErrTrack] = useState<Partial<Record<GoalTrackKey, string>>>({});
  const [confirmCompleteTrack, setConfirmCompleteTrack] = useState<GoalTrackKey | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const completeTrack = useCallback(
    async (track: GoalTrackKey): Promise<boolean> => {
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
          return false;
        }
        setErrTrack((e) => {
          const n = { ...e };
          delete n[track];
          return n;
        });
        onGoalsUpdated?.();
        return true;
      } finally {
        setBusyTrack(null);
      }
    },
    [onGoalsUpdated]
  );

  async function onConfirmComplete() {
    if (!confirmCompleteTrack) return;
    const track = confirmCompleteTrack;
    const ok = await completeTrack(track);
    if (ok) {
      setConfirmCompleteTrack(null);
      setToastMessage("Alhamdulillah!");
    }
  }

  const mem = goals?.memorizing;
  const rev = goals?.revising;
  const rec = goals?.reciting;
  const canRevise = memorizedSurahCount > 0;

  const openTrack = (track: GoalTrackKey) => {
    onSetIntentionForTrack?.(track);
  };

  const sections: ReactNode[] = [];

  if (mem && mem.entries.length > 0) {
    sections.push(
      <GoalTrackCard
        key="m"
        trackLabel="Memorising intention"
        verb="Memorise"
        entries={mem.entries}
        daysLeft={mem.daysLeft}
        targetEnd={mem.targetEnd}
        progressAnchorYmd={goals?.progressAnchorYmd}
        icon={<IconTrackMemorising className="h-4 w-4 text-emerald-400" />}
        onEdit={onSetIntentionForTrack ? () => openTrack("memorizing") : undefined}
        busy={busyTrack === "memorizing"}
        error={errTrack.memorizing || null}
        onRequestComplete={() => setConfirmCompleteTrack("memorizing")}
      />
    );
  } else {
    sections.push(
      <GoalTrackEmptyCard
        key="m-empty"
        trackLabel="Memorising intention"
        bodyLine="Your memorisation track is empty."
        buttonLabel="Set intention to memorise"
        onSet={() => openTrack("memorizing")}
        disabled={!onSetIntentionForTrack}
        icon={<IconTrackMemorising className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
      />
    );
  }

  if (rev && rev.entries.length > 0) {
    sections.push(
      <GoalTrackCard
        key="r"
        trackLabel="Revising intention"
        verb="Revise"
        entries={rev.entries}
        daysLeft={rev.daysLeft}
        targetEnd={rev.targetEnd}
        progressAnchorYmd={goals?.progressAnchorYmd}
        icon={<IconTrackRevising className="h-4 w-4 text-indigo-400" />}
        onEdit={onSetIntentionForTrack ? () => openTrack("revising") : undefined}
        busy={busyTrack === "revising"}
        error={errTrack.revising || null}
        onRequestComplete={() => setConfirmCompleteTrack("revising")}
      />
    );
  } else {
    sections.push(
      <GoalTrackEmptyCard
        key="r-empty"
        trackLabel="Revising intention"
        bodyLine={
          canRevise
            ? "Your revision track is empty."
            : "Your revision track is empty. Memorise at least one surah first (onboarding or memorisation intention) to choose revision targets."
        }
        buttonLabel="Set intention to revise"
        onSet={() => openTrack("revising")}
        disabled={!onSetIntentionForTrack || !canRevise}
        disabledHint={canRevise ? undefined : "Memorise surahs first to set a revision intention."}
        icon={<IconTrackRevising className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
      />
    );
  }

  if (rec && rec.entries.length > 0) {
    sections.push(
      <GoalTrackCard
        key="c"
        trackLabel="Reciting intention"
        verb="Recite"
        entries={rec.entries}
        daysLeft={rec.daysLeft}
        targetEnd={rec.targetEnd}
        progressAnchorYmd={goals?.progressAnchorYmd}
        icon={<IconTrackReciting className="h-4 w-4 text-amber-400" />}
        onEdit={onSetIntentionForTrack ? () => openTrack("reciting") : undefined}
        busy={busyTrack === "reciting"}
        error={errTrack.reciting || null}
        onRequestComplete={() => setConfirmCompleteTrack("reciting")}
      />
    );
  } else {
    sections.push(
      <GoalTrackEmptyCard
        key="c-empty"
        trackLabel="Reciting intention"
        bodyLine="Your recitation track is empty."
        buttonLabel="Set intention to recite"
        onSet={() => openTrack("reciting")}
        disabled={!onSetIntentionForTrack}
        icon={<IconTrackReciting className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pt-6 pb-4 sm:px-8 sm:pb-6">
        {sections}
        <GoalsStatusLog entries={statusLog} />
      </div>
      {confirmCompleteTrack ? (
        <CompleteTrackConfirmModal
          track={confirmCompleteTrack}
          busy={busyTrack === confirmCompleteTrack}
          onCancel={() => setConfirmCompleteTrack(null)}
          onConfirm={() => void onConfirmComplete()}
        />
      ) : null}
      {toastMessage ? (
        <CongratulationToast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      ) : null}
    </div>
  );
}
