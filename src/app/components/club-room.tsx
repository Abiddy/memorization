"use client";

import Image from "next/image";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  MatrixTrackLegend,
  SurahHeatmapPanel,
  SurahMatrixHelpButton,
  type HeatmapPayload,
} from "@/app/components/surah-heatmap-panel";
import { IconTrackMemorising, IconTrackReciting, IconTrackRevising } from "@/app/components/track-activity-icons";
import { MyGoalsPanel, type MyGoalsPayload, type StatusLogEntry } from "@/app/components/my-goals-panel";
import { AdminUsersPanel } from "@/app/components/admin-users-panel";
import { CircleHubPanel } from "@/app/components/circle-hub-panel";
import { MyCirclesListPanel, type MyCircleSummary } from "@/app/components/my-circles-panel";
import { StatsMemorisationOverTimeStrip } from "@/app/components/stats-robinhood";
import {
  AddGoalsModal,
  type AddGoalsModalInitial,
  OnboardingModal,
} from "@/app/components/onboarding-modal";
import type { MemberTrajectory } from "@/lib/progress-aggregate";
import { buildFiveMonthMemorisationChart } from "@/lib/projection-chart";
import { uniqueSurahsInJuz } from "@/lib/quran";

type DashboardSurahEntry = {
  juz: number;
  surahId: number;
  name: string;
};

type DashboardRow = {
  member_id: string;
  display_name: string;
  revising: DashboardSurahEntry[];
  memorising: DashboardSurahEntry[];
  reciting: DashboardSurahEntry[];
  completed_memorising: DashboardSurahEntry[];
  completed_revising: DashboardSurahEntry[];
  completed_reciting: DashboardSurahEntry[];
  pct_quran: number;
};

const FOCUS_BADGE_CLASS =
  "inline-flex min-w-[1rem] shrink-0 items-center justify-center rounded border border-zinc-300/90 bg-zinc-200/90 px-0.5 py-px text-[8px] font-semibold tabular-nums leading-none text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 lg:min-w-[1.125rem] lg:rounded-md lg:px-1 lg:text-[9px]";

function FocusTrackCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="11"
      height="11"
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

