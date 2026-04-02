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

/** Fixed column width (header + cells). Wider than cell height → rectangular boxes. */
const SURAH_COL_W = "w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem]";
const SURAH_COL = `${SURAH_COL_W} p-0`;

/** Heatmap cell: fixed rectangle (wide × shorter); tall enough for stacked M/R/C. */
const CELL_BOX = `box-border h-10 ${SURAH_COL_W} shrink-0 rounded-lg ring-1`;

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

function MatrixFloatingBar({
  matrixTrack,
  setMatrixTrack,
  selectedCount,
  saving,
  onSave,
  onClear,
  errorMsg,
}: {
  matrixTrack: MatrixTrack;
  setMatrixTrack: (t: MatrixTrack) => void;
  selectedCount: number;
  saving: boolean;
  onSave: () => void;
  onClear: () => void;
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
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-label="Save matrix selection"
    >
      <div className="pointer-events-auto mt-12 flex max-w-[calc(100vw-2rem)] flex-col items-center gap-2 sm:mt-14">
        <div className="matrix-save-bar-enter flex flex-wrap items-center justify-center gap-x-2 gap-y-2 rounded-full border border-zinc-200/90 bg-white py-2 pl-3 pr-2 shadow-2xl ring-1 ring-black/5 dark:border-zinc-300 dark:bg-white dark:ring-black/10">
          <div ref={trackWrapRef} className="relative flex items-center gap-1.5">
            <span className="shrink-0 text-xs font-medium text-zinc-800" id="matrix-track-label">
              Track
            </span>
            <button
              type="button"
              className={`flex min-w-[6.75rem] items-center justify-between gap-1.5 rounded-full border py-1.5 pl-2.5 pr-2 text-left text-xs font-medium text-zinc-900 outline-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${trackUi.focusRing} ${menuOpen ? trackUi.triggerOpen : trackUi.triggerIdle}`}
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
          <span className="hidden h-5 w-px shrink-0 bg-zinc-200 sm:block" aria-hidden />
          <span className="text-xs tabular-nums text-zinc-500">{selectedCount} selected</span>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || selectedCount === 0}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${trackUi.save} ${trackUi.saveHover}`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={selectedCount === 0}
            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
        </div>
        {errorMsg ? (
          <p
            className="max-w-md rounded-xl border border-red-200 bg-white px-4 py-2 text-center text-xs text-red-600 shadow-lg dark:border-red-300 dark:bg-white"
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
  "text-center text-xs font-bold leading-none tabular-nums text-zinc-900 dark:text-white";

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
        className={`mx-auto flex min-h-12 ${SURAH_COL_W} shrink-0 items-center justify-center rounded-md py-0.5 outline-none ring-2 ring-transparent ring-offset-2 ring-offset-white transition hover:opacity-90 focus-visible:ring-offset-2 dark:ring-offset-zinc-950 ${sel.focusRing} focus-visible:ring-2`}
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
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

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
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/member-progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: matrixTrack,
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
      setSaving(false);
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
            saving={saving}
            onSave={() => void saveMatrix()}
            onClear={clearSelection}
            errorMsg={errorMsg}
          />,
          document.body
        )
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-white p-4 sm:p-6 dark:bg-zinc-950 lg:flex-row lg:gap-6">
      {floatingEditor}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="shrink-0 border-b border-zinc-100 px-4 py-4 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Surah matrix
              </h2>
              <p className="mt-1 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
                Columns are surah names. Stacked badges:{" "}
                <span className="font-medium text-emerald-700 dark:text-emerald-400">M</span> memorising,{" "}
                <span className="font-medium text-indigo-700 dark:text-indigo-400">R</span> revising,{" "}
                <span className="font-medium text-amber-700 dark:text-amber-400">C</span> reciting. Tap cells in your
                row to select; a bar appears at the top to choose track and save.
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {empty ? (
            <p className="p-6 text-sm text-zinc-500">No members yet.</p>
          ) : (
            <table className="w-max min-w-full border-separate border-spacing-x-2 border-spacing-y-1.5">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 top-0 z-40 min-w-[10rem] w-[10rem] max-w-[10rem] align-top bg-white py-2 pl-3 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.08)] dark:bg-zinc-950 dark:text-zinc-500 dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.4)]"
                  >
                    Member
                  </th>
                  {SURAH_RANGE.map((n) => (
                    <th
                      key={n}
                      scope="col"
                      title={`${n}. ${surahName(n)}`}
                      className={`sticky top-0 z-20 ${SURAH_COL} bg-white align-top py-1.5 dark:bg-zinc-950`}
                    >
                      <div className="flex w-full justify-center px-1">
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
                      {SURAH_RANGE.map((n) => {
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
          )}
        </div>
      </div>

      <aside className="flex w-full shrink-0 flex-col lg:w-[13.5rem] lg:pl-1">
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
          Scroll horizontally for all surahs. Each column header is the surah name; hover for number + full title.
        </p>
      </aside>
    </div>
  );
}
