import { surahName } from "./surah-names";

export type ProgressActivity = "memorizing" | "revising" | "reciting";

/** Optional `juz` is for the chat line only when the user picked a juz in the picker; not a DB constraint. */
export function formatProgressChatLine(
  activity: ProgressActivity,
  surahIds: number[],
  juz?: number
): string {
  const verb =
    activity === "memorizing" ? "memorising" : activity === "revising" ? "revising" : "reciting";
  const detail = describeSurahSelection(surahIds);
  if (juz != null) {
    return `I am ${verb} Juz ${juz} — ${detail}`;
  }
  return `I am ${verb} — ${detail}`;
}

export function formatProgressEventSummary(activity: ProgressActivity, surahIds: number[]): string {
  const sorted = [...new Set(surahIds)].filter((n) => n >= 1 && n <= 114).sort((a, b) => a - b);
  const label =
    activity === "memorizing" ? "Memorising" : activity === "revising" ? "Revising" : "Reciting";
  if (sorted.length === 0) return `${label}`;
  return `${label}: ${sorted.map((id) => surahName(id)).join(", ")}`;
}

function describeSurahSelection(ids: number[]): string {
  const sorted = [...new Set(ids)].filter((n) => n >= 1 && n <= 114).sort((a, b) => a - b);
  if (sorted.length === 0) return "surahs not specified";
  if (sorted.length === 1) {
    return `from Surah ${surahName(sorted[0]!)}`;
  }
  let contiguous = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1]! + 1) {
      contiguous = false;
      break;
    }
  }
  if (contiguous) {
    return `from Surah ${surahName(sorted[0]!)} to Surah ${surahName(sorted[sorted.length - 1]!)}`;
  }
  return `Surahs: ${sorted.map((s) => surahName(s)).join(", ")}`;
}