/** English ordinal for juz label: 1st, 2nd, 21st, 30th */
function ordinalJuz(n: number): string {
  const teen = n % 100;
  if (teen >= 11 && teen <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Juz J is “fully present” if every surah that appears in juz J (whole-surah model) is in `ids`.
 * Greedy juz 1→30: each full juz removes its surahs so one surah isn’t condensed twice.
 */
function partitionFullJuzes(ids: ReadonlySet<number>): { fullJuz: number[]; remainingIds: number[] } {
  const pool = new Set(ids);
  const fullJuz: number[] = [];
  for (let j = 1; j <= 30; j++) {
    const required = uniqueSurahsInJuz(j);
    if (required.length === 0) continue;
    if (required.every((sid) => pool.has(sid))) {
      fullJuz.push(j);
      for (const sid of required) pool.delete(sid);
    }
  }
  return { fullJuz, remainingIds: [...pool].sort((a, b) => a - b) };
}

type FocusTrackPiece =
  | { kind: "juz"; juzNum: number; done: boolean }
  | { kind: "surah"; entry: DashboardSurahEntry; done: boolean };

function buildFocusPieces(entries: DashboardSurahEntry[], done: boolean): FocusTrackPiece[] {
  const byId = new Map<number, DashboardSurahEntry>();
  for (const e of entries) byId.set(e.surahId, e);
  const ids = new Set(entries.map((e) => e.surahId));
  const { fullJuz, remainingIds } = partitionFullJuzes(ids);
  const pieces: FocusTrackPiece[] = [];
  for (const j of fullJuz.sort((a, b) => a - b)) {
    pieces.push({ kind: "juz", juzNum: j, done });
  }
  for (const sid of remainingIds) {
    const entry = byId.get(sid);
    if (entry) pieces.push({ kind: "surah", entry, done });
  }
  return pieces;
}

/** Active + completed for one track: completed first (green + ✓), then in-progress (normal). */
function FocusTrackCombinedList({
  active,
  completed,
}: {
  active: DashboardSurahEntry[];
  completed: DashboardSurahEntry[];
}) {
  const doneIds = new Set(completed.map((c) => c.surahId));
  const activeOnly = active.filter((a) => !doneIds.has(a.surahId));
  const pieces: FocusTrackPiece[] = [
    ...buildFocusPieces(completed, true),
    ...buildFocusPieces(activeOnly, false),
  ];

  if (pieces.length === 0) {
    return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  }

  const rowClass = (done: boolean) =>
    done
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-zinc-600 dark:text-zinc-400";

  return (
    <>
      <span className="flex flex-col gap-0.5 text-[10px] leading-tight lg:hidden">
        {pieces.map((p) =>
          p.kind === "juz" ? (
            <span
              key={`juz-${p.juzNum}-${p.done ? "d" : "a"}`}
              className={`inline-flex min-w-0 max-w-full items-baseline gap-0.5 ${rowClass(p.done)}`}
            >
              <span className="min-w-0 break-words [overflow-wrap:anywhere]" title={`Juz ${p.juzNum}`}>
                {ordinalJuz(p.juzNum)} Juz
              </span>
              {p.done ? <FocusTrackCheckIcon className="mt-px shrink-0 text-emerald-600 dark:text-emerald-400" /> : null}
            </span>
          ) : (
            <span
              key={p.entry.surahId}
              className={`inline-flex min-w-0 max-w-full items-baseline gap-0.5 ${rowClass(p.done)}`}
            >
              <span className={FOCUS_BADGE_CLASS} title={`Juz ${p.entry.juz}`}>
                {p.entry.juz}
              </span>
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{p.entry.name}</span>
              {p.done ? <FocusTrackCheckIcon className="mt-px shrink-0 text-emerald-600 dark:text-emerald-400" /> : null}
            </span>
          )
        )}
      </span>
      <span className="hidden text-sm leading-relaxed lg:inline">
        {pieces.map((p, i) => (
          <Fragment key={p.kind === "juz" ? `juz-${p.juzNum}-${p.done ? "d" : "a"}` : p.entry.surahId}>
            {i > 0 ? <span className="text-zinc-500">, </span> : null}
            {p.kind === "juz" ? (
              <span className={`inline-flex items-baseline gap-1 ${rowClass(p.done)}`} title={`Juz ${p.juzNum}`}>
                <span>{ordinalJuz(p.juzNum)} Juz</span>
                {p.done ? <FocusTrackCheckIcon className="shrink-0 text-emerald-600 dark:text-emerald-400" /> : null}
              </span>
            ) : (
              <span className={`inline-flex items-baseline gap-1 ${rowClass(p.done)}`}>
                <span className={FOCUS_BADGE_CLASS} title={`Juz ${p.entry.juz}`}>
                  {p.entry.juz}
                </span>
                <span>{p.entry.name}</span>
                {p.done ? <FocusTrackCheckIcon className="shrink-0 text-emerald-600 dark:text-emerald-400" /> : null}
              </span>
            )}
          </Fragment>
        ))}
      </span>
    </>
  );
}

type ProgressMe = {
  needsOnboarding: boolean;
  memorized_surah_ids: number[];
  goals: MyGoalsPayload | null;
  statusLog: StatusLogEntry[];
  is_admin?: boolean;
};

type ProgressReport = {
  leaderboard: { member_id: string; display_name: string; pct_quran: number }[];
  clubSeries: { date: string; clubPct: number }[];
  projection: { date: string; clubPct: number; projected: true }[];
  memberTrajectories: MemberTrajectory[];
  dashboard: DashboardRow[];
  heatmap: HeatmapPayload | null;
  me: ProgressMe | null;
};

type MainPanel = "circles" | "focus" | "goals" | "heatmap" | "stats" | "users";

type ClearFocusTrack = "memorizing" | "revising" | "reciting";

function addGoalsModalInitialFromPayload(goals: MyGoalsPayload | null): AddGoalsModalInitial {
  if (!goals) return null;
  return {
    memorizing: {
      surahIds: goals.memorizing.entries.map((e) => e.surahId),
      targetEnd: goals.memorizing.targetEnd,
    },
    revising: {
      surahIds: goals.revising.entries.map((e) => e.surahId),
      targetEnd: goals.revising.targetEnd,
    },
    reciting: {
      surahIds: goals.reciting.entries.map((e) => e.surahId),
      targetEnd: goals.reciting.targetEnd,
    },
  };
}

function ClubBrandTitle() {
  return (
    <div className="flex items-center gap-2">
      <Image
        src="/icon.svg"
        alt=""
        width={14}
        height={14}
        sizes="16px"
        className="h-[16px] w-[16px] shrink-0 object-contain"
        priority
        aria-hidden
      />
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 sm:text-[13px]">
        Alif Laam Meem
      </p>
    </div>
  );
}

const NAV: {
  id: MainPanel;
  label: string;
  Icon: (props: { className?: string }) => ReactNode;
}[] = [
  {
    id: "goals",
    label: "Intention",
    Icon: function IconGoals({ className }: { className?: string }) {
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    },
  },
  {
    id: "circles",
    label: "Circles",
    Icon: function IconCircles({ className }: { className?: string }) {
      return (
        <svg
          className={className}
          width="18"
          height="18"
          viewBox="0 -960 960 960"
          fill="currentColor"
          aria-hidden
        >
          <path d="M671-383.08q24.54 1.23 48.38-2.34 23.85-3.58 46.54-12.35-15.61 123.69-108.31 205.73Q564.92-110 440-110q-68.46 0-128.58-26-60.11-26-104.76-70.66Q162-251.31 136-311.42 110-371.54 110-440q0-124.92 82.04-217.42 82.04-92.5 205.73-108.89-8.77 22.7-12.35 46.73-3.57 24.04-2.34 48.58-80.46 19.23-131.77 83.35Q200-523.54 200-440q0 100 70 170t170 70q83.54 0 148.04-51.31 64.5-51.31 82.96-131.77Zm9-513.84q90.38 0 153.65 63.27 63.27 63.27 63.27 153.65t-63.27 153.65Q770.38-463.08 680-463.08t-153.65-63.27Q463.08-589.62 463.08-680t63.27-153.65q63.27-63.27 153.65-63.27Zm0 343.84q52.88 0 89.9-37.02t37.02-89.9q0-52.88-37.02-89.9T680-806.92q-52.88 0-89.9 37.02T553.08-680q0 52.88 37.02 89.9t89.9 37.02ZM680-680ZM435.69-435.69Z" />
        </svg>
      );
    },
  },
  {
    id: "focus",
    label: "Progress",
    Icon: function IconProgress({ className }: { className?: string }) {
      return (
        <svg
          className={className}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="3" y1="16" x2="21" y2="16" />
          <line x1="12" y1="4" x2="12" y2="20" />
        </svg>
      );
    },
  },
  {
    id: "heatmap",
    label: "Surah matrix",
    Icon: function IconHeatmap({ className }: { className?: string }) {
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    },
  },
  {
    id: "stats",
    label: "Stats",
    Icon: function IconStats({ className }: { className?: string }) {
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 3v18h18" />
          <path d="M7 16l4-6 4 3 5-9" />
          <line x1="18" y1="20" x2="18" y2="14" />
          <line x1="12" y1="20" x2="12" y2="10" />
        </svg>
      );
    },
  },
];

const USERS_NAV_ITEM: (typeof NAV)[number] = {
  id: "users",
  label: "Users",
  Icon: function IconUsers({ className }: { className?: string }) {
    return (
      <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  },
};

function avatarBackground(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 42% 88%)`;
}

function panelTitle(p: MainPanel): string {
  switch (p) {
    case "circles":
      return "Circles";
    case "focus":
      return "Progress";
    case "goals":
      return "Intention";
    case "heatmap":
      return "Surah matrix";
    case "stats":
      return "Stats";
    case "users":
      return "Users";
    default:
      return "Club";
  }
}

function clearTrackModalLabels(track: ClearFocusTrack): { question: string; action: string } {
  switch (track) {
    case "memorizing":
      return {
        question: "Are you sure you want to clear your memorisation track?",
        action: "Clear memorisation track",
      };
    case "revising":
      return {
        question: "Are you sure you want to clear your revision track?",
        action: "Clear revision track",
      };
    case "reciting":
      return {
        question: "Are you sure you want to clear your recitation track?",
        action: "Clear recitation track",
      };
  }
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function ClubSideNav({
  panel,
  onSelectPanel,
  initialDisplayName,
  onLogout,
  closeOnNavigate,
  onNavigate,
  isAdmin,
}: {
  panel: MainPanel;
  onSelectPanel: (p: MainPanel) => void;
  initialDisplayName: string;
  onLogout: () => void;
  closeOnNavigate?: boolean;
  onNavigate?: () => void;
  isAdmin: boolean;
}) {
  function pick(p: MainPanel) {
    onSelectPanel(p);
    if (closeOnNavigate) onNavigate?.();
  }

  const navItems = isAdmin ? [...NAV, USERS_NAV_ITEM] : NAV;

  return (
    <>
      <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 pt-3" aria-label="Club navigation">
        {navItems.map((item) => {
          const active = panel === item.id;
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => pick(item.id)}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center gap-3.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                active
                  ? "bg-[#ebebeb] text-zinc-900 dark:bg-zinc-800/90 dark:text-zinc-100"
                  : "text-zinc-600 hover:bg-black/[0.06] dark:text-zinc-400 dark:hover:bg-zinc-800/50"
              }`}
            >
              <Icon
                className={`h-5 w-5 shrink-0 ${active ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-500 dark:text-zinc-400"}`}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="shrink-0 border-t border-black/[0.06] p-4 dark:border-zinc-800">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2.5">
          <div
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-zinc-700 dark:text-zinc-200"
            style={{ backgroundColor: avatarBackground(initialDisplayName) }}
          >
            {initialDisplayName.trim().slice(0, 1).toUpperCase() || "?"}
            <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-[#f4f4f4] dark:ring-zinc-900" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{initialDisplayName}</p>
            <button
              type="button"
              onClick={() => void onLogout()}
              className="mt-1 text-xs text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:hover:text-zinc-300"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

type MemberBrief = { id: string; display_name: string };

function IconChevronDownSm({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconGroupLink({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/** Compact overlapping avatars in the header; opens a popover with full roster + copy group link. */
function GroupMemberStack({
  members,
  currentMemberId,
  onCopyGroupLink,
  inviteCopied,
  showLeaveGroup,
  onLeaveGroup,
  className = "",
}: {
  members: MemberBrief[];
  currentMemberId: string;
  onCopyGroupLink: () => void;
  inviteCopied: boolean;
  /** When true (e.g. viewing a circle from Circles), show Leave group in the roster menu. */
  showLeaveGroup?: boolean;
  onLeaveGroup?: () => Promise<void>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const overlap = "-ml-1.5";
  const faceClass =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none text-zinc-800 ring-1 ring-white dark:text-zinc-100 dark:ring-zinc-950 sm:h-7 sm:w-7 sm:text-[11px]";
  const overflowClass =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-300 text-[9px] font-bold tabular-nums leading-none text-zinc-800 ring-1 ring-white dark:bg-zinc-600 dark:text-zinc-100 dark:ring-zinc-950 sm:h-7 sm:w-7 sm:text-[10px]";

  const triggerSlots = 4;
  let faces: MemberBrief[];
  let overflow = 0;
  if (members.length <= triggerSlots) {
    faces = members;
  } else {
    overflow = members.length - (triggerSlots - 1);
    faces = members.slice(0, triggerSlots - 1);
  }

  const triggerFaces: ReactNode[] = [];
  let z = 1;
  faces.forEach((m, i) => {
    const initial = m.display_name.trim().slice(0, 1).toUpperCase() || "?";
    triggerFaces.push(
      <li
        key={m.id}
        className={i === 0 ? "relative" : `relative ${overlap}`}
        style={{ zIndex: z++ }}
        aria-hidden
      >
        <div className={faceClass} style={{ backgroundColor: avatarBackground(m.display_name) }}>
          {initial}
        </div>
      </li>
    );
  });
  if (overflow > 0) {
    triggerFaces.push(
      <li
        key="overflow"
        className={triggerFaces.length === 0 ? "relative" : `relative ${overlap}`}
        style={{ zIndex: z++ }}
        aria-hidden
      >
        <div className={overflowClass}>+{overflow}</div>
      </li>
    );
  }

  return (
    <div ref={wrapRef} className={`relative shrink-0 ${className}`}>
      <span className="sr-only">
        {members.length} {members.length === 1 ? "person" : "people"} in this group. Open menu for full list and
        invite link.
      </span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="group-members-popover"
        className="flex min-w-0 max-w-full items-center gap-0.5 rounded-lg py-1 pl-1 pr-1 outline-none transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-950 sm:gap-1 sm:pl-1.5 sm:pr-1.5"
      >
        <ul className="flex flex-row items-center pr-0.5" role="presentation">
          {triggerFaces.length > 0 ? (
            triggerFaces
          ) : (
            <li className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">No members</li>
          )}
        </ul>
        <IconChevronDownSm className="shrink-0 text-zinc-400 dark:text-zinc-500" />
      </button>

      {open ? (
        <div
          id="group-members-popover"
          role="dialog"
          aria-label="Group members"
          className="absolute right-0 top-[calc(100%+0.375rem)] z-[80] w-[min(17.5rem,calc(100vw-1.25rem))] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-700">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Group link</span>
            <button
              type="button"
              onClick={() => onCopyGroupLink()}
              className="flex shrink-0 items-center justify-center rounded-lg p-2 text-violet-600 transition hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/50"
              title={inviteCopied ? "Link copied" : "Copy site link to share"}
            >
              <IconGroupLink className="h-5 w-5" />
              <span className="sr-only">Copy group link</span>
            </button>
          </div>
          {inviteCopied ? (
            <p className="border-b border-zinc-100 px-3 py-2 text-xs font-medium text-emerald-600 dark:border-zinc-800 dark:text-emerald-400">
              Link copied — share it with friends
            </p>
          ) : null}
          <ul
            className="max-h-[min(50vh,18rem)] overflow-y-auto py-1.5"
            role="list"
          >
            {members.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">No members yet.</li>
            ) : (
              members.map((m) => {
                const initial = m.display_name.trim().slice(0, 1).toUpperCase() || "?";
                const you = m.id === currentMemberId;
                return (
                  <li key={m.id} className="flex items-center gap-2.5 px-3 py-2">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-zinc-800 dark:text-zinc-100"
                      style={{ backgroundColor: avatarBackground(m.display_name) }}
                    >
                      {initial}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-900 dark:text-zinc-100">
                      {m.display_name}
                      {you ? (
                        <span className="ml-1 font-normal text-zinc-500 dark:text-zinc-400">(You)</span>
                      ) : null}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
          {showLeaveGroup && onLeaveGroup ? (
            <div className="border-t border-zinc-200 p-2 dark:border-zinc-700">
              {leaveError ? (
                <p className="mb-2 px-2 text-xs text-red-600 dark:text-red-400" role="alert">
                  {leaveError}
                </p>
              ) : null}
              <button
                type="button"
                disabled={leaveBusy}
                onClick={() => {
                  void (async () => {
                    setLeaveError(null);
                    setLeaveBusy(true);
                    try {
                      await onLeaveGroup();
                      setOpen(false);
                    } catch (e) {
                      setLeaveError(e instanceof Error ? e.message : "Could not leave the group.");
                    } finally {
                      setLeaveBusy(false);
                    }
                  })();
                }}
                className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                {leaveBusy ? "Leaving…" : "Leave group"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ClubRoom({ memberId, initialDisplayName }: { memberId: string; initialDisplayName: string }) {
  const [panel, setPanel] = useState<MainPanel>("goals");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [progress, setProgress] = useState<ProgressReport | null>(null);
  const [groupMembers, setGroupMembers] = useState<MemberBrief[]>([]);
  const [inviteCopied, setInviteCopied] = useState(false);
  const inviteCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addGoalsOpen, setAddGoalsOpen] = useState(false);
  const [addGoalsKey, setAddGoalsKey] = useState(0);
  const [clearTracksMenuOpen, setClearTracksMenuOpen] = useState(false);
  const [clearTrackConfirm, setClearTrackConfirm] = useState<ClearFocusTrack | null>(null);
  const [clearTrackBusy, setClearTrackBusy] = useState(false);
  const [clearTrackError, setClearTrackError] = useState<string | null>(null);
  const clearTracksRootRef = useRef<HTMLDivElement>(null);
  const [myCircle, setMyCircle] = useState<MyCircleSummary | null>(null);
  const [circleHub, setCircleHub] = useState<MyCircleSummary | null>(null);

  const refreshMyCircle = useCallback(async () => {
    const res = await fetch("/api/circles/mine");
    if (!res.ok) return;
    const d = (await res.json()) as { circle: MyCircleSummary | null };
    setMyCircle(d.circle ?? null);
  }, []);

  const loadProgress = useCallback(async () => {
    const res = await fetch("/api/progress");
    if (!res.ok) return;
    const data = (await res.json()) as Partial<ProgressReport>;
    const rawMe = (data as { me?: ProgressMe | null }).me ?? null;
    const me: ProgressMe | null = rawMe
      ? {
          ...rawMe,
          memorized_surah_ids: rawMe.memorized_surah_ids ?? [],
          is_admin: rawMe.is_admin ?? false,
        }
      : null;
    setProgress({
      leaderboard: data.leaderboard ?? [],
      clubSeries: data.clubSeries ?? [],
      projection: data.projection ?? [],
      memberTrajectories: data.memberTrajectories ?? [],
      dashboard: data.dashboard ?? [],
      heatmap: data.heatmap ?? null,
      me,
    });
  }, []);

  const loadMembers = useCallback(async () => {
    const res = await fetch("/api/members");
    if (!res.ok) return;
    const data = (await res.json()) as { members?: MemberBrief[] };
    setGroupMembers(data.members ?? []);
  }, []);

  const handleLeaveCircle = useCallback(async () => {
    const res = await fetch("/api/circles/leave", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      throw new Error(data.error ?? "Could not leave the group.");
    }
    setCircleHub(null);
    await refreshMyCircle();
    await loadMembers();
    await loadProgress();
  }, [refreshMyCircle, loadMembers, loadProgress]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshMyCircle();
      if (cancelled) return;
      await Promise.all([loadProgress(), loadMembers()]);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshMyCircle, loadProgress, loadMembers]);

  useEffect(() => {
    if (panel === "users" && !progress?.me?.is_admin) {
      setPanel("goals");
    }
  }, [panel, progress?.me?.is_admin]);

  useEffect(() => {
    if (panel !== "circles") setCircleHub(null);
  }, [panel]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel("club-room")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "progress_events" },
        () => {
          void loadProgress();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "member_progress" },
        () => {
          void loadProgress();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "members" },
        () => {
          void loadMembers();
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "members" },
        () => {
          void loadMembers();
          void loadProgress();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "members" },
        () => {
          void loadProgress();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "member_goals" },
        () => {
          void loadProgress();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadProgress, loadMembers]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel("club-room-circle-roster")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "circle_members" },
        () => {
          void refreshMyCircle();
          void loadMembers();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshMyCircle, loadMembers]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileNavOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    function onChange() {
      if (mq.matches) setMobileNavOpen(false);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (mobileNavOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileNavOpen]);

  const fiveMonthChart = useMemo(() => {
    return buildFiveMonthMemorisationChart(
      progress?.memberTrajectories ?? [],
      "you",
      memberId ?? undefined
    );
  }, [progress?.memberTrajectories, memberId]);

  const trajectoryYouAvailable = useMemo(() => {
    if (!memberId || !progress?.memberTrajectories?.length) return false;
    return progress.memberTrajectories.some((t) => t.member_id === memberId);
  }, [memberId, progress?.memberTrajectories]);

  const addNewGoalsFullyBlocked = useMemo(() => {
    const g = progress?.me?.goals;
    if (!g) return false;
    return (
      g.memorizing.entries.length > 0 &&
      g.revising.entries.length > 0 &&
      g.reciting.entries.length > 0
    );
  }, [progress?.me?.goals]);

  useEffect(() => {
    if (!clearTracksMenuOpen) return;
    function onDoc(e: MouseEvent) {
      const el = clearTracksRootRef.current;
      if (el && !el.contains(e.target as Node)) setClearTracksMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [clearTracksMenuOpen]);

  useEffect(() => {
    if (panel !== "goals") setClearTracksMenuOpen(false);
  }, [panel]);

  async function confirmClearFocusTrack() {
    if (!clearTrackConfirm) return;
    setClearTrackBusy(true);
    setClearTrackError(null);
    try {
      const res = await fetch("/api/member-progress/clear-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track: clearTrackConfirm }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setClearTrackError(data.error ?? "Could not clear track.");
        return;
      }
      setClearTrackConfirm(null);
      await loadProgress();
    } finally {
      setClearTrackBusy(false);
    }
  }

  useEffect(() => {
    if (!clearTrackConfirm) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !clearTrackBusy) setClearTrackConfirm(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [clearTrackConfirm, clearTrackBusy]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  function copyInviteLink() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/` : "";
    void navigator.clipboard.writeText(url).then(() => {
      if (inviteCopyTimerRef.current) clearTimeout(inviteCopyTimerRef.current);
      setInviteCopied(true);
      inviteCopyTimerRef.current = setTimeout(() => setInviteCopied(false), 2200);
    });
  }

  useEffect(() => {
    return () => {
      if (inviteCopyTimerRef.current) clearTimeout(inviteCopyTimerRef.current);
    };
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#ececec] dark:bg-zinc-950">
      {/* One continuous rule under brand + current view */}
      <header className="relative z-30 flex shrink-0 border-b border-zinc-200 dark:border-zinc-800">
        <div className="hidden h-14 w-[220px] shrink-0 items-center border-r border-black/[0.06] bg-[#f4f4f4] pl-5 pr-3 dark:border-zinc-800 dark:bg-zinc-900 lg:flex">
          <ClubBrandTitle />
        </div>
        <div
          className={`flex min-w-0 flex-1 items-center justify-between gap-2 bg-white px-3 sm:gap-3 sm:px-5 dark:bg-zinc-950 ${
            circleHub ? "min-h-14 py-2" : "h-14"
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
            {circleHub ? (
              <>
                <button
                  type="button"
                  onClick={() => setCircleHub(null)}
                  className="shrink-0 rounded-lg p-2 text-zinc-600 outline-none transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-950"
                  aria-label="Back to Circles"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100 sm:text-lg">
                    {circleHub.name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {circleHub.member_count} member{circleHub.member_count === 1 ? "" : "s"}
                  </p>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen((o) => !o)}
                  className="shrink-0 rounded-lg p-2 text-zinc-600 outline-none transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-950 lg:hidden"
                  aria-expanded={mobileNavOpen}
                  aria-controls="club-mobile-nav"
                >
                  <IconMenu className="h-6 w-6" />
                  <span className="sr-only">
                    {mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
                  </span>
                </button>
                <div className="flex min-w-0 items-center gap-2 text-base font-semibold text-zinc-800 dark:text-zinc-200 sm:gap-2.5 sm:text-lg">
                  <span className="truncate">{panelTitle(panel)}</span>
                  {panel === "heatmap" ? <SurahMatrixHelpButton /> : null}
                </div>
              </>
            )}
          </div>
          {panel === "heatmap" ? (
            <div className="flex min-w-0 max-w-[min(52vw,13.5rem)] shrink-0 items-center justify-end pl-1 sm:max-w-none sm:pl-2">
              <MatrixTrackLegend className="text-right leading-tight" />
            </div>
          ) : panel === "stats" || panel === "focus" ? (
            <div className="w-8 shrink-0 sm:w-10" aria-hidden />
          ) : panel === "circles" && circleHub ? (
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
              <GroupMemberStack
                members={groupMembers}
                currentMemberId={memberId}
                onCopyGroupLink={copyInviteLink}
                inviteCopied={inviteCopied}
                showLeaveGroup
                onLeaveGroup={handleLeaveCircle}
              />
            </div>
          ) : panel === "circles" ? (
            <div className="w-8 shrink-0 sm:w-10" aria-hidden />
          ) : panel === "goals" ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={addNewGoalsFullyBlocked}
                title={
                  addNewGoalsFullyBlocked
                    ? "Complete your intention on this track before setting a new one."
                    : undefined
                }
                onClick={() => {
                  setAddGoalsKey((k) => k + 1);
                  setAddGoalsOpen(true);
                }}
                className="rounded-full border border-zinc-300 bg-zinc-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-600 dark:bg-zinc-100 dark:text-zinc-900 dark:disabled:opacity-40"
              >
                Set Intention
              </button>
              <div ref={clearTracksRootRef} className="relative">
                <button
                  type="button"
                  onClick={() => setClearTracksMenuOpen((o) => !o)}
                  aria-expanded={clearTracksMenuOpen}
                  aria-haspopup="menu"
                  className="rounded-full border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  Clear Tracks
                </button>
                {clearTracksMenuOpen ? (
                  <ul
                    role="menu"
                    className="absolute right-0 z-50 mt-1.5 min-w-[11rem] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg ring-1 ring-black/[0.04] dark:border-zinc-600 dark:bg-zinc-900 dark:ring-white/[0.06]"
                  >
                    <li role="presentation">
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
                        onClick={() => {
                          setClearTracksMenuOpen(false);
                          setClearTrackError(null);
                          setClearTrackConfirm("memorizing");
                        }}
                      >
                        <IconTrackMemorising className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        Memorising
                      </button>
                    </li>
                    <li role="presentation">
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
                        onClick={() => {
                          setClearTracksMenuOpen(false);
                          setClearTrackError(null);
                          setClearTrackConfirm("revising");
                        }}
                      >
                        <IconTrackRevising className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                        Revising
                      </button>
                    </li>
                    <li role="presentation">
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
                        onClick={() => {
                          setClearTracksMenuOpen(false);
                          setClearTrackError(null);
                          setClearTrackConfirm("reciting");
                        }}
                      >
                        <IconTrackReciting className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        Reciting
                      </button>
                    </li>
                  </ul>
                ) : null}
              </div>
            </div>
          ) : (
            <GroupMemberStack
              members={groupMembers}
              currentMemberId={memberId}
              onCopyGroupLink={copyInviteLink}
              inviteCopied={inviteCopied}
            />
          )}
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1">
        <aside
          className="hidden w-[220px] shrink-0 flex-col border-r border-black/[0.06] bg-[#f4f4f4] dark:border-zinc-800 dark:bg-zinc-900 lg:flex"
          aria-label="Club navigation"
        >
          <ClubSideNav
            panel={panel}
            onSelectPanel={setPanel}
            initialDisplayName={initialDisplayName}
            onLogout={logout}
            isAdmin={progress?.me?.is_admin ?? false}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-zinc-950">
        <div className="flex min-h-0 flex-1 flex-col">
          {panel === "circles" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
              {circleHub ? (
                <CircleHubPanel
                  circle={circleHub}
                  memberId={memberId}
                  initialDisplayName={initialDisplayName}
                  memorizedSurahIds={progress?.me?.memorized_surah_ids ?? []}
                  onProgressDataUpdated={() => void loadProgress()}
                />
              ) : (
                <MyCirclesListPanel
                  circle={myCircle}
                  onOpenCircle={(c) => setCircleHub(c)}
                  onCircleUpdated={() => {
                    void refreshMyCircle();
                    void loadMembers();
                    void loadProgress();
                  }}
                />
              )}
            </div>
          ) : null}

          {panel === "goals" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
              <MyGoalsPanel
                goals={progress?.me?.goals ?? null}
                statusLog={progress?.me?.statusLog ?? []}
                resumeWelcomeSetup={Boolean(
                  progress?.me && !progress.me.needsOnboarding && progress.me.goals == null
                )}
                onWelcomeDone={() => void loadProgress()}
                onGoalsUpdated={() => void loadProgress()}
              />
            </div>
          ) : null}

          {panel === "focus" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
              <div className="hidden shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 lg:block lg:px-5">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">Memorising</span>,{" "}
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">revising</span>, and{" "}
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">reciting</span> come from your circle&apos;s{" "}
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">Chat</span> tab (
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">I am…</span>). Surahs marked done from{" "}
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">Intention</span> show as{" "}
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">green with a checkmark</span>; other surahs are
                  in progress. The Surah matrix is view-only.{" "}
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">% Quran</span> reflects surahs you have memorised.
                </p>
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
                {(() => {
                  const myRow = progress?.dashboard.find((r) => r.member_id === memberId) ?? null;
                  if (!progress || progress.dashboard.length === 0 || !myRow) {
                    return (
                      <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        {!progress ? "Loading…" : "No progress data yet."}
                      </p>
                    );
                  }
                  const labelClass =
                    "flex w-[6.75rem] shrink-0 flex-col gap-1 text-xs font-semibold leading-tight text-zinc-700 dark:text-zinc-200 sm:w-36 sm:text-sm";
                  const rowClass =
                    "flex gap-3 border-b border-zinc-200 py-3 pl-3 pr-3 sm:gap-4 sm:pl-4 sm:pr-4 dark:border-zinc-800";
                  return (
                    <dl className="w-full max-w-none text-xs sm:text-sm">
                      <div className={rowClass}>
                        <dt className={labelClass}>
                          <span className="inline-flex items-center gap-1.5">
                            <IconTrackRevising className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                            Revising
                          </span>
                        </dt>
                        <dd className="min-w-0 flex-1">
                          <FocusTrackCombinedList
                            active={myRow.revising}
                            completed={myRow.completed_revising ?? []}
                          />
                        </dd>
                      </div>
                      <div className={rowClass}>
                        <dt className={labelClass}>
                          <span className="inline-flex items-center gap-1.5">
                            <IconTrackMemorising className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            Memorising
                          </span>
                        </dt>
                        <dd className="min-w-0 flex-1">
                          <FocusTrackCombinedList
                            active={myRow.memorising}
                            completed={myRow.completed_memorising ?? []}
                          />
                        </dd>
                      </div>
                      <div className={rowClass}>
                        <dt className={labelClass}>
                          <span className="inline-flex items-center gap-1.5">
                            <IconTrackReciting className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                            Reciting
                          </span>
                        </dt>
                        <dd className="min-w-0 flex-1">
                          <FocusTrackCombinedList
                            active={myRow.reciting}
                            completed={myRow.completed_reciting ?? []}
                          />
                        </dd>
                      </div>
                      <div className={rowClass}>
                        <dt className={labelClass}>
                          <span className="inline-flex items-center gap-1.5 pt-0.5">% Quran</span>
                        </dt>
                        <dd className="min-w-0 flex-1 tabular-nums text-base font-semibold text-zinc-900 dark:text-zinc-100 sm:pt-0.5">
                          {myRow.pct_quran}%
                        </dd>
                      </div>
                    </dl>
                  );
                })()}
              </div>
            </div>
          ) : null}

          {panel === "heatmap" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <SurahHeatmapPanel
                heatmap={progress?.heatmap ?? undefined}
                currentMemberId={memberId}
                myPctQuran={progress?.dashboard.find((r) => r.member_id === memberId)?.pct_quran ?? null}
                readOnly
              />
            </div>
          ) : null}

          {panel === "stats" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white dark:bg-zinc-950">
              <div className="mx-auto w-full max-w-4xl space-y-10 py-6 sm:py-8">
                <section className="min-w-0" aria-labelledby="stats-projections-heading">
                  <div className="px-5 sm:px-8">
                    <h2
                      id="stats-projections-heading"
                      className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
                    >
                      Memorisation over time
                    </h2>
                  </div>
                  <div className="mt-4">
                    <StatsMemorisationOverTimeStrip
                      chart={fiveMonthChart}
                      projectionScope="you"
                      trajectoryYouAvailable={trajectoryYouAvailable}
                      showEndpointInitials={false}
                    />
                  </div>
                </section>

                <section className="min-w-0 pb-4" aria-labelledby="stats-leaderboard-heading">
                  <div className="px-5 sm:px-8">
                    <h2
                      id="stats-leaderboard-heading"
                      className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
                    >
                      Leaderboard
                    </h2>
                  </div>
                  {progress && progress.leaderboard.length > 0 ? (
                    <div className="mx-auto mt-4 max-w-4xl px-5 sm:px-8">
                      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                        <table className="w-full min-w-[16rem] text-left text-sm">
                          <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-400 sm:text-xs">
                            <tr>
                              <th scope="col" className="px-4 py-3">
                                Name
                              </th>
                              <th scope="col" className="px-4 py-3 text-right tabular-nums">
                                % Quran
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {progress.leaderboard.map((r) => (
                              <tr key={r.member_id} className="bg-white dark:bg-zinc-950">
                                <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                                  {r.display_name}
                                  {r.member_id === memberId ? (
                                    <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">(You)</span>
                                  ) : null}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                                  {r.pct_quran}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>
            </div>
          ) : null}

          {panel === "users" && progress?.me?.is_admin ? (
            <AdminUsersPanel
              currentMemberId={memberId}
              onListChanged={() => {
                void loadMembers();
                void loadProgress();
              }}
            />
          ) : null}
        </div>
        </div>
      </div>

      {/* Mobile nav drawer + backdrop (lg+ uses persistent sidebar only) */}
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={mobileNavOpen ? 0 : -1}
        aria-hidden={!mobileNavOpen}
        className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 lg:hidden ${
          mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileNavOpen(false)}
      />
      <aside
        id="club-mobile-nav"
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(280px,88vw)] flex-col border-r border-black/[0.06] bg-[#f4f4f4] shadow-[4px_0_24px_-4px_rgba(0,0,0,0.2)] transition-transform duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-[4px_0_24px_-4px_rgba(0,0,0,0.5)] lg:hidden ${
          mobileNavOpen ? "translate-x-0" : "pointer-events-none -translate-x-full"
        }`}
        aria-hidden={!mobileNavOpen}
        aria-label="Club navigation"
      >
        <div className="shrink-0 border-b border-black/[0.06] py-4 pl-5 pr-3 dark:border-zinc-800">
          <ClubBrandTitle />
        </div>
        <ClubSideNav
          panel={panel}
          onSelectPanel={setPanel}
          initialDisplayName={initialDisplayName}
          onLogout={logout}
          closeOnNavigate
          onNavigate={() => setMobileNavOpen(false)}
          isAdmin={progress?.me?.is_admin ?? false}
        />
      </aside>

      {clearTrackConfirm ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              if (!clearTrackBusy) setClearTrackConfirm(null);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-track-dialog-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h2
              id="clear-track-dialog-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              {clearTrackModalLabels(clearTrackConfirm).question}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {clearTrackConfirm === "memorizing" ? (
                <>
                  This clears your memorising and revising activity on{" "}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Progress</span> (revising only
                  applies to surahs you’ve memorised) and removes every surah from your memorised list — your{" "}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">% Quran</span> goes back to{" "}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">0%</span>. Intention targets stay as they
                  are until you change them.
                </>
              ) : (
                <>
                  This removes your active and completed surahs for this track on{" "}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Progress</span>. It does not change
                  your % Quran or Intention targets.
                </>
              )}
            </p>
            {clearTrackError ? (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
                {clearTrackError}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                disabled={clearTrackBusy}
                onClick={() => setClearTrackConfirm(null)}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearTrackBusy}
                onClick={() => void confirmClearFocusTrack()}
                className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
              >
                {clearTrackBusy ? "Clearing…" : clearTrackModalLabels(clearTrackConfirm).action}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <OnboardingModal
        open={Boolean(progress?.me?.needsOnboarding)}
        onDone={() => void loadProgress()}
      />

      {addGoalsOpen && progress?.me ? (
        <AddGoalsModal
          key={addGoalsKey}
          memorizedSurahIds={progress.me.memorized_surah_ids}
          initialGoals={addGoalsModalInitialFromPayload(progress.me.goals)}
          onClose={() => setAddGoalsOpen(false)}
          onSaved={() => {
            setAddGoalsOpen(false);
            void loadProgress();
          }}
        />
      ) : null}
    </div>
  );
}
