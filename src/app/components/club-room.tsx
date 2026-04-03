"use client";

import Image from "next/image";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { StructuredProgressPicker } from "@/app/components/structured-progress-picker";
import {
  MatrixTrackLegend,
  SurahHeatmapPanel,
  SurahMatrixHelpButton,
  type HeatmapPayload,
} from "@/app/components/surah-heatmap-panel";
import { IconTrackMemorising, IconTrackReciting, IconTrackRevising } from "@/app/components/track-activity-icons";
import { MyGoalsPanel, type MyGoalsPayload, type StatusLogEntry } from "@/app/components/my-goals-panel";
import {
  AddGoalsModal,
  type AddGoalsModalInitial,
  OnboardingModal,
} from "@/app/components/onboarding-modal";
import type { MemberTrajectory } from "@/lib/progress-aggregate";

type MessageRow = {
  id: string;
  member_id: string | null;
  display_name: string;
  body: string;
  created_at: string;
};

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
  const bySurah = (a: DashboardSurahEntry, b: DashboardSurahEntry) => a.surahId - b.surahId;
  const items: { entry: DashboardSurahEntry; done: boolean }[] = [
    ...[...completed].sort(bySurah).map((e) => ({ entry: e, done: true })),
    ...[...activeOnly].sort(bySurah).map((e) => ({ entry: e, done: false })),
  ];

  if (items.length === 0) {
    return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  }

  const rowClass = (done: boolean) =>
    done
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-zinc-600 dark:text-zinc-400";

  return (
    <>
      <span className="flex flex-col gap-0.5 text-[10px] leading-tight lg:hidden">
        {items.map(({ entry: e, done }) => (
          <span key={e.surahId} className={`inline-flex min-w-0 max-w-full items-baseline gap-0.5 ${rowClass(done)}`}>
            <span className={FOCUS_BADGE_CLASS} title={`Juz ${e.juz}`}>
              {e.juz}
            </span>
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{e.name}</span>
            {done ? <FocusTrackCheckIcon className="mt-px shrink-0 text-emerald-600 dark:text-emerald-400" /> : null}
          </span>
        ))}
      </span>
      <span className="hidden text-sm leading-relaxed lg:inline">
        {items.map(({ entry: e, done }, i) => (
          <Fragment key={e.surahId}>
            {i > 0 ? <span className="text-zinc-500">, </span> : null}
            <span className={`inline-flex items-baseline gap-1 ${rowClass(done)}`}>
              <span className={FOCUS_BADGE_CLASS} title={`Juz ${e.juz}`}>
                {e.juz}
              </span>
              <span>{e.name}</span>
              {done ? <FocusTrackCheckIcon className="shrink-0 text-emerald-600 dark:text-emerald-400" /> : null}
            </span>
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

type MainPanel = "chat" | "focus" | "goals" | "heatmap" | "stats";

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
        width={24}
        height={24}
        sizes="24px"
        className="h-6 w-6 shrink-0 object-contain dark:opacity-90"
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
    id: "chat",
    label: "Your Suhbah",
    Icon: function IconChat({ className }: { className?: string }) {
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    },
  },
  {
    id: "focus",
    label: "Current focus",
    Icon: function IconFocus({ className }: { className?: string }) {
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    },
  },
  {
    id: "goals",
    label: "My goals",
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

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function avatarBackground(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 42% 88%)`;
}

function formatMessageBody(text: string): ReactNode {
  const parts = text.split(/(@[\w.-]+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="font-medium text-violet-600 dark:text-violet-400">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function panelTitle(p: MainPanel): string {
  switch (p) {
    case "chat":
      return "Your Suhbah";
    case "focus":
      return "Current focus";
    case "goals":
      return "My goals";
    case "heatmap":
      return "Surah matrix";
    case "stats":
      return "Stats";
    default:
      return "Club";
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
}: {
  panel: MainPanel;
  onSelectPanel: (p: MainPanel) => void;
  initialDisplayName: string;
  onLogout: () => void;
  closeOnNavigate?: boolean;
  onNavigate?: () => void;
}) {
  function pick(p: MainPanel) {
    onSelectPanel(p);
    if (closeOnNavigate) onNavigate?.();
  }

  return (
    <>
      <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 pt-3" aria-label="Club navigation">
        {NAV.map((item) => {
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

const TRAJECTORY_PALETTE = [
  "#047857",
  "#2563eb",
  "#b45309",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#4f46e5",
  "#65a30d",
  "#ea580c",
  "#0d9488",
  "#c026d3",
  "#ca8a04",
  "#16a34a",
  "#9333ea",
];

const SURAH_CHART_MAX = 114;
const SURAH_Y_TICKS = [0, 19, 38, 57, 76, 95, 114];

/** YYYY-MM-DD for “today” in UTC — matches stored progress day keys. */
function utcTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateToYm(ymd: string): string {
  return ymd.slice(0, 7);
}

/** Last calendar day of month `YYYY-MM` (UTC). */
function lastDayOfMonthYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of `YYYY-MM` from `fromYm` through `toYm`. */
function enumerateMonthsInclusive(fromYm: string, toYm: string): string[] {
  if (fromYm > toYm) return [toYm];
  const out: string[] = [];
  let y = Number(fromYm.slice(0, 4));
  let mo = Number(fromYm.slice(5, 7));
  const endY = Number(toYm.slice(0, 4));
  const endM = Number(toYm.slice(5, 7));
  if (!y || !mo || !endY || !endM) return [toYm];
  while (y < endY || (y === endY && mo <= endM)) {
    out.push(`${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}`);
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  return out;
}

/** `recorded` sorted by `date` ascending — cumulative surahs memorised on or before `ymd`. */
function surahsOnOrBefore(recorded: { date: string; surahs: number }[], ymd: string): number {
  let v = 0;
  for (const p of recorded) {
    if (p.date <= ymd) v = p.surahs;
    else break;
  }
  return v;
}

function formatMonthTickFromYm(ym: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`${ym}-15T00:00:00.000Z`));
  } catch {
    return ym;
  }
}

type TrajectoryLineSpec = {
  dataKey: string;
  name: string;
  stroke: string;
  dashed?: boolean;
};

/**
 * Equal-spaced months on the X axis; Y = cumulative completed memorisation (distinct surahs toward % Quran).
 */
function buildProjectionChart(
  trajs: MemberTrajectory[],
  scope: "you" | "all",
  selfId: string | undefined
): {
  rows: Record<string, string | number | undefined>[];
  lines: TrajectoryLineSpec[];
  /** `YYYY-MM` for each column (same order as `monthIndex`). */
  sortedDates: string[];
  xTicks: number[];
} {
  if (trajs.length === 0) return { rows: [], lines: [], sortedDates: [], xTicks: [] };

  const list =
    scope === "you"
      ? selfId
        ? trajs.filter((t) => t.member_id === selfId)
        : []
      : [...trajs].sort((a, b) => a.display_name.localeCompare(b.display_name));

  if (list.length === 0) return { rows: [], lines: [], sortedDates: [], xTicks: [] };

  const todayYm = utcTodayIso().slice(0, 7);
  let minYm = todayYm;
  for (const t of list) {
    for (const p of t.recorded) {
      const ym = dateToYm(p.date);
      if (ym < minYm) minYm = ym;
    }
  }
  const cap = new Date();
  cap.setUTCFullYear(cap.getUTCFullYear() - 3);
  const capYm = cap.toISOString().slice(0, 7);
  if (minYm < capYm) minYm = capYm;

  const months = enumerateMonthsInclusive(minYm, todayYm);
  if (months.length === 0) return { rows: [], lines: [], sortedDates: [], xTicks: [] };

  const rows: Record<string, string | number | undefined>[] = months.map((ym, monthIndex) => {
    const monthEnd = lastDayOfMonthYm(ym);
    const row: Record<string, string | number | undefined> = {
      monthIndex,
      monthYm: ym,
    };
    for (const t of list) {
      row[`s_${t.member_id}`] = surahsOnOrBefore(t.recorded, monthEnd);
    }
    return row;
  });

  const sortedIds = list.map((t) => t.member_id);
  const lines: TrajectoryLineSpec[] = list.map((t) => ({
    dataKey: `s_${t.member_id}`,
    name: t.display_name,
    stroke: TRAJECTORY_PALETTE[sortedIds.indexOf(t.member_id) % TRAJECTORY_PALETTE.length] ?? "#047857",
  }));

  const n = months.length;
  const step = n > 20 ? Math.ceil(n / 10) : n > 14 ? 2 : 1;
  const xTicks: number[] = [];
  for (let i = 0; i < n; i += step) xTicks.push(i);
  if (xTicks[xTicks.length - 1] !== n - 1) xTicks.push(n - 1);

  return { rows, lines, sortedDates: months, xTicks };
}

function ProjectionsScopeToggle({
  value,
  onChange,
  youDisabled,
}: {
  value: "you" | "all";
  onChange: (v: "you" | "all") => void;
  youDisabled?: boolean;
}) {
  return (
    <div
      className="flex shrink-0 items-center rounded-full border border-zinc-200/90 bg-zinc-100/80 p-0.5 dark:border-zinc-600 dark:bg-zinc-800/60"
      role="group"
      aria-label="Projection scope"
    >
      <button
        type="button"
        aria-pressed={value === "you"}
        disabled={youDisabled}
        onClick={() => onChange("you")}
        className={`rounded-full px-2.5 py-1 text-xs font-medium transition sm:px-3 sm:text-sm ${
          value === "you"
            ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
            : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        } disabled:cursor-not-allowed disabled:opacity-45`}
      >
        You
      </button>
      <button
        type="button"
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
        className={`rounded-full px-2.5 py-1 text-xs font-medium transition sm:px-3 sm:text-sm ${
          value === "all"
            ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
            : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        }`}
      >
        All
      </button>
    </div>
  );
}

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
  className = "",
}: {
  members: MemberBrief[];
  currentMemberId: string;
  onCopyGroupLink: () => void;
  inviteCopied: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
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
        </div>
      ) : null}
    </div>
  );
}

export function ClubRoom({ memberId, initialDisplayName }: { memberId: string; initialDisplayName: string }) {
  const [panel, setPanel] = useState<MainPanel>("chat");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendHint, setSendHint] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [progress, setProgress] = useState<ProgressReport | null>(null);
  const [groupMembers, setGroupMembers] = useState<MemberBrief[]>([]);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [projectionScope, setProjectionScope] = useState<"you" | "all">("you");
  const listRef = useRef<HTMLDivElement>(null);
  const inviteCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addGoalsOpen, setAddGoalsOpen] = useState(false);
  const [addGoalsKey, setAddGoalsKey] = useState(0);

  const loadMessages = useCallback(async () => {
    const res = await fetch("/api/messages");
    if (!res.ok) return;
    const data = (await res.json()) as { messages?: MessageRow[] };
    setMessages(data.messages ?? []);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMessages(true);
      await Promise.all([loadMessages(), loadProgress(), loadMembers()]);
      if (!cancelled) setLoadingMessages(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMessages, loadProgress, loadMembers]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel("club-room")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
        }
      )
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
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, panel]);

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

  const projectionChart = useMemo(() => {
    return buildProjectionChart(progress?.memberTrajectories ?? [], projectionScope, memberId ?? undefined);
  }, [progress?.memberTrajectories, projectionScope, memberId]);

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
    if (!trajectoryYouAvailable && projectionScope === "you") setProjectionScope("all");
  }, [trajectoryYouAvailable, projectionScope]);

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

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);
    setSendHint(null);
    const body = draft.trim();
    if (!body) return;
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: MessageRow;
    };
    if (!res.ok) {
      setSendError(data.error ?? "Could not send.");
      return;
    }
    if (data.message) {
      setMessages((prev) => (prev.some((m) => m.id === data.message!.id) ? prev : [...prev, data.message!]));
    }
    setDraft("");
  }

  function renderMessageBubble(m: MessageRow) {
    const mine = m.member_id === memberId;
    const label = mine ? "You" : m.display_name;
    const initial = (mine ? initialDisplayName : m.display_name).trim().slice(0, 1).toUpperCase() || "?";
    const bg = avatarBackground(mine ? initialDisplayName : m.display_name);
    const time = formatTime(m.created_at);

    const bubble = (
      <div className="inline-block max-w-[min(560px,calc(100vw-2rem))] rounded-2xl bg-[#F3F4F6] px-4 py-2.5 text-sm leading-relaxed text-zinc-900 sm:max-w-[min(560px,calc(100vw-220px-4rem))] dark:bg-zinc-800 dark:text-zinc-100">
        <p className="whitespace-pre-wrap">{formatMessageBody(m.body)}</p>
      </div>
    );

    const avatar = (
      <div className="relative h-10 w-10 shrink-0">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-zinc-700 dark:text-zinc-200"
          style={{ backgroundColor: bg }}
        >
          {initial}
        </div>
        <span
          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-950"
          aria-hidden
        />
      </div>
    );

    if (mine) {
      return (
        <div className="flex w-full justify-end">
          <div className="max-w-[min(640px,calc(100%-0.5rem))]">
            {/* Indent so “You · time” lines up with the bubble’s right edge (avatar sits past that). */}
            <div className="mb-1.5 pr-[3.25rem] text-right text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
              <span className="text-zinc-400"> · </span>
              <time className="tabular-nums text-zinc-400 dark:text-zinc-500" dateTime={m.created_at}>
                {time}
              </time>
            </div>
            <div className="flex flex-row-reverse items-end justify-end gap-3">
              {avatar}
              <div className="min-w-0 max-w-[min(560px,calc(100vw-2rem))] sm:max-w-[min(560px,calc(100vw-220px-4rem))]">
                {bubble}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full max-w-[min(640px,100%)]">
        {/* Spacer matches avatar width so name/time line up with the bubble, not the avatar */}
        <div className="mb-1.5 flex gap-3">
          <div className="w-10 shrink-0" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
            <span className="font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
            <span className="text-zinc-400">·</span>
            <time className="tabular-nums text-zinc-400 dark:text-zinc-500" dateTime={m.created_at}>
              {time}
            </time>
          </div>
        </div>
        <div className="flex flex-row items-end gap-3">
          {avatar}
          <div className="min-w-0 flex-1">{bubble}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#ececec] dark:bg-zinc-950">
      {/* One continuous rule under brand + current view */}
      <header className="relative z-30 flex shrink-0 border-b border-zinc-200 dark:border-zinc-800">
        <div className="hidden h-14 w-[220px] shrink-0 items-center border-r border-black/[0.06] bg-[#f4f4f4] pl-5 pr-3 dark:border-zinc-800 dark:bg-zinc-900 lg:flex">
          <ClubBrandTitle />
        </div>
        <div className="flex h-14 min-w-0 flex-1 items-center justify-between gap-2 bg-white px-3 sm:gap-3 sm:px-5 dark:bg-zinc-950">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
        <button
          type="button"
              onClick={() => setMobileNavOpen((o) => !o)}
              className="shrink-0 rounded-lg p-2 text-zinc-600 outline-none transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-950 lg:hidden"
              aria-expanded={mobileNavOpen}
              aria-controls="club-mobile-nav"
            >
              <IconMenu className="h-6 w-6" />
              <span className="sr-only">{mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}</span>
        </button>
            <div className="flex min-w-0 items-center gap-2 text-base font-semibold text-zinc-800 dark:text-zinc-200 sm:gap-2.5 sm:text-lg">
              <span className="truncate">{panelTitle(panel)}</span>
              {panel === "heatmap" ? <SurahMatrixHelpButton /> : null}
            </div>
          </div>
          {panel === "heatmap" ? (
            <div className="flex min-w-0 max-w-[min(52vw,13.5rem)] shrink-0 items-center justify-end pl-1 sm:max-w-none sm:pl-2">
              <MatrixTrackLegend className="text-right leading-tight" />
            </div>
          ) : panel === "stats" ? (
            <ProjectionsScopeToggle
              value={projectionScope}
              onChange={setProjectionScope}
              youDisabled={!trajectoryYouAvailable}
            />
          ) : panel === "goals" ? (
            <button
              type="button"
              disabled={addNewGoalsFullyBlocked}
              title={
                addNewGoalsFullyBlocked
                  ? "Complete your goals in this track to set a new one!"
                  : undefined
              }
              onClick={() => {
                setAddGoalsKey((k) => k + 1);
                setAddGoalsOpen(true);
              }}
              className="shrink-0 rounded-full border border-zinc-300 bg-zinc-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-600 dark:bg-zinc-100 dark:text-zinc-900 dark:disabled:opacity-40"
            >
              Add New Goals +
            </button>
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
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-zinc-950">
        <div className="flex min-h-0 flex-1 flex-col">
          {panel === "chat" ? (
            <>
          <div
            ref={listRef}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white dark:bg-zinc-950"
            aria-live="polite"
          >
                <div className="flex flex-col items-start gap-6 px-5 py-8">
            {loadingMessages ? (
              <p className="text-sm text-zinc-500">Loading messages…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-zinc-500">No messages yet. Say salam below.</p>
            ) : (
              messages.map((m) => (
                      <article key={m.id} className="w-full">
                        {renderMessageBubble(m)}
                </article>
              ))
            )}
          </div>
              </div>
              <div className="shrink-0 border-t border-zinc-200/80 bg-transparent p-4 dark:border-zinc-800 dark:bg-transparent">
            {sendError ? (
              <p className="mb-2 text-xs text-red-600 dark:text-red-400" role="alert">
                {sendError}
              </p>
            ) : null}
            {sendHint ? (
              <p className="mb-2 text-xs text-emerald-700 dark:text-emerald-400">{sendHint}</p>
            ) : null}
                <form
                  onSubmit={(e) => void sendMessage(e)}
                  className="flex flex-row items-center gap-1.5 rounded-2xl border border-zinc-200 bg-zinc-50/80 py-1.5 pl-2 pr-1.5 dark:border-zinc-700 dark:bg-zinc-800/50"
                >
                  <StructuredProgressPicker
                    onPosted={() => {
                      void loadMessages();
                      void loadProgress();
                      setSendHint("Progress posted — it appears in chat and Current focus.");
                    }}
                    onError={(msg) => setSendError(msg)}
                  />
                  <div
                    className="hidden h-6 w-px shrink-0 bg-zinc-200 sm:block dark:bg-zinc-600"
                    aria-hidden
                  />
                  <label className="sr-only" htmlFor="club-message-input">
                    Message
                  </label>
              <input
                    id="club-message-input"
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={4000}
                placeholder="Write a message…"
                    className="min-h-10 min-w-0 flex-1 border-0 bg-transparent py-2 pl-0.5 text-sm leading-normal text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              <button
                type="submit"
                    className="shrink-0 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                Send
              </button>
          </form>
              </div>
            </>
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
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white p-3 dark:bg-zinc-950 lg:p-6">
              <div className="mx-auto hidden w-full max-w-5xl shrink-0 lg:block">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">Memorising</span>,{" "}
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">revising</span>, and{" "}
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">reciting</span> come from the chat picker (
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">I am…</span>). Surahs marked done from{" "}
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">My goals</span> appear in the same column in{" "}
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">green with a checkmark</span>; other surahs are
                  in progress. The Surah matrix is view-only.{" "}
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">% Quran</span> reflects surahs you have memorised.
                </p>
              </div>
              <div className="mx-auto mt-0 w-full max-w-5xl min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/40 lg:mt-6 lg:rounded-xl">
                <table className="w-full min-w-[36rem] text-left text-xs lg:min-w-0 lg:text-sm">
                  <thead className="sticky top-0 bg-zinc-100/95 text-[10px] font-medium uppercase tracking-wide text-zinc-500 backdrop-blur-sm dark:bg-zinc-800/95 dark:text-zinc-400 lg:text-xs">
                    <tr>
                      <th className="px-2 py-2 lg:px-4 lg:py-3">Name</th>
                      <th className="px-2 py-2 lg:px-4 lg:py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <IconTrackRevising className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400 lg:h-4 lg:w-4" />
                          Revising
                        </span>
                      </th>
                      <th className="px-2 py-2 lg:px-4 lg:py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <IconTrackMemorising className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400 lg:h-4 lg:w-4" />
                          Memorising
                        </span>
                      </th>
                      <th className="px-2 py-2 lg:px-4 lg:py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <IconTrackReciting className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400 lg:h-4 lg:w-4" />
                          Reciting
                        </span>
                      </th>
                      <th className="px-2 py-2 text-right lg:px-4 lg:py-3">% Quran</th>
                  </tr>
                </thead>
                <tbody>
                    {!progress || progress.dashboard.length === 0 ? (
                    <tr>
                        <td colSpan={5} className="px-2 py-8 text-center text-zinc-500 lg:px-4 lg:py-10">
                          No members yet.
                      </td>
                    </tr>
                  ) : (
                      progress.dashboard.map((row) => (
                        <tr key={row.member_id} className="border-t border-zinc-200 dark:border-zinc-800">
                          <td className="px-2 py-1.5 align-top font-medium text-zinc-900 dark:text-zinc-100 lg:px-4 lg:py-3 lg:align-middle">
                            {row.display_name}
                          </td>
                          <td className="px-2 py-1.5 align-top lg:px-4 lg:py-3">
                            <FocusTrackCombinedList
                              active={row.revising}
                              completed={row.completed_revising ?? []}
                            />
                          </td>
                          <td className="px-2 py-1.5 align-top lg:px-4 lg:py-3">
                            <FocusTrackCombinedList
                              active={row.memorising}
                              completed={row.completed_memorising ?? []}
                            />
                          </td>
                          <td className="px-2 py-1.5 align-top lg:px-4 lg:py-3">
                            <FocusTrackCombinedList
                              active={row.reciting}
                              completed={row.completed_reciting ?? []}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right align-top tabular-nums text-zinc-700 dark:text-zinc-300 lg:px-4 lg:py-3 lg:align-middle">
                            {row.pct_quran}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-white dark:bg-zinc-950">
              <div className="mx-auto w-full max-w-4xl space-y-10 px-5 py-6 sm:px-8 sm:py-8">
                <section className="min-w-0" aria-labelledby="stats-projections-heading">
                  <h2
                    id="stats-projections-heading"
                    className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
                  >
                    Memorisation over time
                  </h2>
                  <p className="mt-2 hidden text-sm leading-relaxed text-zinc-500 lg:block dark:text-zinc-400">
                    Cumulative <span className="font-medium text-zinc-600 dark:text-zinc-300">completed</span> memorisation
                    (distinct surahs that count toward % Quran), by calendar month.{" "}
                    <span className="font-medium text-zinc-600 dark:text-zinc-300">You</span> is just your line;{" "}
                    <span className="font-medium text-zinc-600 dark:text-zinc-300">All</span> shows everyone. Months are
                    evenly spaced (0–114 surahs).
                  </p>
                  <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/30 p-3 dark:border-zinc-800 dark:bg-zinc-900/40 sm:p-4">
                    {projectionChart.rows.length === 0 ? (
                      <p className="px-1 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        {projectionScope === "you" && trajectoryYouAvailable === false
                          ? "We couldn’t find your member profile for this chart — try All."
                          : "Not enough data for a chart yet."}
                      </p>
                    ) : (
                      <div className="h-[min(50vh,22rem)] min-h-[200px] w-full outline-none [&_.recharts-wrapper]:outline-none">
                <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={projectionChart.rows}
                            margin={{ top: 12, right: 16, left: 4, bottom: 12 }}
                            className="outline-none"
                          >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
                            <XAxis
                              type="number"
                              dataKey="monthIndex"
                              domain={[0, Math.max(0, projectionChart.sortedDates.length - 1)]}
                              ticks={projectionChart.xTicks}
                              tick={{ fontSize: 11 }}
                              className="text-zinc-500"
                              allowDecimals={false}
                              tickFormatter={(i) => {
                                const ym = projectionChart.sortedDates[i as number];
                                return ym ? formatMonthTickFromYm(ym) : "";
                              }}
                            />
                            <YAxis
                              domain={[0, SURAH_CHART_MAX]}
                              ticks={SURAH_Y_TICKS}
                              allowDecimals={false}
                              width={40}
                              tick={{ fontSize: 10 }}
                              className="text-zinc-500"
                            />
                    <Tooltip
                              cursor={false}
                              formatter={(v) => {
                                const n = typeof v === "number" ? v : Number(v) || 0;
                                return [`${n} surah${n === 1 ? "" : "s"}`, ""];
                              }}
                              labelFormatter={(label) => {
                                const ym = projectionChart.sortedDates[Number(label)];
                                if (!ym) return String(label);
                                try {
                                  return new Intl.DateTimeFormat(undefined, {
                                    month: "long",
                                    year: "numeric",
                                    timeZone: "UTC",
                                  }).format(new Date(`${ym}-01T00:00:00.000Z`));
                                } catch {
                                  return ym;
                                }
                              }}
                      contentStyle={{
                        borderRadius: "0.75rem",
                        border: "1px solid rgb(228 228 231)",
                                fontSize: "11px",
                      }}
                    />
                            {projectionChart.lines.map((ln) => (
                    <Line
                                key={ln.dataKey}
                      type="monotone"
                                dataKey={ln.dataKey}
                                name={ln.name}
                                stroke={ln.stroke}
                                strokeWidth={projectionScope === "all" ? 1.75 : 2}
                                dot={projectionScope === "you" ? { r: 3 } : { r: 2 }}
                                activeDot={false}
                                connectNulls={false}
                              />
                            ))}
                  </LineChart>
                </ResponsiveContainer>
                      </div>
              )}
            </div>
                </section>

                <section className="min-w-0 pb-4" aria-labelledby="stats-leaderboard-heading">
                  <h2
                    id="stats-leaderboard-heading"
                    className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
                  >
                    Leaderboard
                  </h2>
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    % of the Quran memorised (whole surahs you’ve logged under Memorising, any order).
                  </p>
                  <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/30 p-3 dark:border-zinc-800 dark:bg-zinc-900/40 sm:p-4">
              {!progress || progress.leaderboard.length === 0 ? (
                      <p className="px-1 py-8 text-center text-sm text-zinc-500">No leaderboard data yet.</p>
              ) : (
                      <div className="h-[min(50vh,20rem)] min-h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={progress.leaderboard.map((r) => ({
                              name: r.display_name.length > 14 ? `${r.display_name.slice(0, 13)}…` : r.display_name,
                              pct: r.pct_quran,
                    }))}
                    layout="vertical"
                            margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} />
                            <Tooltip formatter={(v) => [`${typeof v === "number" ? v : Number(v) || 0}%`, "% Quran"]} />
                            <Bar dataKey="pct" name="% Quran" fill="#047857" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                      </div>
              )}
            </div>
                  {progress && progress.leaderboard.length > 0 ? (
                    <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
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
                  ) : null}
                </section>
      </div>
            </div>
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
        />
      </aside>

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
