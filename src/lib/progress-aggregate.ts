export type ProgressEventKind = "completed" | "memorizing" | "revising";

export type LeaderboardRow = {
  member_id: string;
  display_name: string;
  max_juz: number;
};

export type FocusRow = {
  member_id: string;
  display_name: string;
  juz: number;
  event_kind: "memorizing" | "revising";
};

export type ClubPoint = {
  date: string;
  clubMaxJuz: number;
};

export type ProjectionPoint = {
  date: string;
  clubMaxJuz: number;
  projected: true;
};

type EventRow = {
  member_id: string;
  display_name: string;
  event_kind?: ProgressEventKind | null;
  juz: number | null;
  created_at: string;
};

function kindOf(e: EventRow): ProgressEventKind {
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

function buildFocus(events: EventRow[]): FocusRow[] {
  const rev = [...events].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const seen = new Set<string>();
  const out: FocusRow[] = [];
  for (const e of rev) {
    if (seen.has(e.member_id)) continue;
    const k = kindOf(e);
    if ((k === "memorizing" || k === "revising") && e.juz != null && Number.isFinite(e.juz)) {
      seen.add(e.member_id);
      out.push({
        member_id: e.member_id,
        display_name: e.display_name,
        juz: e.juz,
        event_kind: k,
      });
    }
  }
  out.sort((a, b) => a.display_name.localeCompare(b.display_name));
  return out;
}

export function buildProgressReport(events: EventRow[]): {
  leaderboard: LeaderboardRow[];
  focus: FocusRow[];
  clubSeries: ClubPoint[];
  projection: ProjectionPoint[];
} {
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const runningMax = new Map<string, number>();
  const nameByMember = new Map<string, string>();
  const dayToClubMax = new Map<string, number>();

  for (const e of sorted) {
    nameByMember.set(e.member_id, e.display_name);
    if (kindOf(e) === "completed" && e.juz != null && Number.isFinite(e.juz)) {
      const prev = runningMax.get(e.member_id) ?? 0;
      runningMax.set(e.member_id, Math.max(prev, e.juz));
    }
    const day = dayKey(e.created_at);
    const clubMax = Math.max(...runningMax.values(), 0);
    dayToClubMax.set(day, clubMax);
  }

  const leaderboard: LeaderboardRow[] = Array.from(nameByMember.entries()).map(([member_id, display_name]) => ({
    member_id,
    display_name,
    max_juz: runningMax.get(member_id) ?? 0,
  }));
  leaderboard.sort((a, b) => b.max_juz - a.max_juz || a.display_name.localeCompare(b.display_name));

  const focus = buildFocus(sorted);

  const clubSeries: ClubPoint[] = Array.from(dayToClubMax.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, clubMaxJuz]) => ({ date, clubMaxJuz }));

  const projection: ProjectionPoint[] = [];
  if (clubSeries.length >= 2) {
    const take = clubSeries.slice(-14);
    const xs = take.map((_, i) => i);
    const ys = take.map((p) => p.clubMaxJuz);
    const { slope, intercept } = linearRegression(xs, ys);
    const lastDay = new Date(`${take[take.length - 1]!.date}T00:00:00.000Z`);
    const startIndex = take.length;
    for (let k = 1; k <= 10; k++) {
      const t = startIndex + k - 1;
      let y = slope * t + intercept;
      y = Math.min(30, Math.max(0, y));
      const d = new Date(lastDay);
      d.setUTCDate(d.getUTCDate() + k);
      projection.push({
        date: d.toISOString().slice(0, 10),
        clubMaxJuz: Math.round(y * 10) / 10,
        projected: true,
      });
    }
  }

  return { leaderboard, focus, clubSeries, projection };
}
