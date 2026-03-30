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

const MemorizingBodySchema = z.object({
  track: z.literal("memorizing"),
  active_juz: z.number().int().min(1).max(30),
  surah_id: z.number().int().min(1).max(114),
});

const RevisingBodySchema = z.object({
  track: z.literal("revising"),
  active_juz: z.number().int().min(1).max(30),
  surah_ids: z.array(z.number().int().min(1).max(114)).min(1),
});

const PostBodySchema = z.discriminatedUnion("track", [MemorizingBodySchema, RevisingBodySchema]);

type MemberProgressRow = {
  member_id: string;
  memorizing_juz: number | null;
  memorizing_surah: number | null;
  memorizing_pct_active_juz: number | null;
  revising_juz: number | null;
  revising_surahs: number[] | null;
  revising_pct_active_juz: number | null;
};

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

  const admin = createAdminClient();

  const { data: member, error: memberError } = await admin
    .from("members")
    .select("id, display_name, memorized_surah_ids")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 401 });
  }

  const { data: existing } = await admin
    .from("member_progress")
    .select(
      "member_id, memorizing_juz, memorizing_surah, memorizing_pct_active_juz, revising_juz, revising_surahs, revising_pct_active_juz"
    )
    .eq("member_id", member.id)
    .maybeSingle();

  const base: MemberProgressRow = {
    member_id: member.id,
    memorizing_juz: (existing?.memorizing_juz as number | null) ?? null,
    memorizing_surah: (existing?.memorizing_surah as number | null) ?? null,
    memorizing_pct_active_juz:
      existing?.memorizing_pct_active_juz != null ? Number(existing.memorizing_pct_active_juz) : null,
    revising_juz: (existing?.revising_juz as number | null) ?? null,
    revising_surahs: (existing?.revising_surahs as number[] | null) ?? [],
    revising_pct_active_juz:
      existing?.revising_pct_active_juz != null ? Number(existing.revising_pct_active_juz) : null,
  };

  let body: string;
  let eventKind: "memorizing" | "revising";
  let surahSummary: string;
  let summary: string;
  let nextRow: MemberProgressRow = { ...base };

  if (parsed.data.track === "memorizing") {
    const { active_juz, surah_id } = parsed.data;
    if (!validateSurahsBelongToJuz(active_juz, [surah_id])) {
      return NextResponse.json({ error: "That surah is not in that juz" }, { status: 400 });
    }
    const pct = percentOfJuzFromSelectedSurahs(active_juz, [surah_id]);
    body = formatProgressChatLine("memorizing", active_juz, [surah_id]);
    eventKind = "memorizing";
    surahSummary = String(surah_id);
    summary = `${pct}% of Juz ${active_juz} (memorising)`;
    nextRow.memorizing_juz = active_juz;
    nextRow.memorizing_surah = surah_id;
    nextRow.memorizing_pct_active_juz = pct;
  } else {
    const { active_juz, surah_ids } = parsed.data;
    const uniqueSurahs = [...new Set(surah_ids)];
    if (!validateSurahsBelongToJuz(active_juz, uniqueSurahs)) {
      return NextResponse.json({ error: "One or more surahs are not in that juz" }, { status: 400 });
    }
    const pct = percentOfJuzFromSelectedSurahs(active_juz, uniqueSurahs);
    body = formatProgressChatLine("revising", active_juz, uniqueSurahs);
    eventKind = "revising";
    surahSummary = uniqueSurahs.sort((a, b) => a - b).join(",");
    summary = `${pct}% of Juz ${active_juz} (revising)`;
    nextRow.revising_juz = active_juz;
    nextRow.revising_surahs = uniqueSurahs;
    nextRow.revising_pct_active_juz = pct;
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

  const { error: upError } = await admin
    .from("member_progress")
    .upsert(
      {
        ...nextRow,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "member_id" }
    );

  if (upError) {
    return NextResponse.json({ error: upError.message }, { status: 500 });
  }

  const { error: peError } = await admin.from("progress_events").insert({
    member_id: member.id,
    event_kind: eventKind,
    juz: parsed.data.active_juz,
    surah: surahSummary,
    summary,
    source_message_id: msg.id,
  });

  if (peError) {
    return NextResponse.json({ error: peError.message }, { status: 500 });
  }

  if (parsed.data.track === "memorizing") {
    const prev = (member.memorized_surah_ids as number[] | null) ?? [];
    const merged = [...new Set([...prev, parsed.data.surah_id])].sort((a, b) => a - b);
    const { error: memUp } = await admin.from("members").update({ memorized_surah_ids: merged }).eq("id", member.id);
    if (memUp) {
      return NextResponse.json({ error: memUp.message }, { status: 500 });
    }
  }

  return NextResponse.json({ message: msg });
}
