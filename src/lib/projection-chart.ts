import type { MemberTrajectory } from "@/lib/progress-aggregate";

const TRAJECTORY_PALETTE = [
  "#047857",
  "#2563eb",
  "#b45309",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#4f46e5",
  "#65a30d",
  "#ea580c",
  "#0d9488",
  "#c026d3",
  "#ca8a04",
  "#16a34a",
  "#9333ea",
];

/** YYYY-MM-DD for “today” in UTC — matches stored progress day keys. */
function utcTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateToYm(ymd: string): string {
  return ymd.slice(0, 7);
}

/** Last calendar day of month `YYYY-MM` (UTC). */
function lastDayOfMonthYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

/** Add `deltaMonths` to `YYYY-MM` (UTC calendar month). */
function addMonthsUtcYm(baseYm: string, deltaMonths: number): string {
  const y = Number(baseYm.slice(0, 4));
  const m = Number(baseYm.slice(5, 7));
  if (!y || !m) return baseYm;
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return d.toISOString().slice(0, 7);
}

/** Memorisation chart X-axis: April 2026 → +4 months (product anchor). */
const MEMO_CHART_START_YM = "2026-04";

function getFiveMonthWindowFromApril2026(): string[] {
  return Array.from({ length: 5 }, (_, k) => addMonthsUtcYm(MEMO_CHART_START_YM, k));
}

/** Cutoff YYYY-MM-DD for cumulative count for month `ym` (UTC). Only for `ym <= todayYm`. */
function memorisationCutoffYmd(ym: string, todayYmd: string): string {
  const todayYm = todayYmd.slice(0, 7);
  if (ym < todayYm) return lastDayOfMonthYm(ym);
  if (ym === todayYm) return todayYmd;
  return lastDayOfMonthYm(ym);
}

function memorisationValueForMonth(
  ym: string,
  todayYmd: string,
  recorded: { date: string; surahs: number }[],
  memberSinceYmd: string
): number | null {
  const todayYm = todayYmd.slice(0, 7);
  if (ym > todayYm) return null;
  const cutoff = memorisationCutoffYmd(ym, todayYmd);
  if (cutoff < memberSinceYmd) return null;
  return surahsOnOrBefore(recorded, cutoff);
}

