import { AYAH_COUNT } from "./ayah-counts";

export type JuzSegment = { surah: number; from: number; to: number };

/** Standard mushaf juz boundaries: juz → inclusive [start surah, ayah] … [end surah, ayah]. */
const JUZ_ENDS: readonly { start: readonly [number, number]; end: readonly [number, number] }[] = [
  { start: [1, 1], end: [2, 141] },
  { start: [2, 142], end: [2, 252] },
  { start: [2, 253], end: [3, 92] },
  { start: [3, 93], end: [4, 23] },
  { start: [4, 24], end: [4, 147] },
  { start: [4, 148], end: [5, 81] },
  { start: [5, 82], end: [6, 110] },
  { start: [6, 111], end: [7, 87] },
  { start: [7, 88], end: [8, 40] },
  { start: [8, 41], end: [9, 92] },
  { start: [9, 93], end: [11, 5] },
  { start: [11, 6], end: [12, 52] },
  { start: [12, 53], end: [14, 52] },
  { start: [14, 53], end: [16, 128] },
  { start: [17, 1], end: [18, 74] },
  { start: [18, 75], end: [20, 135] },
  { start: [21, 1], end: [22, 78] },
  { start: [23, 1], end: [25, 20] },
  { start: [25, 21], end: [27, 55] },
  { start: [27, 56], end: [29, 45] },
  { start: [29, 46], end: [33, 30] },
  { start: [33, 31], end: [36, 27] },
  { start: [36, 28], end: [39, 31] },
  { start: [39, 32], end: [41, 46] },
  { start: [41, 47], end: [45, 37] },
  { start: [46, 1], end: [51, 30] },
  { start: [51, 31], end: [57, 29] },
  { start: [58, 1], end: [66, 12] },
  { start: [67, 1], end: [77, 50] },
  { start: [78, 1], end: [114, 6] },
];

function expandRange(start: readonly [number, number], end: readonly [number, number]): JuzSegment[] {
  const out: JuzSegment[] = [];
  let s = start[0];
  let a = start[1];
  const [es, ea] = end;
  while (true) {
    const surahMax = AYAH_COUNT[s] ?? 0;
    const segmentEnd = s === es ? ea : surahMax;
    if (segmentEnd < a || surahMax === 0) break;
    out.push({ surah: s, from: a, to: segmentEnd });
    if (s === es && segmentEnd === ea) break;
    s += 1;
    a = 1;
  }
  return out;
}

export function juzSegments(juz: number): JuzSegment[] {
  if (juz < 1 || juz > 30) return [];
  const r = JUZ_ENDS[juz - 1];
  return expandRange(r.start, r.end);
}

export function totalAyahsInJuz(juz: number): number {
  return juzSegments(juz).reduce((acc, g) => acc + (g.to - g.from + 1), 0);
}

export function uniqueSurahsInJuz(juz: number): number[] {
  const set = new Set<number>();
  for (const g of juzSegments(juz)) set.add(g.surah);
  return [...set].sort((a, b) => a - b);
}

/** Juz where this surah begins (ayah 1), 1–30. Long surahs span multiple juz; this is the opening juz. */
export function juzWhereSurahStarts(surah: number): number | null {
  if (surah < 1 || surah > 114) return null;
  for (let j = 1; j <= 30; j++) {
    for (const g of juzSegments(j)) {
      if (g.surah === surah && g.from <= 1 && g.to >= 1) return j;
    }
  }
  return null;
}

export function ayahsOfSurahWithinJuz(juz: number, surah: number): number {
  let n = 0;
  for (const g of juzSegments(juz)) {
    if (g.surah === surah) n += g.to - g.from + 1;
  }
  return n;
}

/** Share of the juz (by verse count) covered by selecting whole surah fragments that fall in this juz. */
export function percentOfJuzFromSelectedSurahs(juz: number, selectedSurahs: number[]): number {
  const total = totalAyahsInJuz(juz);
  if (total <= 0) return 0;
  const allowed = new Set(uniqueSurahsInJuz(juz));
  let covered = 0;
  for (const s of new Set(selectedSurahs)) {
    if (!allowed.has(s)) continue;
    covered += ayahsOfSurahWithinJuz(juz, s);
  }
  return Math.round((1000 * covered) / total) / 10;
}

export function validateSurahsBelongToJuz(juz: number, surahIds: number[]): boolean {
  const allowed = new Set(uniqueSurahsInJuz(juz));
  return surahIds.every((id) => allowed.has(id));
}

/** Smallest juz (1–30) that contains every surah in `surahIds`, or null if no single juz fits. */
export function inferSmallestJuzForSurahs(surahIds: number[]): number | null {
  const uniq = [...new Set(surahIds)].filter((n) => n >= 1 && n <= 114).sort((a, b) => a - b);
  if (uniq.length === 0) return null;
  for (let j = 1; j <= 30; j++) {
    if (validateSurahsBelongToJuz(j, uniq)) return j;
  }
  return null;
}
