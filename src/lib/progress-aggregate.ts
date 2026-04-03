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

/** Distinct surahs logged under memorising by this calendar day (cumulative set size). */
export type MemberSeriesPoint = {
  date: string;
  surahs: number;
};

export type MemberProjectionPoint = {
  date: string;
  surahs: number;
  projected: true;
};

export type MemberTrajectory = {
  member_id: string;
  display_name: string;
  recorded: MemberSeriesPoint[];
  projection: MemberProjectionPoint[];
};

type EventRow = {
  member_id: string;
  display_name: string;
  event_kind?: string | null;
  juz: number | null;
  surah: string | null;
  created_at: string;
};

/** One row per club member — used so everyone appears on memorisation charts. */
export type MemberProfile = {
  member_id: string;
  display_name: string;
  memorized_surah_ids: number[];
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

type ProjectionClamp = { min: number; max: number; roundToInt?: boolean };

function projectionFromSeries<T extends { date: string }>(
  points: T[],
  getY: (p: T) => number,
  clamp: ProjectionClamp
): { date: string; value: number; projected: true }[] {
  if (points.length < 2) return [];
  const take = points.slice(-14);
  const xs = take.map((_, i) => i);
  const ys = take.map((p) => getY(p));
  const { slope, intercept } = linearRegression(xs, ys);
  const lastDay = new Date(`${take[take.length - 1]!.date}T00:00:00.000Z`);
  const startIndex = take.length;
  const out: { date: string; value: number; projected: true }[] = [];
  for (let k = 1; k <= 10; k++) {
    const t = startIndex + k - 1;
    let y = slope * t + intercept;
    y = Math.min(clamp.max, Math.max(clamp.min, y));
    const d = new Date(lastDay);
    d.setUTCDate(d.getUTCDate() + k);
    const value = clamp.roundToInt ? Math.round(y) : Math.round(y * 10) / 10;
    out.push({
      date: d.toISOString().slice(0, 10),
      value,
      projected: true,
    });
  }
  return out;
}

/**
 * Club % series from memorising chat/onboarding events (union of surahs per member).
 * Per-member trajectories: **completed memorisation** = distinct surahs that count toward % Quran,
 * replayed from `memorizing` progress events, then aligned to current `memorized_surah_ids` so every
 * member appears (flat line at 0 if no data).
 */
export function buildMemorizationTimeline(
  events: EventRow[],
  memberProfiles: MemberProfile[]
): {
  clubSeries: ClubPoint[];
  projection: ProjectionPoint[];
  memberTrajectories: MemberTrajectory[];
} {
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const nameByMember = new Map<string, string>();
  for (const p of memberProfiles) {
    nameByMember.set(p.member_id, p.display_name);
  }
  const memorizedByMember = new Map<string, Set<number>>();
  const dayToClubPct = new Map<string, number>();
  /** memberId -> day -> max distinct memorised surah count that calendar day. */
  const memberDayToSurahs = new Map<string, Map<string, number>>();

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

        const day = dayKey(e.created_at);
        let dayMap = memberDayToSurahs.get(e.member_id);
        if (!dayMap) {
          dayMap = new Map();
          memberDayToSurahs.set(e.member_id, dayMap);
        }
        const count = set.size;
        const prevM = dayMap.get(day) ?? 0;
        dayMap.set(day, Math.max(prevM, count));
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

  const projection: ProjectionPoint[] =
    clubSeries.length >= 2
      ? projectionFromSeries(clubSeries, (p) => p.clubPct, { min: 0, max: 100 }).map((p) => ({
          date: p.date,
          clubPct: p.value,
          projected: true,
        }))
      : [];

  const todayUtc = new Date().toISOString().slice(0, 10);

  const memberTrajectories: MemberTrajectory[] = [];
  for (const m of memberProfiles) {
    const memberId = m.member_id;
    const displayName = m.display_name;
    const dbCount = [
      ...new Set((m.memorized_surah_ids ?? []).filter((n) => Number.isFinite(n) && n >= 1 && n <= 114)),
    ].length;
    const createdDay = dayKey(m.created_at);

    const dayMap = memberDayToSurahs.get(memberId);
    let recorded: MemberSeriesPoint[] =
      dayMap && dayMap.size > 0
        ? Array.from(dayMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, surahs]) => ({ date, surahs }))
        : [];

    if (recorded.length > 0 && recorded[0]!.date > createdDay) {
      recorded = [{ date: createdDay, surahs: 0 }, ...recorded];
    }

    if (recorded.length === 0) {
      recorded = [
        { date: createdDay, surahs: 0 },
        { date: todayUtc, surahs: dbCount },
      ];
    } else {
      const last = recorded[recorded.length - 1]!;
      const finalCount = Math.max(last.surahs, dbCount);
      if (last.date < todayUtc) {
        recorded = [...recorded, { date: todayUtc, surahs: finalCount }];
      } else {
        recorded = [...recorded.slice(0, -1), { date: last.date, surahs: finalCount }];
      }
    }

    memberTrajectories.push({
      member_id: memberId,
      display_name: displayName,
      recorded,
      projection: [],
    });
  }
  memberTrajectories.sort((a, b) => a.display_name.localeCompare(b.display_name));

  return { clubSeries, projection, memberTrajectories };
}
