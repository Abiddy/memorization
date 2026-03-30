"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { surahName, uniqueSurahsInJuz, type ProgressActivity } from "@/lib/quran";

type Step = 1 | 2 | 3;

export function StructuredProgressPicker({
  onPosted,
  onError,
}: {
  onPosted: () => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [activity, setActivity] = useState<ProgressActivity | null>(null);
  const [juz, setJuz] = useState<number | null>(null);
  /** Memorising: exactly one surah. */
  const [memorizingSurah, setMemorizingSurah] = useState<number | null>(null);
  /** Revising: one or more surahs. */
  const [revisingSurahs, setRevisingSurahs] = useState<Set<number>>(new Set());
  const [posting, setPosting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    setStep(1);
    setActivity(null);
    setJuz(null);
    setMemorizingSurah(null);
    setRevisingSurahs(new Set());
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

  function toggleRevisingSurah(id: number) {
    setRevisingSurahs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function post() {
    if (!activity || juz == null) return;
    if (activity === "memorizing") {
      if (memorizingSurah == null) return;
    } else if (revisingSurahs.size === 0) {
      return;
    }

    setPosting(true);
    try {
      const body =
        activity === "memorizing"
          ? { track: "memorizing" as const, active_juz: juz, surah_id: memorizingSurah! }
          : { track: "revising" as const, active_juz: juz, surah_ids: [...revisingSurahs] };

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

  const surahsInJuz = juz != null ? uniqueSurahsInJuz(juz) : [];
  const memorizing = activity === "memorizing";
  const canPost = memorizing ? memorizingSurah != null : revisingSurahs.size > 0;

  const panelClass =
    "min-w-[200px] shrink-0 max-h-72 overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900";

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
            <div className={panelClass} role="listbox" aria-label="Activity">
              <p className="border-b border-zinc-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                Activity
              </p>
              <button
                type="button"
                onClick={() => {
                  setActivity("memorizing");
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
                  setStep(2);
                }}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  activity === "revising" ? "bg-[#ebebeb] dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/80"
                }`}
              >
                Revising
              </button>
            </div>
          ) : null}

          {step >= 2 && activity ? (
            <div className={panelClass} role="listbox" aria-label="Juz">
              <p className="border-b border-zinc-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                {memorizing ? "Juz (memorising)" : "Juz (revising)"}
              </p>
              {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                <button
                  key={j}
                  type="button"
                  onClick={() => {
                    setJuz(j);
                    setMemorizingSurah(null);
                    setRevisingSurahs(new Set());
                    setStep(3);
                  }}
                  className={`block w-full px-3 py-2 text-left text-sm tabular-nums ${
                    juz === j ? "bg-[#ebebeb] dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/80"
                  }`}
                >
                  Juz {j}
                </button>
              ))}
            </div>
          ) : null}

          {step >= 3 && activity && juz != null ? (
            <div className={`${panelClass} min-w-[240px]`}>
              <p className="border-b border-zinc-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                {memorizing ? `Surah in Juz ${juz} (pick one)` : `Surahs in Juz ${juz}`}
              </p>
              <div className="max-h-48 overflow-y-auto">
                {surahsInJuz.map((s) => {
                  if (memorizing) {
                    const on = memorizingSurah === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setMemorizingSurah(s)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                          on ? "bg-[#ebebeb] dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/80"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                            on ? "border-emerald-600 bg-emerald-600" : "border-zinc-300 dark:border-zinc-600"
                          }`}
                          aria-hidden
                        />
                        <span>
                          {s}. {surahName(s)}
                        </span>
                      </button>
                    );
                  }
                  const on = revisingSurahs.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleRevisingSurah(s)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                        on ? "bg-[#ebebeb] dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/80"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                          on
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-zinc-300 dark:border-zinc-600"
                        }`}
                        aria-hidden
                      >
                        {on ? "✓" : ""}
                      </span>
                      <span>
                        {s}. {surahName(s)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-zinc-100 p-2 dark:border-zinc-800">
                <button
                  type="button"
                  disabled={!canPost || posting}
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
