import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildProgressReport } from "@/lib/progress-aggregate";

export async function GET() {
  const admin = createAdminClient();

  const { data: events, error: evError } = await admin
    .from("progress_events")
    .select("member_id, event_kind, juz, created_at")
    .order("created_at", { ascending: true });

  if (evError) {
    return NextResponse.json({ error: evError.message }, { status: 500 });
  }

  const { data: members, error: memError } = await admin.from("members").select("id, display_name");

  if (memError) {
    return NextResponse.json({ error: memError.message }, { status: 500 });
  }

  const nameById = new Map((members ?? []).map((m) => [m.id, m.display_name]));

  const flat =
    events?.map((row) => ({
      member_id: row.member_id,
      display_name: nameById.get(row.member_id) ?? "Unknown",
      event_kind: row.event_kind as "completed" | "memorizing" | "revising" | null | undefined,
      juz: row.juz,
      created_at: row.created_at,
    })) ?? [];

  const report = buildProgressReport(flat);

  const { data: mpRows, error: mpError } = await admin
    .from("member_progress")
    .select("member_id, activity, active_juz, pct_active_juz, updated_at");

  if (mpError) {
    return NextResponse.json({ error: mpError.message }, { status: 500 });
  }

  const mpByMember = new Map(
    (mpRows ?? []).map((r) => [
      r.member_id,
      {
        activity: r.activity as "memorizing" | "revising",
        active_juz: r.active_juz as number,
        pct_active_juz: Number(r.pct_active_juz),
      },
    ])
  );

  const maxByMember = new Map(report.leaderboard.map((r) => [r.member_id, r.max_juz]));

  const dashboard = (members ?? []).map((m) => {
    const mp = mpByMember.get(m.id);
    return {
      member_id: m.id,
      display_name: m.display_name,
      activity: mp?.activity ?? null,
      active_juz: mp?.active_juz ?? null,
      pct_active_juz: mp?.pct_active_juz ?? null,
      max_juz_completed: maxByMember.get(m.id) ?? 0,
    };
  });
  dashboard.sort((a, b) => a.display_name.localeCompare(b.display_name));

  return NextResponse.json({ ...report, dashboard });
}
