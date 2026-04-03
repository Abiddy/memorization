import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMemorizationTimeline } from "@/lib/progress-aggregate";
import { juzWhereSurahStarts, percentQuranFromSurahIds, surahName } from "@/lib/quran";

const MEMBER_COOKIE = "alif_member_id";

function calendarDaysLeftUtc(endYmd: string): number {
  const [y, m, d] = endYmd.split("-").map(Number);
  if (!y || !m || !d) return 0;
  const end = Date.UTC(y, m - 1, d);
  const t = new Date();
  const start = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  return Math.max(0, Math.round((end - start) / 86400000));
}

function goalEntries(ids: number[]): { surahId: number; name: string }[] {
  const sorted = [...new Set(ids)].filter((n) => n >= 1 && n <= 114).sort((a, b) => a - b);
  return sorted.map((surahId) => ({ surahId, name: surahName(surahId) }));
}

type HeatmapActivity = "memorizing" | "revising" | "reciting";

type MpShape = {
  memorizing_surahs: number[];
  revising_surahs: number[];
  reciting_surahs: number[];
};

const HEATMAP_ACT_ORDER: HeatmapActivity[] = ["memorizing", "revising", "reciting"];

function pushHeatmapAct(surahs: (HeatmapActivity[] | null)[], surahNum: number, act: HeatmapActivity) {
  if (surahNum < 1 || surahNum > 114) return;
  if (!surahs[surahNum]) surahs[surahNum] = [];
  if (!surahs[surahNum]!.includes(act)) surahs[surahNum]!.push(act);
}

function buildHeatmap(
  members: { id: string; display_name: string }[],
  mpByMember: Map<string, MpShape>
) {
  const rows = [...members]
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
    .map((m) => {
      const mp = mpByMember.get(m.id);
      const surahs: (HeatmapActivity[] | null)[] = Array(115).fill(null);

      for (const s of mp?.memorizing_surahs ?? []) {
        if (s >= 1 && s <= 114) pushHeatmapAct(surahs, s, "memorizing");
      }
      for (const s of mp?.revising_surahs ?? []) {
        pushHeatmapAct(surahs, s, "revising");
      }
      for (const s of mp?.reciting_surahs ?? []) {
        pushHeatmapAct(surahs, s, "reciting");
      }

      for (let i = 1; i <= 114; i++) {
        const cell = surahs[i];
        if (cell && cell.length > 1) {
          cell.sort((a, b) => HEATMAP_ACT_ORDER.indexOf(a) - HEATMAP_ACT_ORDER.indexOf(b));
        }
      }

      return {
        member_id: m.id,
        display_name: m.display_name,
        surahs,
      };
    });

  let membersMemorising = 0;
  let membersRevising = 0;
  let membersReciting = 0;

  for (const row of rows) {
    let hasM = false;
    let hasR = false;
    let hasC = false;
    for (let i = 1; i <= 114; i++) {
      const acts = row.surahs[i];
      if (!acts) continue;
      if (acts.includes("memorizing")) hasM = true;
      if (acts.includes("revising")) hasR = true;
      if (acts.includes("reciting")) hasC = true;
    }
    if (hasM) membersMemorising++;
    if (hasR) membersRevising++;
    if (hasC) membersReciting++;
  }

  return {
    rows,
    summary: {
      membersMemorising,
      membersRevising,
      membersReciting,
      memberCount: members.length,
    },
  };
}

function dashboardSurahEntries(ids: number[]): { juz: number; surahId: number; name: string }[] {
  const sorted = [...new Set(ids)].filter((n) => n >= 1 && n <= 114).sort((a, b) => a - b);
  const out: { juz: number; surahId: number; name: string }[] = [];
  for (const surahId of sorted) {
    const juz = juzWhereSurahStarts(surahId);
    if (juz == null) continue;
    out.push({ juz, surahId, name: surahName(surahId) });
  }
  return out;
}

