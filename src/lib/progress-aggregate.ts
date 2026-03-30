import { percentQuranFromSurahIds } from "@/lib/quran";

export type LeaderboardRow = {
  member_id: string;
  display_name: string;
  pct_quran: number;
};

export type ClubPoint = {
  date: string;
  clubPct: number;
};

export type ProjectionPoint = {
  date: string;
  clubPct: number;
  projected: true;
};

type EventRow = {
  member_id: string;
  display_name: string;
  event_kind?: string | null;
  juz: number | null;
  surah: string | null;
  created_at: string;
};

function kindOf(e: EventRow): string {
  return e.event_kind ?? "completed";
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  return { slope, intercept };
}

/** Parse "1,2,3" / "1 2 3" from progress_events.surah */
function parseSurahIdsFromEventField(s: string | null | undefined): number[] {
  if (s == null || s.trim() === "") return [];
  const parts = s.split(/[,;\s]+/).map((t) => parseInt(t.trim(), 10));
  return [...new Set(parts.filter((n) => Number.isFinite(n) && n >= 1 && n <= 114))];
}

function clubMaxPctQuran(memorizedByMember: Map<string, Set<number>>, memberIds: string[]): number {
  let max = 0;
  for (const id of memberIds) {
    const set = memorizedByMember.get(id);
    if (!set || set.size === 0) continue;
    max = Math.max(max, percentQuranFromSurahIds([...set]));
  }
  return max;
}

/**
 * Timeline from memorising events only: union surahs per member over time (order ≠ completion).
 * Revising events do not add to memorised coverage.
 */
export function buildMemorizationTimeline(events: EventRow[]): {
  clubSeries: ClubPoint[];
  projection: ProjectionPoint[];
} {
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const nameByMember = new Map<string, string>();
  const memorizedByMember = new Map<string, Set<number>>();
  const dayToClubPct = new Map<string, number>();

  for (const e of sorted) {
    nameByMember.set(e.member_id, e.display_name);
    if (kindOf(e) === "memorizing") {
      const ids = parseSurahIdsFromEventField(e.surah);
      if (ids.length > 0) {
        let set = memorizedByMember.get(e.member_id);
        if (!set) {
          set = new Set<number>();
          memorizedByMember.set(e.member_id, set);
        }
        for (const id of ids) set.add(id);
      }
    }
    const day = dayKey(e.created_at);
    const clubPct = clubMaxPctQuran(memorizedByMember, [...nameByMember.keys()]);
    const prev = dayToClubPct.get(day) ?? 0;
    dayToClubPct.set(day, Math.max(prev, clubPct));
  }

  const clubSeries: ClubPoint[] = Array.from(dayToClubPct.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, clubPct]) => ({ date, clubPct }));

  const projection: ProjectionPoint[] = [];
  if (clubSeries.length >= 2) {
    const take = clubSeries.slice(-14);
    const xs = take.map((_, i) => i);
    const ys = take.map((p) => p.clubPct);
    const { slope, intercept } = linearRegression(xs, ys);
    const lastDay = new Date(`${take[take.length - 1]!.date}T00:00:00.000Z`);
    const startIndex = take.length;
    for (let k = 1; k <= 10; k++) {
      const t = startIndex + k - 1;
      let y = slope * t + intercept;
      y = Math.min(100, Math.max(0, y));
      const d = new Date(lastDay);
      d.setUTCDate(d.getUTCDate() + k);
      projection.push({
        date: d.toISOString().slice(0, 10),
        clubPct: Math.round(y * 10) / 10,
        projected: true,
      });
    }
  }

  return { clubSeries, projection };
}
