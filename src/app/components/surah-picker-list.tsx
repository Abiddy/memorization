"use client";

import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { juzWhereSurahStarts, surahName } from "@/lib/quran";

const SURAH_IDS = Array.from({ length: 114 }, (_, i) => i + 1);

export type SurahRow = { id: number; name: string; juz: number };

export function buildAllSurahRows(): SurahRow[] {
  return SURAH_IDS.map((id) => ({
    id,
    name: surahName(id),
    juz: juzWhereSurahStarts(id) ?? 1,
  }));
}

/** Consecutive blocks of surahs that share the same starting juz (matches the Juz label on each row). */
export function groupRowsByStartingJuz(rows: SurahRow[]): { juz: number; surahs: SurahRow[] }[] {
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

export function JuzSelectAllRow({
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

type SurahPickerListByJuzProps = {
  options: SurahRow[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  /** Scroll area max height (Tailwind classes). */
  listMaxHeightClass?: string;
  showSelectionCount?: boolean;
};

/**
 * Search + Juz-grouped checkbox list (same pattern as My goals / New Goals surah pickers).
 */
export function SurahPickerListByJuz({
  options,
  selected,
  onToggle,
  listMaxHeightClass = "max-h-[min(28vh,12rem)]",
  showSelectionCount = true,
}: SurahPickerListByJuzProps) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return options;
    return options.filter(
      (o) => o.name.toLowerCase().includes(t) || String(o.id).includes(t) || `juz ${o.juz}`.includes(t)
    );
  }, [options, q]);

  const filteredSorted = useMemo(() => [...filtered].sort((a, b) => a.id - b.id), [filtered]);
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

  return (
    <>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search surah…"
        className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-violet-500/30 placeholder:text-zinc-400 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
      />
      <div
        className={`mt-2 overflow-y-auto rounded-lg border border-zinc-200/80 bg-white dark:border-zinc-700 dark:bg-zinc-900/80 ${listMaxHeightClass}`}
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-zinc-500">No surahs match.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {juzGroups.map((g, gi) => {
              const ids = g.surahs.map((r) => r.id);
              return (
                <Fragment key={`juz-${gi}-${g.juz}`}>
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
      {showSelectionCount && selected.size > 0 ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {selected.size} surah{selected.size === 1 ? "" : "s"} selected
        </p>
      ) : null}
    </>
  );
}