export async function GET() {
  const admin = createAdminClient();

  const { data: events, error: evError } = await admin
    .from("progress_events")
    .select("member_id, event_kind, juz, surah, created_at")
    .order("created_at", { ascending: true });

  if (evError) {
    return NextResponse.json({ error: evError.message }, { status: 500 });
  }

  const { data: members, error: memError } = await admin
    .from("members")
    .select("id, display_name, memorized_surah_ids");

  if (memError) {
    return NextResponse.json({ error: memError.message }, { status: 500 });
  }

  const nameById = new Map((members ?? []).map((m) => [m.id, m.display_name]));

  const flat =
    events?.map((row) => ({
      member_id: row.member_id,
      display_name: nameById.get(row.member_id) ?? "Unknown",
      event_kind: row.event_kind,
      juz: row.juz,
      surah: row.surah,
      created_at: row.created_at,
    })) ?? [];

  const { clubSeries, projection, memberTrajectories } = buildMemorizationTimeline(flat);

  const leaderboard = (members ?? []).map((m) => ({
    member_id: m.id,
    display_name: m.display_name,
    pct_quran: percentQuranFromSurahIds((m.memorized_surah_ids as number[] | null) ?? []),
  }));
  leaderboard.sort((a, b) => b.pct_quran - a.pct_quran || a.display_name.localeCompare(b.display_name));

  const { data: mpRows, error: mpError } = await admin.from("member_progress").select(
    "member_id, memorizing_surahs, revising_surahs, reciting_surahs, updated_at"
  );

  if (mpError) {
    return NextResponse.json({ error: mpError.message }, { status: 500 });
  }

  const mpByMember = new Map(
    (mpRows ?? []).map((r) => [
      r.member_id,
      {
        memorizing_surahs: (r.memorizing_surahs as number[] | null) ?? [],
        revising_surahs: (r.revising_surahs as number[] | null) ?? [],
        reciting_surahs: (r.reciting_surahs as number[] | null) ?? [],
      },
    ])
  );

  const dashboard = (members ?? []).map((m) => {
    const mp = mpByMember.get(m.id);
    const pctQuran = percentQuranFromSurahIds((m.memorized_surah_ids as number[] | null) ?? []);
    return {
      member_id: m.id,
      display_name: m.display_name,
      revising: dashboardSurahEntries(mp?.revising_surahs ?? []),
      memorising: dashboardSurahEntries(mp?.memorizing_surahs ?? []),
      reciting: dashboardSurahEntries(mp?.reciting_surahs ?? []),
      pct_quran: pctQuran,
    };
  });
  dashboard.sort((a, b) => a.display_name.localeCompare(b.display_name));

  const heatmap = buildHeatmap(
    (members ?? []).map((m) => ({ id: m.id, display_name: m.display_name })),
    mpByMember as Map<string, MpShape>
  );

  const cookieStore = await cookies();
  const selfId = cookieStore.get(MEMBER_COOKIE)?.value;
  type GoalTrack = {
    entries: { surahId: number; name: string }[];
    targetEnd: string;
    daysLeft: number;
  };

  let me: {
    needsOnboarding: boolean;
    goals: {
      memorizing: GoalTrack;
      revising: GoalTrack;
      reciting: GoalTrack;
    } | null;
  } | null = null;

  if (selfId) {
    let needsOnboarding = false;
    let goalsPayload: {
      memorizing: GoalTrack;
      revising: GoalTrack;
      reciting: GoalTrack;
    } | null = null;

    const { data: selfRow, error: selfErr } = await admin
      .from("members")
      .select("onboarding_completed_at")
      .eq("id", selfId)
      .maybeSingle();

    if (!selfErr && selfRow) {
      needsOnboarding = selfRow.onboarding_completed_at == null;
    }

    const { data: goalRow, error: goalErr } = await admin
      .from("member_goals")
      .select("*")
      .eq("member_id", selfId)
      .maybeSingle();

    if (!goalErr && goalRow) {
      const r = goalRow as Record<string, unknown>;
      const legacy = typeof r.target_end === "string" ? r.target_end : undefined;
      const mEnd =
        (typeof r.memorize_target_end === "string" ? r.memorize_target_end : undefined) ?? legacy;
      const revEnd =
        (typeof r.revise_target_end === "string" ? r.revise_target_end : undefined) ?? legacy;
      const recEnd =
        (typeof r.recite_target_end === "string" ? r.recite_target_end : undefined) ?? legacy;
      if (mEnd && revEnd && recEnd) {
        goalsPayload = {
          memorizing: {
            entries: goalEntries((goalRow.memorizing_surah_ids as number[] | null) ?? []),
            targetEnd: mEnd,
            daysLeft: calendarDaysLeftUtc(mEnd),
          },
          revising: {
            entries: goalEntries((goalRow.revising_surah_ids as number[] | null) ?? []),
            targetEnd: revEnd,
            daysLeft: calendarDaysLeftUtc(revEnd),
          },
          reciting: {
            entries: goalEntries((goalRow.reciting_surah_ids as number[] | null) ?? []),
            targetEnd: recEnd,
            daysLeft: calendarDaysLeftUtc(recEnd),
          },
        };
      }
    }

    me = { needsOnboarding, goals: goalsPayload };
  }

  return NextResponse.json({
    leaderboard,
    clubSeries,
    projection,
    memberTrajectories,
    dashboard,
    heatmap,
    me,
  });
}