export function formatMonthLongNameFromYm(ym: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${ym}-01T00:00:00.000Z`));
  } catch {
    return ym;
  }
}

/** Inclusive list of `YYYY-MM` from `fromYm` through `toYm`. */
function enumerateMonthsInclusive(fromYm: string, toYm: string): string[] {
  if (fromYm > toYm) return [toYm];
  const out: string[] = [];
  let y = Number(fromYm.slice(0, 4));
  let mo = Number(fromYm.slice(5, 7));
  const endY = Number(toYm.slice(0, 4));
  const endM = Number(toYm.slice(5, 7));
  if (!y || !mo || !endY || !endM) return [toYm];
  while (y < endY || (y === endY && mo <= endM)) {
    out.push(`${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}`);
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  return out;
}

/** `recorded` sorted by `date` ascending — cumulative surahs memorised on or before `ymd`. */
function surahsOnOrBefore(recorded: { date: string; surahs: number }[], ymd: string): number {
  let v = 0;
  for (const p of recorded) {
    if (p.date <= ymd) v = p.surahs;
    else break;
  }
  return v;
}

export function formatMonthTickFromYm(ym: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`${ym}-15T00:00:00.000Z`));
  } catch {
    return ym;
  }
}

export type TrajectoryLineSpec = {
  dataKey: string;
  name: string;
  stroke: string;
  dashed?: boolean;
};

export const SURAH_CHART_MAX = 114;
export const SURAH_Y_TICKS = [0, 19, 38, 57, 76, 95, 114];

/**
 * Equal-spaced months on the X axis; Y = cumulative completed memorisation (distinct surahs toward % Quran).
 */
export function buildProjectionChart(
  trajs: MemberTrajectory[],
  scope: "you" | "all",
  selfId: string | undefined
): {
  rows: Record<string, string | number | undefined>[];
  lines: TrajectoryLineSpec[];
  sortedDates: string[];
  xTicks: number[];
} {
  if (trajs.length === 0) return { rows: [], lines: [], sortedDates: [], xTicks: [] };

  const list =
    scope === "you"
      ? selfId
        ? trajs.filter((t) => t.member_id === selfId)
        : []
      : [...trajs].sort((a, b) => a.display_name.localeCompare(b.display_name));

  if (list.length === 0) return { rows: [], lines: [], sortedDates: [], xTicks: [] };

  const todayYm = utcTodayIso().slice(0, 7);
  let minYm = todayYm;
  for (const t of list) {
    for (const p of t.recorded) {
      const ym = dateToYm(p.date);
      if (ym < minYm) minYm = ym;
    }
  }
  const cap = new Date();
  cap.setUTCFullYear(cap.getUTCFullYear() - 3);
  const capYm = cap.toISOString().slice(0, 7);
  if (minYm < capYm) minYm = capYm;

  const months = enumerateMonthsInclusive(minYm, todayYm);
  if (months.length === 0) return { rows: [], lines: [], sortedDates: [], xTicks: [] };

  const rows: Record<string, string | number | undefined>[] = months.map((ym, monthIndex) => {
    const monthEnd = lastDayOfMonthYm(ym);
    const row: Record<string, string | number | undefined> = {
      monthIndex,
      monthYm: ym,
    };
    for (const t of list) {
      row[`s_${t.member_id}`] = surahsOnOrBefore(t.recorded, monthEnd);
    }
    return row;
  });

  const sortedIds = list.map((t) => t.member_id);
  const lines: TrajectoryLineSpec[] = list.map((t) => ({
    dataKey: `s_${t.member_id}`,
    name: t.display_name,
    stroke: TRAJECTORY_PALETTE[sortedIds.indexOf(t.member_id) % TRAJECTORY_PALETTE.length] ?? "#047857",
  }));

  const n = months.length;
  const step = n > 20 ? Math.ceil(n / 10) : n > 14 ? 2 : 1;
  const xTicks: number[] = [];
  for (let i = 0; i < n; i += step) xTicks.push(i);
  if (xTicks[xTicks.length - 1] !== n - 1) xTicks.push(n - 1);

  return { rows, lines, sortedDates: months, xTicks };
}

/**
 * Five months on the X axis starting **April 2026** (UTC): Apr → Aug 2026.
 * Y = cumulative surahs toward % Quran; **null** before the member’s `member_since_ymd` or after “today”.
 */
export function buildFiveMonthMemorisationChart(
  trajs: MemberTrajectory[],
  scope: "you" | "all",
  selfId: string | undefined
): {
  rows: Record<string, string | number | null | undefined>[];
  lines: TrajectoryLineSpec[];
  sortedDates: string[];
  xTicks: number[];
} {
  if (trajs.length === 0) return { rows: [], lines: [], sortedDates: [], xTicks: [] };

  const list =
    scope === "you"
      ? selfId
        ? trajs.filter((t) => t.member_id === selfId)
        : []
      : [...trajs].sort((a, b) => a.display_name.localeCompare(b.display_name));

  if (list.length === 0) return { rows: [], lines: [], sortedDates: [], xTicks: [] };

  const todayYmd = utcTodayIso();
  const monthYms = getFiveMonthWindowFromApril2026();
  const rows: Record<string, string | number | null | undefined>[] = monthYms.map((ym, monthIndex) => {
    const row: Record<string, string | number | null | undefined> = {
      monthIndex,
      monthYm: ym,
    };
    for (const t of list) {
      const since = t.member_since_ymd ?? t.recorded[0]?.date ?? todayYmd;
      const v = memorisationValueForMonth(ym, todayYmd, t.recorded, since);
      row[`s_${t.member_id}`] = v === null ? null : v;
    }
    return row;
  });

  const sortedIds = list.map((t) => t.member_id);
  const lines: TrajectoryLineSpec[] = list.map((t) => ({
    dataKey: `s_${t.member_id}`,
    name: t.display_name,
    stroke: TRAJECTORY_PALETTE[sortedIds.indexOf(t.member_id) % TRAJECTORY_PALETTE.length] ?? "#047857",
  }));

  return { rows, lines, sortedDates: monthYms, xTicks: [0, 1, 2, 3, 4] };
}

export type FiveMonthMemorisationChartData = ReturnType<typeof buildFiveMonthMemorisationChart>;
