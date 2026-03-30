import { surahName } from "./surah-names";

export type ProgressActivity = "memorizing" | "revising";

export function formatProgressChatLine(
  activity: ProgressActivity,
  juz: number,
  surahIds: number[]
): string {
  const verb = activity === "memorizing" ? "memorising" : "revising";
  const detail = describeSurahSelection(surahIds);
  return `I am ${verb} Juz ${juz} — ${detail}`;
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
