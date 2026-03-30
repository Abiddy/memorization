import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMemorizationTimeline } from "@/lib/progress-aggregate";
import { percentQuranFromSurahIds, surahName } from "@/lib/quran";

function juzLabel(juz: number | null): string {
  if (juz == null) return "—";
  return `Juz ${juz}`;
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

  const { clubSeries, projection } = buildMemorizationTimeline(flat);

  const leaderboard = (members ?? []).map((m) => ({
    member_id: m.id,
    display_name: m.display_name,
    pct_quran: percentQuranFromSurahIds((m.memorized_surah_ids as number[] | null) ?? []),
  }));
  leaderboard.sort((a, b) => b.pct_quran - a.pct_quran || a.display_name.localeCompare(b.display_name));

  const { data: mpRows, error: mpError } = await admin.from("member_progress").select(
    "member_id, memorizing_juz, memorizing_surah, memorizing_pct_active_juz, revising_juz, revising_surahs, revising_pct_active_juz, updated_at"
  );

  if (mpError) {
    return NextResponse.json({ error: mpError.message }, { status: 500 });
  }

  const mpByMember = new Map(
    (mpRows ?? []).map((r) => [
      r.member_id,
      {
        memorizing_juz: r.memorizing_juz as number | null,
        memorizing_surah: r.memorizing_surah as number | null,
        memorizing_pct_active_juz:
          r.memorizing_pct_active_juz != null ? Number(r.memorizing_pct_active_juz) : null,
        revising_juz: r.revising_juz as number | null,
        revising_surahs: (r.revising_surahs as number[] | null) ?? [],
        revising_pct_active_juz:
          r.revising_pct_active_juz != null ? Number(r.revising_pct_active_juz) : null,
      },
    ])
  );

  const dashboard = (members ?? []).map((m) => {
    const mp = mpByMember.get(m.id);
    const pctQuran = percentQuranFromSurahIds((m.memorized_surah_ids as number[] | null) ?? []);
    const ms = mp?.memorizing_surah;
    return {
      member_id: m.id,
      display_name: m.display_name,
      revising: juzLabel(mp?.revising_juz ?? null),
      memorising: juzLabel(mp?.memorizing_juz ?? null),
      active_juz: mp?.memorizing_juz ?? null,
      pct_active_juz: mp?.memorizing_pct_active_juz ?? null,
      surah_memorising: ms != null && ms >= 1 && ms <= 114 ? surahName(ms) : "—",
      pct_quran: pctQuran,
    };
  });
  dashboard.sort((a, b) => a.display_name.localeCompare(b.display_name));

  return NextResponse.json({
    leaderboard,
    clubSeries,
    projection,
    dashboard,
  });
}
