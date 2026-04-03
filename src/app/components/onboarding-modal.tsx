"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { juzWhereSurahStarts, surahName } from "@/lib/quran";
import { IconTrackMemorising, IconTrackReciting, IconTrackRevising } from "@/app/components/track-activity-icons";

const SURAH_IDS = Array.from({ length: 114 }, (_, i) => i + 1);

type GoalTimeSpan = "7d" | "1m" | "2m";

const GOAL_SPAN_OPTIONS: { value: GoalTimeSpan; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "1m", label: "1 month" },
  { value: "2m", label: "2 months" },
];

type SurahRow = { id: number; name: string; juz: number };

function GoalTimeframeMenu({
  value,
  onChange,
  id,
}: {
  value: GoalTimeSpan;
  onChange: (v: GoalTimeSpan) => void;
  id: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = `${id}-listbox`;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const currentLabel = GOAL_SPAN_OPTIONS.find((o) => o.value === value)?.label ?? "7 days";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        id={id}
        aria-label="Goal timeframe"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white py-2 pl-3 pr-2 text-xs font-medium text-zinc-900 shadow-sm outline-none ring-violet-500/25 transition hover:border-zinc-300 hover:bg-zinc-50 focus-visible:ring-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/80"
      >
        <span className="tabular-nums">{currentLabel}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 text-zinc-400 transition-transform dark:text-zinc-500 ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute right-0 z-[100] mt-1.5 min-w-[10.5rem] overflow-hidden rounded-xl border border-zinc-200/90 bg-white py-1 shadow-lg ring-1 ring-black/[0.04] dark:border-zinc-600 dark:bg-zinc-900 dark:ring-white/[0.06]"
        >
          {GOAL_SPAN_OPTIONS.map((o) => {
            const sel = o.value === value;
            return (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition ${
                    sel
                      ? "bg-violet-50 font-medium text-violet-900 dark:bg-violet-950/60 dark:text-violet-100"
                      : "text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
                  }`}
                >
                  {o.label}
                  {sel ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0 text-violet-600 dark:text-violet-400" aria-hidden>
                      <path
                        fill="currentColor"
                        d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                      />
                    </svg>
                  ) : (
                    <span className="w-4 shrink-0" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function buildAllSurahRows(): SurahRow[] {
  return SURAH_IDS.map((id) => ({
    id,
    name: surahName(id),
    juz: juzWhereSurahStarts(id) ?? 1,
  }));
}

/** Consecutive blocks of surahs that share the same starting juz (matches the Juz label on each row). */
function groupRowsByStartingJuz(rows: SurahRow[]): { juz: number; surahs: SurahRow[] }[] {
  const groups: { juz: number; surahs: SurahRow[] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (!last || last.juz !== r.juz) {
      groups.push({ juz: r.juz, surahs: [r] });
    } else {
      last.surahs.push(r);
    }
  }
  return groups;
}

function JuzSelectAllRow({
  juz,
  surahIds,
  selected,
  onToggleGroup,
}: {
  juz: number;
  surahIds: number[];
  selected: Set<number>;
  onToggleGroup: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const n = surahIds.length;
  const selectedCount = surahIds.reduce((acc, id) => acc + (selected.has(id) ? 1 : 0), 0);
  const allSelected = n > 0 && selectedCount === n;
  const someSelected = selectedCount > 0 && selectedCount < n;

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el) el.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <li className="border-b border-zinc-200 bg-zinc-100/90 dark:border-zinc-700 dark:bg-zinc-800/90">
      <label className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 sm:px-4">
        <input
          ref={inputRef}
          type="checkbox"
          checked={allSelected}
          onChange={onToggleGroup}
          className="h-4 w-4 shrink-0 rounded border-zinc-300 text-violet-600 focus:ring-2 focus:ring-violet-500/40 dark:border-zinc-500 dark:text-violet-500"
          aria-label={`Select all surahs in Juz ${juz} group`}
        />
        <span className="text-base font-bold text-zinc-900 dark:text-zinc-50">Juz {juz}</span>
      </label>
    </li>
  );
}

function AlreadyMemorisedList({
  selected,
  onToggle,
}: {
  selected: Set<number>;
  onToggle: (id: number) => void;
}) {
  const rows = useMemo(() => buildAllSurahRows(), []);
  const groups = useMemo(() => groupRowsByStartingJuz(rows), [rows]);

  const toggleGroup = useCallback(
    (ids: number[]) => {
      const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
      for (const id of ids) {
        if (allOn) {
          if (selected.has(id)) onToggle(id);
        } else if (!selected.has(id)) {
          onToggle(id);
        }
      }
    },
    [selected, onToggle]
  );

  return (
    <div className="max-h-[min(52vh,22rem)] overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-600">
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {groups.map((g, gi) => {
          const ids = g.surahs.map((r) => r.id);
          return (
            <Fragment key={`juz-block-${gi}-${g.juz}`}>
              <JuzSelectAllRow
                juz={g.juz}
                surahIds={ids}
                selected={selected}
                onToggleGroup={() => toggleGroup(ids)}
              />
              {g.surahs.map((r) => {
                const on = selected.has(r.id);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(r.id)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition sm:px-4 ${
                        on
                          ? "bg-violet-50 dark:bg-violet-950/35"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          on
                            ? "border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500"
                            : "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900"
                        }`}
                        aria-hidden
                      >
                        {on ? (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          >
                            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 font-medium text-zinc-900 dark:text-zinc-100">{r.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">Juz {r.juz}</span>
                    </button>
                  </li>
                );
              })}
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}

function GoalMultiSelect({
  label,
  hint,
  icon,
  options,
  selected,
  onToggle,
  emptyMessage,
  timeSpan,
  onTimeSpanChange,
  timeframeSelectId,
}: {
  label: string;
  hint?: string;
  icon: ReactNode;
  options: SurahRow[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  emptyMessage?: string;
  timeSpan: GoalTimeSpan;
  onTimeSpanChange: (v: GoalTimeSpan) => void;
  timeframeSelectId: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return options;
    return options.filter(
      (o) => o.name.toLowerCase().includes(t) || String(o.id).includes(t) || `juz ${o.juz}`.includes(t)
    );
  }, [options, q]);

  const filteredSorted = useMemo(
    () => [...filtered].sort((a, b) => a.id - b.id),
    [filtered]
  );
  const juzGroups = useMemo(() => groupRowsByStartingJuz(filteredSorted), [filteredSorted]);

  const toggleJuzGroup = useCallback(
    (ids: number[]) => {
      const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
      for (const id of ids) {
        if (allOn) {
          if (selected.has(id)) onToggle(id);
        } else if (!selected.has(id)) {
          onToggle(id);
        }
      }
    },
    [selected, onToggle]
  );

  if (options.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-600 dark:bg-zinc-800/40 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <span className="mt-0.5 shrink-0">{icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{label}</p>
              {hint ? <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
            </div>
          </div>
          <GoalTimeframeMenu id={timeframeSelectId} value={timeSpan} onChange={onTimeSpanChange} />
        </div>
        <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
          {emptyMessage ?? "No surahs to show here."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-600 dark:bg-zinc-800/40 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span className="mt-0.5 shrink-0">{icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{label}</p>
            {hint ? <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
          </div>
        </div>
        <GoalTimeframeMenu id={timeframeSelectId} value={timeSpan} onChange={onTimeSpanChange} />
      </div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search surah…"
        className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-violet-500/30 placeholder:text-zinc-400 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
      />
      <div className="mt-2 max-h-[min(28vh,12rem)] overflow-y-auto rounded-lg border border-zinc-200/80 bg-white dark:border-zinc-700 dark:bg-zinc-900/80">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-zinc-500">No surahs match.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {juzGroups.map((g, gi) => {
              const ids = g.surahs.map((r) => r.id);
              return (
                <Fragment key={`${timeframeSelectId}-juz-${gi}-${g.juz}`}>
                  <JuzSelectAllRow
                    juz={g.juz}
                    surahIds={ids}
                    selected={selected}
                    onToggleGroup={() => toggleJuzGroup(ids)}
                  />
                  {g.surahs.map((r) => {
                    const on = selected.has(r.id);
                    return (
                      <li key={r.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/80">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => onToggle(r.id)}
                            className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500 dark:border-zinc-600"
                          />
                          <span className="min-w-0 flex-1 text-zinc-900 dark:text-zinc-100">{r.name}</span>
                          <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">Juz {r.juz}</span>
                        </label>
                      </li>
                    );
                  })}
                </Fragment>
              );
            })}
          </ul>
        )}
      </div>
      {selected.size > 0 ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{selected.size} surah{selected.size === 1 ? "" : "s"} selected</p>
      ) : null}
    </div>
  );
}

function inferGoalTimeSpan(targetEndYmd: string): GoalTimeSpan {
  const [y, m, d] = targetEndYmd.split("-").map(Number);
  if (!y || !m || !d) return "7d";
  const end = Date.UTC(y, m - 1, d);
  const t = new Date();
  const start = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  const days = Math.max(0, Math.round((end - start) / 86400000));
  if (days <= 10) return "7d";
  if (days <= 45) return "1m";
  return "2m";
}

function SetGoalsStep2Pickers({
  idPrefix,
  already,
  goalMem,
  goalRev,
  goalRec,
  spanMem,
  spanRev,
  spanRec,
  onToggleMem,
  onToggleRev,
  onToggleRec,
  setSpanMem,
  setSpanRev,
  setSpanRec,
}: {
  idPrefix: string;
  already: Set<number>;
  goalMem: Set<number>;
  goalRev: Set<number>;
  goalRec: Set<number>;
  spanMem: GoalTimeSpan;
  spanRev: GoalTimeSpan;
  spanRec: GoalTimeSpan;
  onToggleMem: (id: number) => void;
  onToggleRev: (id: number) => void;
  onToggleRec: (id: number) => void;
  setSpanMem: (v: GoalTimeSpan) => void;
  setSpanRev: (v: GoalTimeSpan) => void;
  setSpanRec: (v: GoalTimeSpan) => void;
}) {
  const allRows = useMemo(() => buildAllSurahRows(), []);
  const optionsMemorize = useMemo(() => allRows.filter((r) => !already.has(r.id)), [allRows, already]);
  const optionsRevise = useMemo(() => allRows.filter((r) => already.has(r.id)), [allRows, already]);

  return (
    <div className="space-y-4">
      <GoalMultiSelect
        label="I will memorise"
        hint="Surahs you haven't memorised yet"
        icon={<IconTrackMemorising className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
        options={optionsMemorize}
        selected={goalMem}
        onToggle={onToggleMem}
        timeSpan={spanMem}
        onTimeSpanChange={setSpanMem}
        timeframeSelectId={`${idPrefix}-span-mem`}
      />
      <GoalMultiSelect
        label="I will revise"
        hint={already.size === 0 ? "Mark surahs as memorised first (onboarding or matrix)." : "Only surahs you’ve already memorised."}
        icon={<IconTrackRevising className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
        options={optionsRevise}
        selected={goalRev}
        onToggle={onToggleRev}
        emptyMessage="No memorised surahs yet — add them elsewhere first to choose revision targets."
        timeSpan={spanRev}
        onTimeSpanChange={setSpanRev}
        timeframeSelectId={`${idPrefix}-span-rev`}
      />
      <GoalMultiSelect
        label="I will recite"
        hint="Any surahs you want to recite during this period."
        icon={<IconTrackReciting className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
        options={allRows}
        selected={goalRec}
        onToggle={onToggleRec}
        timeSpan={spanRec}
        onTimeSpanChange={setSpanRec}
        timeframeSelectId={`${idPrefix}-span-rec`}
      />
    </div>
  );
}

export type AddGoalsModalInitial = {
  memorizing: { surahIds: number[]; targetEnd: string };
  revising: { surahIds: number[]; targetEnd: string };
  reciting: { surahIds: number[]; targetEnd: string };
} | null;

/**
 * Same surah pickers as onboarding step 2 (“Set your goals”). POSTs to /api/onboarding with current memorised list.
 */
export function AddGoalsModal({
  memorizedSurahIds,
  initialGoals,
  onClose,
  onSaved,
}: {
  memorizedSurahIds: number[];
  initialGoals: AddGoalsModalInitial;
  onClose: () => void;
  onSaved: () => void;
}) {
  const already = useMemo(
    () => new Set(memorizedSurahIds.filter((n) => n >= 1 && n <= 114)),
    [memorizedSurahIds]
  );
  const idPrefix = "add-goals";

  const [goalMem, setGoalMem] = useState(() => new Set(initialGoals?.memorizing.surahIds ?? []));
  const [goalRev, setGoalRev] = useState(() => new Set(initialGoals?.revising.surahIds ?? []));
  const [goalRec, setGoalRec] = useState(() => new Set(initialGoals?.reciting.surahIds ?? []));
  const [spanMem, setSpanMem] = useState<GoalTimeSpan>(() =>
    initialGoals ? inferGoalTimeSpan(initialGoals.memorizing.targetEnd) : "7d"
  );
  const [spanRev, setSpanRev] = useState<GoalTimeSpan>(() =>
    initialGoals ? inferGoalTimeSpan(initialGoals.revising.targetEnd) : "7d"
  );
  const [spanRec, setSpanRec] = useState<GoalTimeSpan>(() =>
    initialGoals ? inferGoalTimeSpan(initialGoals.reciting.targetEnd) : "7d"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleIn = useCallback((setter: Dispatch<SetStateAction<Set<number>>>, id: number) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    setGoalMem((prev) => {
      const next = new Set([...prev].filter((id) => !already.has(id)));
      return next.size === prev.size && [...prev].every((id) => next.has(id)) ? prev : next;
    });
    setGoalRev((prev) => {
      const next = new Set([...prev].filter((id) => already.has(id)));
      return next.size === prev.size && [...prev].every((id) => next.has(id)) ? prev : next;
    });
  }, [already]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const alreadySorted = [...already].sort((a, b) => a - b);
      const body = {
        already_memorized_surah_ids: alreadySorted,
        goal_memorize_surah_ids: [...goalMem].sort((a, b) => a - b),
        goal_revise_surah_ids: [...goalRev].sort((a, b) => a - b),
        goal_recite_surah_ids: [...goalRec].sort((a, b) => a - b),
        memorize_span: spanMem,
        revise_span: spanRev,
        recite_span: spanRec,
      };
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  const titleId = "add-goals-modal-title";

  const node = (
    <div className="pointer-events-auto fixed inset-0 z-[210] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50"
        onClick={() => {
          if (!submitting) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(88vh,40rem)] w-full max-w-lg min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800 sm:px-5 sm:py-4">
          <h2 id={titleId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Set your goals
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Pick surahs per track and a timeframe for each. This updates My goals and Current focus.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <SetGoalsStep2Pickers
            idPrefix={idPrefix}
            already={already}
            goalMem={goalMem}
            goalRev={goalRev}
            goalRec={goalRec}
            spanMem={spanMem}
            spanRev={spanRev}
            spanRec={spanRec}
            onToggleMem={(id) => toggleIn(setGoalMem, id)}
            onToggleRev={(id) => toggleIn(setGoalRev, id)}
            onToggleRec={(id) => toggleIn(setGoalRec, id)}
            setSpanMem={setSpanMem}
            setSpanRev={setSpanRev}
            setSpanRec={setSpanRec}
          />
          {error ? (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-5">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-800 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-violet-600 dark:hover:bg-violet-500"
          >
            {submitting ? "Saving…" : "Save goals"}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

function OnboardingWizard({ onDone, idPrefix }: { onDone: () => void; idPrefix: string }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [already, setAlready] = useState<Set<number>>(new Set());
  const [goalMem, setGoalMem] = useState<Set<number>>(new Set());
  const [goalRev, setGoalRev] = useState<Set<number>>(new Set());
  const [goalRec, setGoalRec] = useState<Set<number>>(new Set());
  const [spanMem, setSpanMem] = useState<GoalTimeSpan>("7d");
  const [spanRev, setSpanRev] = useState<GoalTimeSpan>("7d");
  const [spanRec, setSpanRec] = useState<GoalTimeSpan>("7d");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAlready = useCallback((id: number) => {
    setAlready((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    setGoalMem((prev) => {
      const next = new Set([...prev].filter((id) => !already.has(id)));
      return next.size === prev.size && [...prev].every((id) => next.has(id)) ? prev : next;
    });
    setGoalRev((prev) => {
      const next = new Set([...prev].filter((id) => already.has(id)));
      return next.size === prev.size && [...prev].every((id) => next.has(id)) ? prev : next;
    });
  }, [already]);

  const toggleIn = useCallback((setter: Dispatch<SetStateAction<Set<number>>>, id: number) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function submit(skip: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      const body = skip
        ? { skip: true as const }
        : {
            already_memorized_surah_ids: [...already].sort((a, b) => a - b),
            goal_memorize_surah_ids: [...goalMem].sort((a, b) => a - b),
            goal_revise_surah_ids: [...goalRev].sort((a, b) => a - b),
            goal_recite_surah_ids: [...goalRec].sort((a, b) => a - b),
            memorize_span: spanMem,
            revise_span: spanRev,
            recite_span: spanRec,
          };
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  const titleId = `onboarding-title-${idPrefix}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800 sm:px-5 sm:py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Step {step} of 2
          </p>
          <h2 id={titleId} className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {step === 1 ? "What have you already memorised?" : "Set your goals"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {step === 1
              ? "Tick every surah you’ve already committed to memory. This updates % Quran, the matrix, Current focus, and projections."
              : "Pick surahs per track and a timeframe for each. This fills your My goals tab."}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {step === 1 ? (
            <AlreadyMemorisedList selected={already} onToggle={toggleAlready} />
          ) : (
            <SetGoalsStep2Pickers
              idPrefix={idPrefix}
              already={already}
              goalMem={goalMem}
              goalRev={goalRev}
              goalRec={goalRec}
              spanMem={spanMem}
              spanRev={spanRev}
              spanRec={spanRec}
              onToggleMem={(id) => toggleIn(setGoalMem, id)}
              onToggleRev={(id) => toggleIn(setGoalRev, id)}
              onToggleRec={(id) => toggleIn(setGoalRec, id)}
              setSpanMem={setSpanMem}
              setSpanRev={setSpanRev}
              setSpanRec={setSpanRec}
            />
          )}

          {error ? (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={submitting}
              className="order-2 text-sm font-medium text-zinc-500 hover:text-zinc-800 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200 sm:order-1"
            >
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit(true)}
              disabled={submitting}
              className="order-2 text-left text-sm text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline disabled:opacity-50 dark:text-zinc-500 dark:hover:text-zinc-300 sm:order-1"
            >
              Skip for now
            </button>
          )}
          <div className="order-1 flex gap-2 sm:order-2">
            {step === 1 ? (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 dark:bg-violet-600 dark:hover:bg-violet-500"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submit(false)}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-violet-600 dark:hover:bg-violet-500"
              >
                {submitting ? "Saving…" : "Finish"}
              </button>
            )}
          </div>
        </div>
    </div>
  );
}

function AddGoalsBarChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`shrink-0 text-zinc-500 transition-transform dark:text-zinc-400 ${expanded ? "" : "rotate-180"}`}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Collapsible “Add Goals” floating bar: same shell for first-login (portal) and My Goals (embedded).
 * Rounded `max-w-lg` card above a matching toggle bar — not full viewport width.
 */
export function AddGoalsBar({
  onDone,
  defaultExpanded,
  layout,
  showBackdropWhenExpanded,
}: {
  onDone: () => void;
  defaultExpanded: boolean;
  layout: "portal" | "embedded";
  showBackdropWhenExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const idPrefix = layout === "portal" ? "onboard" : "resume";
  const dialogLabelledBy = `onboarding-title-${idPrefix}`;

  const toggleBarClass =
    "flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200/90 bg-white px-4 py-3.5 text-sm font-semibold text-zinc-800 shadow-[0_-4px_28px_-4px_rgba(0,0,0,0.12)] transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-[0_-4px_28px_-4px_rgba(0,0,0,0.45)] dark:hover:bg-zinc-800/90";

  const cardShellClass =
    "flex max-h-[min(85vh,44rem)] min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900";

  const inner = (
    <div className="flex w-full max-w-lg flex-col-reverse gap-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={toggleBarClass}
      >
        <span>{expanded ? "Hide" : "Add Goals"}</span>
        <AddGoalsBarChevron expanded={expanded} />
      </button>
      <div
        className={`grid min-h-0 transition-[grid-template-rows] duration-200 ease-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={cardShellClass}
            role={layout === "portal" && expanded ? "dialog" : undefined}
            aria-modal={layout === "portal" && expanded ? true : undefined}
            aria-labelledby={layout === "portal" && expanded ? dialogLabelledBy : undefined}
          >
            <OnboardingWizard onDone={onDone} idPrefix={idPrefix} />
          </div>
        </div>
      </div>
    </div>
  );

  if (layout === "embedded") {
    return (
      <div className="w-full shrink-0 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-2">
        {inner}
      </div>
    );
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[200]">
      {showBackdropWhenExpanded && expanded ? (
        <div className="pointer-events-auto absolute inset-0 bg-black/45" aria-hidden />
      ) : null}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
        <div className="pointer-events-auto mx-auto w-full max-w-lg">{inner}</div>
      </div>
    </div>,
    document.body
  );
}

export function OnboardingResumeSheet({ onDone }: { onDone: () => void }) {
  return (
    <AddGoalsBar
      layout="embedded"
      defaultExpanded={false}
      showBackdropWhenExpanded={false}
      onDone={onDone}
    />
  );
}

export function OnboardingModal({ open, onDone }: { open: boolean; onDone: () => void }) {
  if (typeof document === "undefined" || !open) return null;
  return (
    <AddGoalsBar
      layout="portal"
      defaultExpanded
      showBackdropWhenExpanded
      onDone={onDone}
    />
  );
}
