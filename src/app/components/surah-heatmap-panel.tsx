"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { surahName } from "@/lib/quran";

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

/** Surah columns: compact phones → sm → desktop lg+. */
const SURAH_COL_W =
  "w-[2.6rem] min-w-[2.6rem] max-w-[2.6rem] sm:w-[3.2rem] sm:min-w-[3.2rem] sm:max-w-[3.2rem] lg:w-[4.5rem] lg:min-w-[4.5rem] lg:max-w-[4.5rem]";
const SURAH_COL = `${SURAH_COL_W} p-0`;

/** Heatmap cell height scales with column width. */
const CELL_BOX = `box-border h-7 sm:h-9 lg:h-10 ${SURAH_COL_W} shrink-0 rounded-md ring-1 lg:rounded-lg`;

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

/** When a cell has multiple badges, tint the cell by the first of M → R → C present. */
const CHROME_ACT_ORDER: HeatmapActivity[] = ["memorizing", "revising", "reciting"];

function primaryActivityForCellChrome(activities: HeatmapActivity[]): HeatmapActivity {
  for (const a of CHROME_ACT_ORDER) {
    if (activities.includes(a)) return a;
  }
  return activities[0]!;
}

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
  const sz = size === "md" ? "px-1 py-0.5 text-[11px]" : "px-0.5 py-px text-[9px] sm:text-[10px]";
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex shrink-0 flex-col items-center justify-center rounded-md border border-zinc-200/90 bg-zinc-100/90 leading-none text-zinc-500 shadow-sm transition hover:bg-zinc-200/90 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800/90 dark:text-zinc-400 dark:hover:bg-zinc-700/90 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-500 ${sz}`}
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

const BADGE: Record<HeatmapActivity, { label: string; title: string }> = {
  memorizing: { label: "M", title: "Memorising" },
  revising: { label: "R", title: "Revising" },
  reciting: { label: "C", title: "Reciting" },
};

/** Plain track letters (no pill); white on dark theme, dark on light tinted cells. */
const MATRIX_TRACK_LETTER =
  "text-center text-[8px] font-bold leading-none tabular-nums text-zinc-900 sm:text-[9px] lg:text-xs dark:text-white";

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

function HeatmapCell({
  activities,
  interactive,
  selected,
  selectionTrack,
  onToggle,
  surahTitle,
}: {
  activities: HeatmapActivity[] | null | undefined;
  interactive: boolean;
  selected: boolean;
  /** Active track in the save bar; drives selection ring colour. */
  selectionTrack: MatrixTrack;
  onToggle: () => void;
  surahTitle: string;
}) {
  const list = activities?.length ? activities : null;
  const sel = MATRIX_TRACK_UI[selectionTrack];
  const chromeTrack = list ? primaryActivityForCellChrome(list) : null;
  const savedUi = chromeTrack ? MATRIX_TRACK_UI[chromeTrack] : null;

  const inner = (
    <>
      {!list ? (
        <div
          className={`${CELL_BOX} ${
            selected
              ? sel.cellSelectedEmpty
              : "bg-zinc-100/90 ring-zinc-200/80 dark:bg-zinc-800/50 dark:ring-zinc-700/60"
          }`}
          aria-hidden
        />
      ) : (
        <div
          className={`flex ${CELL_BOX} flex-col items-center justify-center gap-0.5 px-0.5 py-0.5 ${
            selected ? sel.cellSelectedFilled : savedUi!.cellSavedFilled
          }`}
        >
          {list.map((a) => (
            <span key={a} title={BADGE[a].title} className={MATRIX_TRACK_LETTER}>
              {BADGE[a].label}
            </span>
          ))}
        </div>
      )}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        title={surahTitle}
        aria-label={surahTitle}
        aria-pressed={selected}
        onClick={onToggle}
        className={`mx-auto flex min-h-9 shrink-0 items-center justify-center rounded-md py-px outline-none ring-2 ring-transparent ring-offset-1 ring-offset-white transition hover:opacity-90 focus-visible:ring-offset-1 dark:ring-offset-zinc-950 sm:min-h-10 sm:py-0.5 sm:ring-offset-2 sm:focus-visible:ring-offset-2 lg:min-h-12 ${SURAH_COL_W} ${sel.focusRing} focus-visible:ring-2`}
      >
        {inner}
      </button>
    );
  }

  if (!list) {
    return (
      <div
        className={`mx-auto ${CELL_BOX} bg-zinc-100/90 ring-zinc-200/80 dark:bg-zinc-800/50 dark:ring-zinc-700/60`}
        title={surahTitle}
        aria-hidden
      />
    );
  }

  const roChrome = primaryActivityForCellChrome(list);
  const roSaved = MATRIX_TRACK_UI[roChrome].cellSavedFilled;

  return (
    <div
      className={`mx-auto flex ${CELL_BOX} flex-col items-center justify-center gap-0.5 px-0.5 py-0.5 ${roSaved}`}
      title={`${surahTitle} · ${list.map((a) => BADGE[a].title).join(" · ")}`}
    >
      {list.map((a) => (
        <span key={a} title={BADGE[a].title} className={MATRIX_TRACK_LETTER}>
          {BADGE[a].label}
        </span>
      ))}
    </div>
  );
}

export function SurahHeatmapPanel({
  heatmap,
  currentMemberId,
  onSaved,
  myPctQuran,
}: {
  heatmap: HeatmapPayload | null | undefined;
  currentMemberId: string | null | undefined;
  onSaved?: () => void;
  /** Your % Quran (memorised surahs), from dashboard — optional. */
  myPctQuran?: number | null;
}) {
  const rows = heatmap?.rows ?? [];

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
  const [matrixHelpOpen, setMatrixHelpOpen] = useState(false);
  const [surahOrderDesc, setSurahOrderDesc] = useState(false);
  const matrixHelpRef = useRef<HTMLDivElement>(null);

  const surahOrderList = useMemo(
    () => (surahOrderDesc ? [...SURAH_RANGE].reverse() : SURAH_RANGE),
    [surahOrderDesc]
  );

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!matrixHelpOpen) return;
    function onDoc(e: MouseEvent) {
      if (matrixHelpRef.current && !matrixHelpRef.current.contains(e.target as Node)) {
        setMatrixHelpOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMatrixHelpOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [matrixHelpOpen]);

  const empty = rows.length === 0;
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
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden bg-white p-2 sm:gap-4 sm:p-4 dark:bg-zinc-950 lg:flex-row lg:gap-6 lg:p-6">
      {floatingEditor}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/30 lg:rounded-2xl">
        <div className="shrink-0 border-b border-zinc-100 px-2 py-2.5 dark:border-zinc-800 sm:px-4 sm:py-4">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
              <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 lg:text-lg">
                Surah matrix
              </h2>
              <div ref={matrixHelpRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setMatrixHelpOpen((o) => !o)}
                  className="rounded-full p-0.5 text-zinc-400 outline-none transition hover:bg-zinc-100 hover:text-zinc-600 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-950 sm:p-1"
                  aria-expanded={matrixHelpOpen}
                  aria-controls="surah-matrix-help"
                  id="surah-matrix-help-trigger"
                >
                  <IconInfo className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="sr-only">How the Surah matrix works</span>
                </button>
                {matrixHelpOpen ? (
                  <div
                    id="surah-matrix-help"
                    role="region"
                    aria-labelledby="surah-matrix-help-trigger"
                    className="absolute left-0 top-[calc(100%+0.375rem)] z-50 w-[min(20rem,calc(100vw-1.25rem))] rounded-lg border border-zinc-200 bg-white p-2.5 text-left text-xs leading-snug text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 sm:w-[min(22rem,calc(100vw-2rem))] sm:rounded-xl sm:p-3 sm:text-sm"
                  >
                    <p>
                      On a phone, each <span className="font-medium text-zinc-800 dark:text-zinc-100">row</span> is a
                      surah and columns are members — scroll down the list. On a large screen, members are rows and
                      surahs scroll sideways. Tap <span className="font-medium text-zinc-800 dark:text-zinc-100">∧∨</span>{" "}
                      next to Surah (phone) or Member (desktop) to flip order. Tap{" "}
                      <span className="font-medium text-zinc-800 dark:text-zinc-100">your</span> column (or row on
                      desktop) to select; pick a track, then{" "}
                      <span className="font-medium text-zinc-800 dark:text-zinc-100">Save</span> or{" "}
                      <span className="font-medium text-zinc-800 dark:text-zinc-100">Remove</span>.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
            <p className="max-w-[min(11rem,48vw)] shrink-0 text-right text-[8px] leading-tight text-zinc-500 sm:max-w-[min(16rem,42vw)] sm:text-[10px] sm:leading-snug dark:text-zinc-400 md:max-w-none md:text-xs">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">M</span> memorising
              <span className="mx-1 text-zinc-400 dark:text-zinc-600" aria-hidden>
                ·
              </span>
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">R</span> revising
              <span className="mx-1 text-zinc-400 dark:text-zinc-600" aria-hidden>
                ·
              </span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">C</span> reciting
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {empty ? (
            <p className="p-4 text-xs text-zinc-500 sm:p-6 sm:text-sm">No members yet.</p>
          ) : (
            <>
              {/* &lt;lg: surahs as rows (scroll vertically), members as columns — fits phone width */}
              <table className="w-max border-separate border-spacing-x-2 border-spacing-y-2.5 sm:border-spacing-x-2.5 sm:border-spacing-y-3 lg:hidden">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 top-0 z-50 w-[5.35rem] min-w-[5.35rem] max-w-[5.35rem] bg-white py-1.5 pl-1.5 pr-1 align-bottom shadow-[4px_4px_12px_-4px_rgba(0,0,0,0.12)] sm:w-[7rem] sm:min-w-[7rem] sm:max-w-[7rem] sm:py-2 sm:pl-2 sm:pr-1.5 dark:bg-zinc-950 dark:shadow-[4px_4px_12px_-4px_rgba(0,0,0,0.45)]"
                    >
                      <div className="flex items-center gap-1">
                        <span className="min-w-0 flex-1 text-left text-[7px] font-semibold uppercase tracking-wide text-zinc-400 sm:text-[8px] dark:text-zinc-500">
                          Surah
                        </span>
                        <SurahOrderToggle
                          surahOrderDesc={surahOrderDesc}
                          onToggle={() => setSurahOrderDesc((d) => !d)}
                        />
                      </div>
                    </th>
                    {orderedRows.map((row) => {
                      const isYou = currentMemberId != null && row.member_id === currentMemberId;
                      return (
                        <th
                          key={row.member_id}
                          scope="col"
                          title={isYou ? `${row.display_name} (You)` : row.display_name}
                          className={`sticky top-0 z-40 ${SURAH_COL} box-border bg-white align-bottom px-0.5 py-1.5 dark:bg-zinc-950 sm:py-2`}
                        >
                          <div className="flex w-full min-w-0 max-w-full flex-col items-center justify-end gap-0 px-0.5">
                            <span className="w-full min-w-0 max-w-full text-center text-[7px] font-semibold leading-tight text-zinc-700 [overflow-wrap:anywhere] sm:text-[8px] dark:text-zinc-300">
                              {row.display_name}
                              {isYou ? (
                                <span className="block font-normal text-zinc-500 dark:text-zinc-400">(You)</span>
                              ) : null}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {surahOrderList.map((n) => {
                    const title = `${n}. ${surahName(n)}`;
                    return (
                      <tr key={n} className="group">
                        <th
                          scope="row"
                          className="sticky left-0 z-30 w-[5.35rem] min-w-[5.35rem] max-w-[5.35rem] whitespace-normal break-words bg-zinc-50/95 py-1.5 pl-1.5 pr-1 text-left text-[9px] font-medium leading-snug text-zinc-900 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.06)] backdrop-blur-sm sm:w-[7rem] sm:min-w-[7rem] sm:max-w-[7rem] sm:py-2 sm:pl-2 sm:pr-1.5 sm:text-[10px] dark:bg-zinc-900/95 dark:text-zinc-100 dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.35)]"
                          title={title}
                        >
                          <span className="tabular-nums text-zinc-400 dark:text-zinc-500">{n}.</span>{" "}
                          {surahName(n)}
                        </th>
                        {orderedRows.map((row) => {
                          const isYou = currentMemberId != null && row.member_id === currentMemberId;
                          return (
                            <td key={row.member_id} className={`align-middle ${SURAH_COL}`}>
                              <HeatmapCell
                                activities={row.surahs[n] ?? null}
                                interactive={isYou}
                                selected={isYou && selectedSurahs.has(n)}
                                selectionTrack={matrixTrack}
                                onToggle={() => toggleSurah(n)}
                                surahTitle={title}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* lg+: members as rows, surahs as columns (wide screens) */}
              <table className="hidden w-max min-w-full border-separate border-spacing-x-5 border-spacing-y-2.5 lg:table">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 top-0 z-40 min-w-[10rem] w-[10rem] max-w-[10rem] bg-white py-2 pl-3 pr-2 text-left align-middle text-[10px] font-semibold uppercase tracking-wider text-zinc-400 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.08)] dark:bg-zinc-950 dark:text-zinc-500 dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.4)]"
                    >
                      <div className="flex items-center justify-between gap-2 pr-0.5">
                        <span>Member</span>
                        <SurahOrderToggle
                          size="md"
                          surahOrderDesc={surahOrderDesc}
                          onToggle={() => setSurahOrderDesc((d) => !d)}
                        />
                      </div>
                    </th>
                    {surahOrderList.map((n) => (
                      <th
                        key={n}
                        scope="col"
                        title={`${n}. ${surahName(n)}`}
                        className={`sticky top-0 z-20 ${SURAH_COL} bg-white align-top px-0.5 py-1.5 dark:bg-zinc-950`}
                      >
                        <div className="flex w-full justify-center px-0.5">
                          <span className="text-center text-[10px] font-semibold leading-snug text-zinc-700 [overflow-wrap:anywhere] dark:text-zinc-300">
                            {surahName(n)}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orderedRows.map((row) => {
                    const isYou = currentMemberId != null && row.member_id === currentMemberId;
                    return (
                      <tr key={row.member_id} className="group">
                        <th
                          scope="row"
                          className="sticky left-0 z-10 min-w-[10rem] w-[10rem] max-w-[10rem] whitespace-nowrap bg-zinc-50/95 py-1.5 pl-3 pr-2 text-left text-sm font-medium text-zinc-900 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.06)] backdrop-blur-sm dark:bg-zinc-900/95 dark:text-zinc-100 dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.35)]"
                        >
                          {row.display_name}
                          {isYou ? (
                            <span className="ml-1 font-normal text-zinc-500 dark:text-zinc-400">(You)</span>
                          ) : null}
                        </th>
                        {surahOrderList.map((n) => {
                          const title = `${n}. ${surahName(n)}`;
                          return (
                            <td key={n} className={`align-middle ${SURAH_COL}`}>
                              <HeatmapCell
                                activities={row.surahs[n] ?? null}
                                interactive={isYou}
                                selected={isYou && selectedSurahs.has(n)}
                                selectionTrack={matrixTrack}
                                onToggle={() => toggleSurah(n)}
                                surahTitle={title}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Memorising</p>
              <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                {myMem}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Surahs in your row</p>
            </div>

            <div className="text-left">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Revising</p>
              <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                {myRev}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Surahs in your row</p>
            </div>

            <div className="text-left">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Reciting</p>
              <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                {myRec}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Surahs in your row</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Sign in to see your stats.</p>
        )}

        <p className="mt-10 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
          Scroll horizontally to see all surahs. Column headers are surah names; hover for number + full title.
        </p>
      </aside>
    </div>
  );
}
