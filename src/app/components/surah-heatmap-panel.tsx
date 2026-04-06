"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { surahName } from "@/lib/quran";
import {
  IconTrackMemorising,
  IconTrackReciting,
  IconTrackRevising,
  TrackActivityIcon,
} from "@/app/components/track-activity-icons";

type HeatmapActivity = "memorizing" | "revising" | "reciting";

export type HeatmapRow = {
  member_id: string;
  display_name: string;
  /** Length 115; indices 1–114 hold stacked activities for that surah. */
  surahs: (HeatmapActivity[] | null)[];
};

export type HeatmapPayload = {
  rows: HeatmapRow[];
  summary: {
    membersMemorising: number;
    membersRevising: number;
    membersReciting: number;
    memberCount: number;
  };
};

type MatrixTrack = HeatmapActivity;

const SURAH_RANGE = Array.from({ length: 114 }, (_, i) => i + 1);

function countSurahsForActivity(row: HeatmapRow | undefined, activity: HeatmapActivity): number {
  if (!row?.surahs) return 0;
  let c = 0;
  for (let i = 1; i <= 114; i++) {
    if (row.surahs[i]?.includes(activity)) c++;
  }
  return c;
}

const TRACK_OPTIONS: { value: MatrixTrack; label: string }[] = [
  { value: "memorizing", label: "Memorising" },
  { value: "revising", label: "Revising" },
  { value: "reciting", label: "Reciting" },
];

const CHROME_ACT_ORDER: HeatmapActivity[] = ["memorizing", "revising", "reciting"];

