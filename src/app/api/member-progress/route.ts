import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatProgressChatLine,
  percentOfJuzFromSelectedSurahs,
  validateSurahsBelongToJuz,
} from "@/lib/quran";

const COOKIE = "alif_member_id";

const PostBodySchema = z.object({
  activity: z.enum(["memorizing", "revising"]),
  active_juz: z.number().int().min(1).max(30),
  surah_ids: z.array(z.number().int().min(1).max(114)).min(1),
});

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const memberId = cookieStore.get(COOKIE)?.value;
  if (!memberId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { activity, active_juz, surah_ids } = parsed.data;
  const uniqueSurahs = [...new Set(surah_ids)];
  if (!validateSurahsBelongToJuz(active_juz, uniqueSurahs)) {
    return NextResponse.json({ error: "One or more surahs are not in that juz" }, { status: 400 });
  }

  const pct = percentOfJuzFromSelectedSurahs(active_juz, uniqueSurahs);
  const body = formatProgressChatLine(activity, active_juz, uniqueSurahs);

  const admin = createAdminClient();

  const { data: member, error: memberError } = await admin
    .from("members")
    .select("id, display_name")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 401 });
  }

  const { data: msg, error: msgError } = await admin
    .from("messages")
    .insert({
      member_id: member.id,
      display_name: member.display_name,
      body,
    })
    .select("id, member_id, display_name, body, created_at")
    .single();

  if (msgError || !msg) {
    return NextResponse.json({ error: msgError?.message ?? "Message insert failed" }, { status: 500 });
  }

  const { error: upError } = await admin.from("member_progress").upsert(
    {
      member_id: member.id,
      activity,
      active_juz,
      surahs_selected: uniqueSurahs,
      pct_active_juz: pct,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "member_id" }
  );

  if (upError) {
    return NextResponse.json({ error: upError.message }, { status: 500 });
  }

  const surahSummary = uniqueSurahs.sort((a, b) => a - b).join(",");
  const { error: peError } = await admin.from("progress_events").insert({
    member_id: member.id,
    event_kind: activity,
    juz: active_juz,
    surah: surahSummary,
    summary: `${pct}% of Juz ${active_juz}`,
    source_message_id: msg.id,
  });

  if (peError) {
    return NextResponse.json({ error: peError.message }, { status: 500 });
  }

  return NextResponse.json({ message: msg });
}
