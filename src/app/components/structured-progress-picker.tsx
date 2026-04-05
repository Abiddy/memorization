"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildAllSurahRows, SurahPickerListByJuz, type SurahRow } from "@/app/components/surah-picker-list";
import type { ProgressActivity } from "@/lib/quran";

type Step = 1 | 2;

export function StructuredProgressPicker({
  memorizedSurahIds,
  onPosted,
  onError,
}: {
  /** Same baseline as Intention: surahs already counted as memorised (% Quran). */
  memorizedSurahIds: number[];
  onPosted: () => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [activity, setActivity] = useState<ProgressActivity | null>(null);
  const [memorizingSurahs, setMemorizingSurahs] = useState<Set<number>>(new Set());
  const [revisingSurahs, setRevisingSurahs] = useState<Set<number>>(new Set());
  const [recitingSurahs, setRecitingSurahs] = useState<Set<number>>(new Set());
  const [posting, setPosting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const memorizedSet = useMemo(
    () => new Set(memorizedSurahIds.filter((n) => n >= 1 && n <= 114)),
    [memorizedSurahIds]
  );

  const allRows = useMemo(() => buildAllSurahRows(), []);

  const optionsForActivity = useMemo((): SurahRow[] => {
    if (!activity) return [];
    if (activity === "memorizing") {
      return allRows.filter((r) => !memorizedSet.has(r.id));
    }
    if (activity === "revising") {
      return allRows.filter((r) => memorizedSet.has(r.id));
    }
    return allRows;
  }, [activity, allRows, memorizedSet]);

  const reset = useCallback(() => {
    setStep(1);
    setActivity(null);
    setMemorizingSurahs(new Set());
    setRevisingSurahs(new Set());
    setRecitingSurahs(new Set());
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) {
        setOpen(false);
        reset();
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, reset]);

  function toggleMemorizingSurah(id: number) {
    setMemorizingSurahs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleRevisingSurah(id: number) {
    setRevisingSurahs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleRecitingSurah(id: number) {
    setRecitingSurahs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function post() {
    if (!activity) return;
    if (activity === "memorizing") {
      if (memorizingSurahs.size === 0) return;
    } else if (activity === "revising") {
      if (revisingSurahs.size === 0) return;
    } else if (recitingSurahs.size === 0) {
      return;
    }

    setPosting(true);
    try {
      const body =
        activity === "memorizing"
          ? { track: "memorizing" as const, surah_ids: [...memorizingSurahs] }
          : activity === "revising"
            ? { track: "revising" as const, surah_ids: [...revisingSurahs] }
            : { track: "reciting" as const, surah_ids: [...recitingSurahs] };

      const res = await fetch("/api/member-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        onError(data.error ?? "Could not post progress");
        return;
      }
      setOpen(false);
      reset();
      onPosted();
    } finally {
      setPosting(false);
    }
  }

  const memorizing = activity === "memorizing";
  const revising = activity === "revising";
  const reciting = activity === "reciting";
  const canPost = memorizing
    ? memorizingSurahs.size > 0
    : revising
      ? revisingSurahs.size > 0
      : recitingSurahs.size > 0;

  const surahPanelTitle =
    memorizing ? "Surahs (memorising)" : revising ? "Surahs (revising)" : "Surahs (reciting)";

  const emptyOptionsHint = memorizing
    ? "You’ve marked every surah as memorised — nothing left to add here."
    : revising
      ? "Mark surahs as memorised first (onboarding or the memorising track) to revise them."
      : null;

  const activityPanelClass =
    "min-w-[min(92vw,20rem)] max-w-[min(92vw,22rem)] shrink-0 max-h-72 overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900";

  const surahPanelClass =
    "flex min-h-0 min-w-[min(94vw,22rem)] max-w-[min(94vw,24rem)] max-h-[min(72dvh,28rem)] shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
            reset();
          } else {
            reset();
            setOpen(true);
          }
        }}
        className="shrink-0 rounded-full border border-zinc-300/90 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-500 dark:bg-zinc-700/70 dark:text-zinc-100 dark:hover:bg-zinc-600/80"
      >
        I am…
      </button>

      {open ? (
        <div
          className="absolute bottom-full left-0 z-50 mb-2 flex max-w-[calc(100dvw-0.75rem)] flex-row flex-nowrap items-end gap-2 overflow-x-auto overflow-y-visible overscroll-x-contain pb-1 [scrollbar-width:thin]"
          role="presentation"
        >
          {step >= 1 ? (
            <div className={activityPanelClass} role="listbox" aria-label="Activity">
              <p className="border-b border-zinc-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                Activity
              </p>
              <button
                type="button"
                onClick={() => {
                  setActivity("memorizing");
                  setMemorizingSurahs(new Set());
                  setRevisingSurahs(new Set());
                  setRecitingSurahs(new Set());
                  setStep(2);
                }}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  activity === "memorizing" ? "bg-[#ebebeb] dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/80"
                }`}
              >
                Memorising
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivity("revising");
                  setMemorizingSurahs(new Set());
                  setRevisingSurahs(new Set());
                  setRecitingSurahs(new Set());
                  setStep(2);
                }}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  activity === "revising" ? "bg-[#ebebeb] dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/80"
                }`}
              >
                Revising
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivity("reciting");
                  setMemorizingSurahs(new Set());
                  setRevisingSurahs(new Set());
                  setRecitingSurahs(new Set());
                  setStep(2);
                }}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  activity === "reciting" ? "bg-[#ebebeb] dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/80"
                }`}
              >
                Reciting
              </button>
            </div>
          ) : null}

          {step >= 2 && activity ? (
            <div className={surahPanelClass}>
              <p className="shrink-0 border-b border-zinc-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                {surahPanelTitle}
              </p>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-2">
                {optionsForActivity.length === 0 ? (
                  <p className="py-6 text-center text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {emptyOptionsHint}
                  </p>
                ) : (
                  <SurahPickerListByJuz
                    options={optionsForActivity}
                    selected={memorizing ? memorizingSurahs : revising ? revisingSurahs : recitingSurahs}
                    onToggle={memorizing ? toggleMemorizingSurah : revising ? toggleRevisingSurah : toggleRecitingSurah}
                    listMaxHeightClass="max-h-[min(42dvh,14rem)] sm:max-h-[min(38dvh,13rem)]"
                  />
                )}
              </div>
              <div className="shrink-0 border-t border-zinc-100 p-2 dark:border-zinc-800">
                <button
                  type="button"
                  disabled={!canPost || posting || optionsForActivity.length === 0}
                  onClick={() => void post()}
                  className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  {posting ? "Posting…" : "Post update"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