function IconChevronDown({ className }: { className?: string }) {
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

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconInfo({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 16v-4M12 8h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Info popover for the matrix — lives in the club header next to “Surah matrix”. */
export function SurahMatrixHelpButton({ className = "" }: { className?: string }) {
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

  return (
    <div ref={wrapRef} className={`relative shrink-0 ${className}`}>
      {/* <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full p-1 text-zinc-400 outline-none transition hover:bg-zinc-100 hover:text-zinc-600 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-950"
        aria-expanded={open}
        aria-controls="surah-matrix-help"
        id="surah-matrix-help-trigger"
      >
        <IconInfo className="h-6 w-6" />
        <span className="sr-only">How the Surah matrix works</span>
      </button> */}
      {open ? (
        <div
          id="surah-matrix-help"
          role="region"
          aria-labelledby="surah-matrix-help-trigger"
          className="absolute left-0 top-[calc(100%+0.375rem)] z-[60] w-[min(20rem,calc(100vw-1.25rem))] rounded-lg border border-zinc-200 bg-white p-2.5 text-left text-xs leading-snug text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 sm:w-[min(22rem,calc(100vw-2rem))] sm:rounded-xl sm:p-3 sm:text-sm"
        >
          <p>
            Each row is a surah. Under <span className="font-medium text-zinc-800 dark:text-zinc-100">Name</span>, badges show
            members on that surah; small circles are memorising, revising, or reciting. Tap{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-100">your</span> badge (or the{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-100">+</span> if you have no tracks yet) to select, pick a
            track, then <span className="font-medium text-zinc-800 dark:text-zinc-100">Save</span> or{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-100">Remove</span>. Use{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-100">∧∨</span> next to Surah to reverse order.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** ∧ / ∨ — click toggles surah list between 1→114 and 114→1. */
function SurahOrderToggle({
  surahOrderDesc,
  onToggle,
  size = "sm",
}: {
  surahOrderDesc: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
}) {
  const sz = size === "md" ? "px-1 py-0.5 text-[11px]" : "px-0.5 py-px text-[10px] sm:text-[11px]";
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex shrink-0 flex-col items-center justify-center rounded-md border border-zinc-200/80 bg-zinc-50/90 leading-none text-zinc-500 transition hover:bg-zinc-100/90 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-600/70 dark:bg-zinc-900/80 dark:text-zinc-400 dark:hover:bg-zinc-800/90 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-500 ${sz}`}
      aria-label={
        surahOrderDesc
          ? "Surahs newest first (114 to 1). Switch to Al-Fātiḥah first."
          : "Surahs Al-Fātiḥah first (1 to 114). Switch to An-Nas first."
      }
      title={surahOrderDesc ? "Order: 114 → 1" : "Order: 1 → 114"}
    >
      <span
        className={`font-bold ${!surahOrderDesc ? "text-zinc-900 dark:text-zinc-100" : "opacity-45"}`}
        aria-hidden
      >
        ∧
      </span>
      <span
        className={`font-bold leading-none ${surahOrderDesc ? "text-zinc-900 dark:text-zinc-100" : "opacity-45"}`}
        aria-hidden
      >
        ∨
      </span>
    </button>
  );
}

function MatrixFloatingBar({
  matrixTrack,
  setMatrixTrack,
  selectedCount,
  pending,
  onSave,
  onRemove,
  errorMsg,
}: {
  matrixTrack: MatrixTrack;
  setMatrixTrack: (t: MatrixTrack) => void;
  selectedCount: number;
  pending: false | "add" | "remove";
  onSave: () => void;
  /** Remove selected surahs from the track chosen in the dropdown (server sync). */
  onRemove: () => void;
  errorMsg: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const trackWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!trackWrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const currentLabel = TRACK_OPTIONS.find((o) => o.value === matrixTrack)?.label ?? "";
  const trackUi = MATRIX_TRACK_UI[matrixTrack];

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] flex justify-center px-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:px-4 lg:pt-[max(0.75rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-label="Matrix track actions"
    >
      <div className="pointer-events-auto mt-10 flex max-w-[calc(100vw-1rem)] flex-col items-center gap-1.5 sm:mt-12 lg:mt-14 lg:max-w-[calc(100vw-2rem)] lg:gap-2">
        <div className="matrix-save-bar-enter flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1.5 rounded-full border border-zinc-200/90 bg-white py-1.5 pl-2 pr-1.5 shadow-2xl ring-1 ring-black/5 dark:border-zinc-300 dark:bg-white dark:ring-black/10 lg:gap-x-2 lg:gap-y-2 lg:py-2 lg:pl-3 lg:pr-2">
          <div ref={trackWrapRef} className="relative flex items-center gap-1 lg:gap-1.5">
            <span
              className="shrink-0 text-[10px] font-medium text-zinc-800 lg:text-xs"
              id="matrix-track-label"
            >
              Track
            </span>
            <button
              type="button"
              className={`flex min-w-[5.5rem] items-center justify-between gap-1 rounded-full border py-1 pl-2 pr-1.5 text-left text-[10px] font-medium text-zinc-900 outline-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 lg:min-w-[6.75rem] lg:gap-1.5 lg:py-1.5 lg:pl-2.5 lg:pr-2 lg:text-xs ${trackUi.focusRing} ${menuOpen ? trackUi.triggerOpen : trackUi.triggerIdle}`}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              aria-labelledby="matrix-track-label"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span className="truncate">{currentLabel}</span>
              <IconChevronDown className="shrink-0 text-zinc-500" />
            </button>
            {menuOpen ? (
              <ul
                role="listbox"
                aria-label="Track"
                className="absolute left-0 top-[calc(100%+0.375rem)] z-[250] min-w-[11rem] overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900 py-1 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
              >
                {TRACK_OPTIONS.map((opt) => {
                  const active = matrixTrack === opt.value;
                  const optCheck = MATRIX_TRACK_UI[opt.value].menuCheck;
                  return (
                    <li key={opt.value} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition ${
                          active
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-200 hover:bg-zinc-800/80 hover:text-white"
                        }`}
                        onClick={() => {
                          setMatrixTrack(opt.value);
                          setMenuOpen(false);
                        }}
                      >
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${optCheck}`}>
                          {active ? <IconCheck className={optCheck} /> : null}
                        </span>
                        {opt.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          <span className="hidden h-4 w-px shrink-0 bg-zinc-200 sm:block lg:h-5" aria-hidden />
          <span className="text-[10px] tabular-nums text-zinc-500 lg:text-xs">{selectedCount} selected</span>
          <button
            type="button"
            onClick={onSave}
            disabled={pending !== false || selectedCount === 0}
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 lg:px-3.5 lg:py-1.5 lg:text-xs ${trackUi.save} ${trackUi.saveHover}`}
          >
            {pending === "add" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={pending !== false || selectedCount === 0}
            className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-300/60 dark:bg-white dark:text-red-700 dark:hover:bg-red-50 lg:px-3 lg:py-1.5 lg:text-xs"
          >
            {pending === "remove" ? "Removing…" : "Remove"}
          </button>
        </div>
        {errorMsg ? (
          <p
            className="max-w-[min(18rem,calc(100vw-1rem))] rounded-lg border border-red-200 bg-white px-3 py-1.5 text-center text-[10px] leading-snug text-red-600 shadow-lg dark:border-red-300 dark:bg-white sm:max-w-md sm:rounded-xl sm:px-4 sm:py-2 sm:text-xs"
            role="alert"
          >
            {errorMsg}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const TRACK_TITLE: Record<HeatmapActivity, string> = {
  memorizing: "Memorising",
  revising: "Revising",
  reciting: "Reciting",
};

/** Track icon key — shared by club toolbar (heatmap) and help copy. */
export function MatrixTrackLegend({
  className = "",
  variant = "tracks",
}: {
  className?: string;
  /** `memorization` — personal matrix: memorised vs in-progress only. */
  variant?: "tracks" | "memorization";
}) {
  if (variant === "memorization") {
    return (
      <p
        className={`flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[10px] leading-tight text-zinc-600 dark:text-zinc-400 sm:text-xs ${className}`}
      >
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-emerald-600" aria-hidden />
          <span>Memorised</span>
        </span>
        <span className="text-zinc-400 dark:text-zinc-600" aria-hidden>
          ·
        </span>
        <span className="inline-flex items-center gap-1">
          <IconTrackMemorising className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>In progress</span>
        </span>
      </p>
    );
  }
  return (
    <p className={`flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs leading-snug text-zinc-600 dark:text-zinc-400 sm:text-sm ${className}`}>
      <span className="inline-flex items-center gap-1">
        <IconTrackMemorising className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span>memorising</span>
      </span>
      <span className="text-zinc-400 dark:text-zinc-600" aria-hidden>
        ·
      </span>
      <span className="inline-flex items-center gap-1">
        <IconTrackRevising className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <span>revising</span>
      </span>
      <span className="text-zinc-400 dark:text-zinc-600" aria-hidden>
        ·
      </span>
      <span className="inline-flex items-center gap-1">
        <IconTrackReciting className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>reciting</span>
      </span>
    </p>
  );
}

function orderedActivitiesForCell(activities: HeatmapActivity[]): HeatmapActivity[] {
  return CHROME_ACT_ORDER.filter((a) => activities.includes(a));
}

/** Small filled circles behind track glyphs on name badges. */
const BADGE_TRACK_CIRCLE: Record<HeatmapActivity, string> = {
  memorizing:
    "bg-emerald-500/25 text-emerald-800 ring-emerald-500/35 dark:bg-emerald-500/20 dark:text-emerald-100 dark:ring-emerald-400/40",
  revising:
    "bg-indigo-500/25 text-indigo-800 ring-indigo-500/35 dark:bg-indigo-500/20 dark:text-indigo-100 dark:ring-indigo-400/40",
  reciting:
    "bg-amber-500/25 text-amber-900 ring-amber-500/40 dark:bg-amber-500/20 dark:text-amber-100 dark:ring-amber-400/45",
};

function membersActiveOnSurah(
  orderedRows: HeatmapRow[],
  surahId: number,
  currentMemberId: string | null | undefined
): { row: HeatmapRow; activities: HeatmapActivity[] }[] {
  const list: { row: HeatmapRow; activities: HeatmapActivity[] }[] = [];
  for (const row of orderedRows) {
    const raw = row.surahs[surahId];
    if (raw?.length) {
      list.push({ row, activities: orderedActivitiesForCell(raw) });
    }
  }
  list.sort((a, b) => {
    const aYou = currentMemberId && a.row.member_id === currentMemberId ? 0 : 1;
    const bYou = currentMemberId && b.row.member_id === currentMemberId ? 0 : 1;
    if (aYou !== bYou) return aYou - bYou;
    return a.row.display_name.localeCompare(b.row.display_name);
  });
  return list;
}

function MemberSurahBadge({
  displayName,
  isYou,
  activities,
  interactive,
  selected,
  selectionTrack,
  onToggle,
}: {
  displayName: string;
  isYou: boolean;
  activities: HeatmapActivity[];
  interactive: boolean;
  selected: boolean;
  selectionTrack: MatrixTrack;
  onToggle: () => void;
}) {
  const sel = MATRIX_TRACK_UI[selectionTrack];
  const trackNamesText = activities.map((a) => TRACK_TITLE[a]).join(" · ");
  const iconRow = (
    <span className="flex shrink-0 flex-row items-center -space-x-1" aria-hidden>
      {activities.map((a) => (
        <span
          key={a}
          title={TRACK_TITLE[a]}
          className={`inline-flex h-[1.25rem] w-[1.25rem] items-center justify-center rounded-full ring-2 ring-white dark:ring-zinc-950 sm:h-6 sm:w-6 ${BADGE_TRACK_CIRCLE[a]}`}
        >
          <TrackActivityIcon activity={a} className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        </span>
      ))}
    </span>
  );
  const label = (
    <span className="min-w-0 text-left text-xs font-medium leading-snug text-zinc-800 [overflow-wrap:anywhere] dark:text-zinc-200">
      {isYou ? trackNamesText : displayName}
    </span>
  );
  const a11yActionLabel = isYou
    ? `Your ${trackNamesText} on this surah — tap to select for Save or Remove`
    : `${displayName} on this surah — tap to select for Save or Remove`;

  const base =
    "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 sm:gap-2 sm:px-3 sm:py-1.5";

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        aria-label={a11yActionLabel}
        className={`${base} text-left outline-none transition hover:opacity-95 ${
          selected
            ? `${sel.cellSelectedFilled} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-zinc-950`
            : "border-zinc-200/90 bg-zinc-50/95 dark:border-zinc-600/80 dark:bg-zinc-900/90"
        } ${sel.focusRing} focus-visible:ring-2 focus-visible:ring-offset-2`}
      >
        {iconRow}
        {label}
      </button>
    );
  }

  return (
    <div
      className={`${base} border-zinc-200/80 bg-zinc-50/90 dark:border-zinc-700/70 dark:bg-zinc-900/85`}
      title={isYou ? trackNamesText : `${displayName} · ${trackNamesText}`}
    >
      {iconRow}
      {label}
    </div>
  );
}

function IconCheckWhite({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Personal Surah matrix: memorised (green + check) vs memorising (border + in progress) vs not started (—). Revising/reciting are not shown. */
function PersonalMemorizationCell({
  memorized,
  memorizing,
  surahLabel,
}: {
  memorized: boolean;
  memorizing: boolean;
  /** e.g. `1. Al-Fātiḥah` — shown inside the box on the left. */
  surahLabel: string;
}) {
  const nameClass =
    "min-w-0 flex-1 text-left text-sm font-semibold leading-snug [overflow-wrap:anywhere] sm:text-[15px]";

  if (memorized) {
    return (
      <div className="flex min-h-[2.25rem] w-full items-center justify-between gap-3">
        <span className={`${nameClass} text-white`}>{surahLabel}</span>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20"
          aria-hidden
        >
          <IconCheckWhite className="text-white" />
        </span>
      </div>
    );
  }
  if (memorizing) {
    return (
      <div className="flex min-h-[2.25rem] w-full items-center justify-between gap-3">
        <span className={`${nameClass} text-zinc-800 dark:text-zinc-100`}>{surahLabel}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-xs font-medium text-emerald-800 dark:text-emerald-200">In progress</span>
          <IconTrackMemorising className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        </span>
      </div>
    );
  }
  return (
    <div className="flex min-h-[2.25rem] w-full items-center justify-between gap-3">
      <span className={`${nameClass} font-medium text-zinc-700 dark:text-zinc-300`}>{surahLabel}</span>
      <span className="shrink-0 text-sm text-zinc-400 dark:text-zinc-600">—</span>
    </div>
  );
}

/** Selection highlight + floating bar accents for the active matrix track (default: memorising → green). */
const MATRIX_TRACK_UI: Record<
  MatrixTrack,
  {
    /** Saved cell with badge(s), not selected — matches M / R / C hue. */
    cellSavedFilled: string;
    cellSelectedEmpty: string;
    cellSelectedFilled: string;
    focusRing: string;
    save: string;
    saveHover: string;
    triggerIdle: string;
    triggerOpen: string;
    menuCheck: string;
  }
> = {
  memorizing: {
    cellSavedFilled:
      "bg-emerald-100/95 ring-emerald-400/55 dark:bg-emerald-950/48 dark:ring-emerald-600/45",
    cellSelectedEmpty:
      "bg-emerald-200/90 ring-2 ring-emerald-500 dark:bg-emerald-900/45 dark:ring-emerald-400",
    cellSelectedFilled:
      "bg-emerald-200/95 ring-2 ring-emerald-500 dark:bg-emerald-900/55 dark:ring-emerald-400",
    focusRing: "focus-visible:ring-emerald-500",
    save: "bg-emerald-600",
    saveHover: "hover:bg-emerald-700",
    triggerIdle: "border-emerald-300 bg-emerald-50/80 hover:bg-emerald-50",
    triggerOpen: "border-emerald-500 ring-2 ring-emerald-400/45",
    menuCheck: "text-emerald-400",
  },
  revising: {
    cellSavedFilled:
      "bg-indigo-100/95 ring-indigo-400/55 dark:bg-indigo-950/45 dark:ring-indigo-500/45",
    cellSelectedEmpty:
      "bg-indigo-200/90 ring-2 ring-indigo-500 dark:bg-indigo-900/45 dark:ring-indigo-400",
    cellSelectedFilled:
      "bg-indigo-200/95 ring-2 ring-indigo-500 dark:bg-indigo-900/55 dark:ring-indigo-400",
    focusRing: "focus-visible:ring-indigo-500",
    save: "bg-indigo-600",
    saveHover: "hover:bg-indigo-700",
    triggerIdle: "border-indigo-300 bg-indigo-50/80 hover:bg-indigo-50",
    triggerOpen: "border-indigo-500 ring-2 ring-indigo-400/45",
    menuCheck: "text-indigo-400",
  },
  reciting: {
    cellSavedFilled:
      "bg-amber-100/95 ring-amber-400/60 dark:bg-amber-950/40 dark:ring-amber-600/45",
    cellSelectedEmpty:
      "bg-amber-200/90 ring-2 ring-amber-500 dark:bg-amber-950/45 dark:ring-amber-400",
    cellSelectedFilled:
      "bg-amber-200/95 ring-2 ring-amber-500 dark:bg-amber-950/50 dark:ring-amber-400",
    focusRing: "focus-visible:ring-amber-500",
    save: "bg-amber-500",
    saveHover: "hover:bg-amber-600",
    triggerIdle: "border-amber-300 bg-amber-50/90 hover:bg-amber-50",
    triggerOpen: "border-amber-500 ring-2 ring-amber-400/45",
    menuCheck: "text-amber-400",
  },
};

export function SurahHeatmapPanel({
  heatmap,
  currentMemberId,
  onSaved,
  myPctQuran,
  readOnly = false,
  personalMemorizationOnly = false,
  memorizedSurahIds,
}: {
  heatmap: HeatmapPayload | null | undefined;
  currentMemberId: string | null | undefined;
  onSaved?: () => void;
  /** Your % Quran (memorised surahs), from dashboard — optional. */
  myPctQuran?: number | null;
  /** When true, matrix is display-only (no selection / save). */
  readOnly?: boolean;
  /**
   * Your matrix only: memorised (% Quran) = green + check; active memorisation track = bordered “In progress”.
   * Revising/reciting are not shown in cells.
   */
  personalMemorizationOnly?: boolean;
  /** Required for `personalMemorizationOnly` — surahs counted as fully memorised. */
  memorizedSurahIds?: number[];
}) {
  const rows = heatmap?.rows ?? [];

  const memorizedSet = useMemo(
    () => new Set((memorizedSurahIds ?? []).filter((n) => n >= 1 && n <= 114)),
    [memorizedSurahIds]
  );

  /** Current user first; everyone else keeps API order (name-sorted). */
  const orderedRows = useMemo(() => {
    if (!currentMemberId) return rows;
    const you = rows.find((r) => r.member_id === currentMemberId);
    if (!you) return rows;
    return [you, ...rows.filter((r) => r.member_id !== currentMemberId)];
  }, [rows, currentMemberId]);

  const [selectedSurahs, setSelectedSurahs] = useState<Set<number>>(() => new Set());
  const [matrixTrack, setMatrixTrack] = useState<MatrixTrack>("memorizing");
  const [matrixPending, setMatrixPending] = useState<false | "add" | "remove">(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [surahOrderDesc, setSurahOrderDesc] = useState(false);

  const surahOrderList = useMemo(
    () => (surahOrderDesc ? [...SURAH_RANGE].reverse() : SURAH_RANGE),
    [surahOrderDesc]
  );

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const empty = rows.length === 0 && !(personalMemorizationOnly && currentMemberId);
  const showFloatingBar = Boolean(currentMemberId && selectedSurahs.size > 0);

  const clearSelection = useCallback(() => {
    setSelectedSurahs(new Set());
    setErrorMsg(null);
  }, []);

  const toggleSurah = useCallback((n: number) => {
    setSelectedSurahs((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
    setErrorMsg(null);
  }, []);

  const saveMatrix = useCallback(async () => {
    if (!currentMemberId || selectedSurahs.size === 0) return;
    setMatrixPending("add");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/member-progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: matrixTrack,
          action: "add",
          surah_ids: [...selectedSurahs].sort((a, b) => a - b),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? "Could not save");
        return;
      }
      clearSelection();
      onSaved?.();
    } finally {
      setMatrixPending(false);
    }
  }, [currentMemberId, matrixTrack, selectedSurahs, clearSelection, onSaved]);

  const removeMatrix = useCallback(async () => {
    if (!currentMemberId || selectedSurahs.size === 0) return;
    setMatrixPending("remove");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/member-progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: matrixTrack,
          action: "remove",
          surah_ids: [...selectedSurahs].sort((a, b) => a - b),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? "Could not remove");
        return;
      }
      clearSelection();
      onSaved?.();
    } finally {
      setMatrixPending(false);
    }
  }, [currentMemberId, matrixTrack, selectedSurahs, clearSelection, onSaved]);

  const myRow = useMemo(
    () => (currentMemberId ? rows.find((r) => r.member_id === currentMemberId) : undefined),
    [rows, currentMemberId]
  );

  const myMem = countSurahsForActivity(myRow, "memorizing");
  const myRev = countSurahsForActivity(myRow, "revising");
  const myRec = countSurahsForActivity(myRow, "reciting");

  const floatingEditor =
    portalReady && typeof document !== "undefined" && showFloatingBar
      ? createPortal(
          <MatrixFloatingBar
            matrixTrack={matrixTrack}
            setMatrixTrack={setMatrixTrack}
            selectedCount={selectedSurahs.size}
            pending={matrixPending}
            onSave={() => void saveMatrix()}
            onRemove={() => void removeMatrix()}
            errorMsg={errorMsg}
          />,
          document.body
        )
      : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-0 overflow-hidden bg-white p-0 dark:bg-zinc-950 sm:gap-4 sm:p-2 lg:flex-row lg:gap-6 lg:p-6">
      {floatingEditor}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
          {empty ? (
            <p className="p-4 text-xs text-zinc-500 sm:p-6 sm:text-sm">No members yet.</p>
          ) : (
            <>
              <div className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-zinc-200/80 bg-white/95 px-3 py-2.5 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95 sm:px-4">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400 sm:text-[10px] dark:text-zinc-500">
                  Surah
                </span>
                <SurahOrderToggle
                  surahOrderDesc={surahOrderDesc}
                  onToggle={() => setSurahOrderDesc((d) => !d)}
                  size="md"
                />
              </div>
              <div className="w-full space-y-3 px-3 py-3 sm:space-y-3.5 sm:px-4 sm:py-4">
                {surahOrderList.map((n) => {
                  const title = `${n}. ${surahName(n)}`;
                  const here = membersActiveOnSurah(orderedRows, n, currentMemberId);
                  const youHere =
                    currentMemberId != null && here.some((h) => h.row.member_id === currentMemberId);
                  const canPick = Boolean(currentMemberId && !readOnly);
                  const selUi = MATRIX_TRACK_UI[matrixTrack];
                  const emptySelected = canPick && !youHere && selectedSurahs.has(n);

                  const personalCell =
                    personalMemorizationOnly && currentMemberId != null;
                  const memorized = memorizedSet.has(n);
                  const memorizing = !memorized && Boolean(myRow?.surahs[n]?.includes("memorizing"));

                  const boxClass = personalCell
                    ? memorized
                      ? "w-full rounded-xl border border-emerald-700/25 bg-emerald-600 px-3 py-2.5 shadow-sm dark:border-emerald-500/35 dark:bg-emerald-600 sm:px-3.5 sm:py-3"
                      : memorizing
                        ? "w-full rounded-xl border-2 border-emerald-300 bg-white px-3 py-2.5 shadow-sm dark:border-emerald-500/55 dark:bg-zinc-900 sm:px-3.5 sm:py-3"
                        : "w-full rounded-xl border border-zinc-200/90 bg-zinc-50/95 px-3 py-2.5 shadow-sm dark:border-zinc-700/80 dark:bg-zinc-900/90 sm:px-3.5 sm:py-3"
                    : "w-full rounded-xl border border-zinc-200/90 bg-zinc-50/95 px-3 py-2.5 shadow-sm dark:border-zinc-700/80 dark:bg-zinc-900/90 sm:px-3.5 sm:py-3";

                  return (
                    <section
                      key={n}
                      className="w-full"
                      {...(personalCell
                        ? { "aria-label": title }
                        : { "aria-labelledby": `surah-matrix-${n}-label` })}
                    >
                      {!personalCell ? (
                        <div className="mb-1 flex justify-end pr-0.5">
                          <h3
                            id={`surah-matrix-${n}-label`}
                            className="max-w-[85%] text-right text-[10px] font-medium leading-snug text-zinc-500 sm:text-[11px] dark:text-zinc-400"
                          >
                            <span className="tabular-nums text-zinc-400 dark:text-zinc-500">{n}.</span>{" "}
                            {surahName(n)}
                          </h3>
                        </div>
                      ) : null}
                      <div className={boxClass}>
                        {personalCell ? (
                          <PersonalMemorizationCell
                            memorized={memorized}
                            memorizing={memorizing}
                            surahLabel={title}
                          />
                        ) : (
                          <div className="flex min-h-[2.25rem] flex-wrap items-center gap-2">
                            {here.map(({ row, activities }) => {
                              const isYou = currentMemberId != null && row.member_id === currentMemberId;
                              return (
                                <MemberSurahBadge
                                  key={row.member_id}
                                  displayName={row.display_name}
                                  isYou={isYou}
                                  activities={activities}
                                  interactive={isYou && !readOnly}
                                  selected={isYou && !readOnly && selectedSurahs.has(n)}
                                  selectionTrack={matrixTrack}
                                  onToggle={() => toggleSurah(n)}
                                />
                              );
                            })}
                            {canPick && !youHere ? (
                              <button
                                type="button"
                                title={title}
                                aria-label={`Select ${title} for your tracks`}
                                aria-pressed={emptySelected}
                                onClick={() => toggleSurah(n)}
                                className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold outline-none ring-2 ring-transparent transition hover:opacity-90 sm:size-9 ${selUi.focusRing} focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950 ${
                                  emptySelected
                                    ? selUi.cellSelectedEmpty
                                    : "bg-zinc-100/90 text-zinc-400 ring-zinc-200/80 dark:bg-zinc-800/50 dark:text-zinc-500 dark:ring-zinc-700/60"
                                }`}
                              >
                                +
                              </button>
                            ) : null}
                            {here.length === 0 && !canPick ? (
                              <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <aside className="hidden w-full shrink-0 flex-col lg:flex lg:w-[13.5rem] lg:pl-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Your stats
        </p>

        {currentMemberId ? (
          <div className="mt-6 flex flex-col gap-10">
            {myPctQuran != null ? (
              <div className="text-left">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">% Quran memorised</p>
                <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                  {myPctQuran}%
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Whole surahs you have logged</p>
              </div>
            ) : null}

            <div className="text-left">
              <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                <IconTrackMemorising className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                Memorising
              </p>
              <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                {myMem}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Surahs on this track</p>
            </div>

            {!personalMemorizationOnly ? (
              <>
                <div className="text-left">
                  <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                    <IconTrackRevising className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    Revising
                  </p>
                  <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                    {myRev}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Surahs on this track</p>
                </div>

                <div className="text-left">
                  <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                    <IconTrackReciting className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    Reciting
                  </p>
                  <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                    {myRec}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Surahs on this track</p>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Sign in to see your stats.</p>
        )}

        {readOnly ? (
          <p className="mt-6 text-[11px] leading-relaxed text-amber-800 dark:text-amber-400/90">
            {personalMemorizationOnly
              ? "Green boxes are surahs you’ve memorised (% Quran). Bordered rows are on your active memorisation track (from Chat or Intention). Update tracks there — this matrix is read-only."
              : "View only — update tracks from Circles → Chat (I am…) or Intention."}
          </p>
        ) : null}
        <p className="mt-10 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
          {personalMemorizationOnly
            ? "Each card is a surah: memorised, memorisation in progress, or not started."
            : "Each card is a surah. Badges list members on that surah (full names); circles show memorising, revising, or reciting."}
        </p>
      </aside>
    </div>
  );
}
