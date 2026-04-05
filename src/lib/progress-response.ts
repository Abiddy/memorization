import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMemorizationTimeline,
  type MemberProfile,
  type MemberTrajectory,
} from "@/lib/progress-aggregate";
import { juzWhereSurahStarts, percentQuranFromSurahIds, surahName } from "@/lib/quran";
import type { HeatmapPayload } from "@/app/components/surah-heatmap-panel";

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

function buildHeatmap(members: { id: string; display_name: string }[], mpByMember: Map<string, MpShape>) {
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

export type AggregatedProgressPayload = {
  leaderboard: { member_id: string; display_name: string; pct_quran: number }[];
  clubSeries: { date: string; clubPct: number }[];
  projection: { date: string; clubPct: number; projected: true }[];
  memberTrajectories: MemberTrajectory[];
  dashboard: {
    member_id: string;
    display_name: string;
    revising: ReturnType<typeof dashboardSurahEntries>;
    memorising: ReturnType<typeof dashboardSurahEntries>;
    reciting: ReturnType<typeof dashboardSurahEntries>;
    completed_memorising: ReturnType<typeof dashboardSurahEntries>;
    completed_revising: ReturnType<typeof dashboardSurahEntries>;
    completed_reciting: ReturnType<typeof dashboardSurahEntries>;
    pct_quran: number;
  }[];
  heatmap: HeatmapPayload;
};

const emptyHeatmap: HeatmapPayload = {
  rows: [],
  summary: {
    membersMemorising: 0,
    membersRevising: 0,
    membersReciting: 0,
    memberCount: 0,
  },
};

export async function fetchAggregatedProgress(
  admin: SupabaseClient,
  memberIds: string[]
): Promise<{ ok: true; data: AggregatedProgressPayload } | { ok: false; error: string }> {
  if (memberIds.length === 0) {
    return {
      ok: true,
      data: {
        leaderboard: [],
        clubSeries: [],
        projection: [],
        memberTrajectories: [],
        dashboard: [],
        heatmap: emptyHeatmap,
      },
    };
  }

  const { data: events, error: evError } = await admin
    .from("progress_events")
    .select("member_id, event_kind, juz, surah, created_at")
    .in("member_id", memberIds)
    .order("created_at", { ascending: true });

  if (evError) {
    return { ok: false, error: evError.message };
  }

  const { data: members, error: memError } = await admin
    .from("members")
    .select("id, display_name, memorized_surah_ids, created_at")
    .in("id", memberIds);

  if (memError) {
    return { ok: false, error: memError.message };
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

  const memberProfiles: MemberProfile[] = (members ?? []).map((m) => ({
    member_id: m.id,
    display_name: m.display_name,
    memorized_surah_ids: ((m.memorized_surah_ids as number[] | null) ?? []).filter(
      (n) => n >= 1 && n <= 114
    ),
    created_at: m.created_at as string,
  }));

  const { clubSeries, projection, memberTrajectories } = buildMemorizationTimeline(flat, memberProfiles);

  const leaderboard = (members ?? []).map((m) => ({
    member_id: m.id,
    display_name: m.display_name,
    pct_quran: percentQuranFromSurahIds((m.memorized_surah_ids as number[] | null) ?? []),
  }));
  leaderboard.sort((a, b) => b.pct_quran - a.pct_quran || a.display_name.localeCompare(b.display_name));

  const { data: mpRows, error: mpError } = await admin
    .from("member_progress")
    .select(
      "member_id, memorizing_surahs, revising_surahs, reciting_surahs, completed_memorizing_surahs, completed_revising_surahs, completed_reciting_surahs, updated_at"
    )
    .in("member_id", memberIds);

  if (mpError) {
    return { ok: false, error: mpError.message };
  }

  type MpRow = {
    memorizing_surahs: number[];
    revising_surahs: number[];
    reciting_surahs: number[];
    completed_memorizing_surahs: number[];
    completed_revising_surahs: number[];
    completed_reciting_surahs: number[];
  };

  const mpByMember = new Map(
    (mpRows ?? []).map((r) => {
      const x = r as Record<string, unknown>;
      const nums = (k: string) => ((x[k] as number[] | null | undefined) ?? []) as number[];
      return [
        r.member_id,
        {
          memorizing_surahs: (r.memorizing_surahs as number[] | null) ?? [],
          revising_surahs: (r.revising_surahs as number[] | null) ?? [],
          reciting_surahs: (r.reciting_surahs as number[] | null) ?? [],
          completed_memorizing_surahs: nums("completed_memorizing_surahs"),
          completed_revising_surahs: nums("completed_revising_surahs"),
          completed_reciting_surahs: nums("completed_reciting_surahs"),
        } satisfies MpRow,
      ] as [string, MpRow];
    })
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
      completed_memorising: dashboardSurahEntries(mp?.completed_memorizing_surahs ?? []),
      completed_revising: dashboardSurahEntries(mp?.completed_revising_surahs ?? []),
      completed_reciting: dashboardSurahEntries(mp?.completed_reciting_surahs ?? []),
      pct_quran: pctQuran,
    };
  });
  dashboard.sort((a, b) => a.display_name.localeCompare(b.display_name));

  const heatmap = buildHeatmap(
    (members ?? []).map((m) => ({ id: m.id, display_name: m.display_name })),
    mpByMember as Map<string, MpShape>
  );

  return {
    ok: true,
    data: {
      leaderboard,
      clubSeries,
      projection,
      memberTrajectories,
      dashboard,
      heatmap,
    },
  };
}
