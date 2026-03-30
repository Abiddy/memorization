import { AYAH_COUNT } from "./ayah-counts";

const TOTAL_QURAN_AYAHS = AYAH_COUNT.slice(1).reduce((a, b) => a + b, 0);

/** Share of the full Quran (by verse count) covered by treating whole surahs as memorised. */
export function percentQuranFromSurahIds(surahIds: number[]): number {
  if (TOTAL_QURAN_AYAHS <= 0) return 0;
  const uniq = [...new Set(surahIds)].filter((n) => n >= 1 && n <= 114);
  let ayahs = 0;
  for (const s of uniq) ayahs += AYAH_COUNT[s] ?? 0;
  return Math.round((1000 * ayahs) / TOTAL_QURAN_AYAHS) / 10;
}

export function totalQuranAyahs(): number {
  return TOTAL_QURAN_AYAHS;
}
