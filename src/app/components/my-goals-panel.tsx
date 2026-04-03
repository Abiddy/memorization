"use client";

import type { ReactNode } from "react";
import { OnboardingResumeSheet } from "@/app/components/onboarding-modal";
import { IconTrackMemorising, IconTrackReciting, IconTrackRevising } from "@/app/components/track-activity-icons";

export type GoalTrackPayload = {
  entries: { surahId: number; name: string }[];
  targetEnd: string;
  daysLeft: number;
};

export type MyGoalsPayload = {
  memorizing: GoalTrackPayload;
  revising: GoalTrackPayload;
  reciting: GoalTrackPayload;
};

function formatSurahList(entries: { surahId: number; name: string }[]): string {
  if (entries.length === 0) return "—";
  return entries.map((e) => e.name).join(", ");
}

function GoalBlock({
  verb,
  entries,
  daysLeft,
  targetEnd,
  icon,
}: {
  verb: string;
  entries: { surahId: number; name: string }[];
  daysLeft: number;
  targetEnd: string;
  icon: ReactNode;
}) {
  if (entries.length === 0) return null;
  const list = formatSurahList(entries);
  const dayLabel = daysLeft === 1 ? "day" : "days";
  return (
    <div className="text-left">
      <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <span className="shrink-0">{icon}</span>
        <span>
          <span className="font-medium text-zinc-700 dark:text-zinc-200">{verb}</span>{" "}
          <span className="text-zinc-600 dark:text-zinc-300">{list}</span>
        </span>
      </p>
      <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
        in {daysLeft} {dayLabel}
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">by {targetEnd}</p>
    </div>
  );
}

export function MyGoalsPanel({
  goals,
  resumeWelcomeSetup = false,
  onWelcomeDone,
}: {
  goals: MyGoalsPayload | null;
  /** True when onboarding was skipped or finished without saving goals (`member_goals` row missing). */
  resumeWelcomeSetup?: boolean;
  onWelcomeDone?: () => void;
}) {
  if (!goals) {
    return (
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-10 sm:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">My goals</p>
          <p className="mt-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            You don’t have active goals yet. Complete the welcome setup when you join, or use the Surah matrix to track
            memorising, revising, and reciting.
          </p>
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
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col overflow-y-auto px-5 py-10 sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">My goals</p>
        <p className="mt-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Add surahs to your tracks in the matrix to see goals here. Each track can have its own deadline from setup.
        </p>
      </div>
    );
  }

  const sections: ReactNode[] = [];
  if (goals.memorizing.entries.length) {
    sections.push(
      <GoalBlock
        key="m"
        verb="Memorise"
        entries={goals.memorizing.entries}
        daysLeft={goals.memorizing.daysLeft}
        targetEnd={goals.memorizing.targetEnd}
        icon={<IconTrackMemorising className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
      />
    );
  }
  if (goals.revising.entries.length) {
    sections.push(
      <GoalBlock
        key="r"
        verb="Revise"
        entries={goals.revising.entries}
        daysLeft={goals.revising.daysLeft}
        targetEnd={goals.revising.targetEnd}
        icon={<IconTrackRevising className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
      />
    );
  }
  if (goals.reciting.entries.length) {
    sections.push(
      <GoalBlock
        key="c"
        verb="Recite"
        entries={goals.reciting.entries}
        daysLeft={goals.reciting.daysLeft}
        targetEnd={goals.reciting.targetEnd}
        icon={<IconTrackReciting className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-5 py-8 sm:px-8 sm:py-10">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">My goals</p>
      <div className="mt-10 flex flex-col gap-12">{sections}</div>
      <p className="mt-12 text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">
        Update your tracks anytime in the Surah matrix. Goal deadlines count down to the date you picked at setup.
      </p>
    </div>
  );
}
