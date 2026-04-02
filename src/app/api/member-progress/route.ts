import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatProgressChatLine, formatProgressEventSummary } from "@/lib/quran";

const COOKIE = "alif_member_id";

const MemorizingBodySchema = z.object({
  track: z.literal("memorizing"),
  surah_ids: z.array(z.number().int().min(1).max(114)).min(1),
  /** Optional context for the chat line when using the juz-based picker. */
  active_juz: z.number().int().min(1).max(30).optional(),
});

const RevisingBodySchema = z.object({
  track: z.literal("revising"),
  surah_ids: z.array(z.number().int().min(1).max(114)).min(1),
  active_juz: z.number().int().min(1).max(30).optional(),
});

const RecitingBodySchema = z.object({
  track: z.literal("reciting"),
  surah_ids: z.array(z.number().int().min(1).max(114)).min(1),
  active_juz: z.number().int().min(1).max(30).optional(),
});

const PostBodySchema = z.discriminatedUnion("track", [
  MemorizingBodySchema,
  RevisingBodySchema,
  RecitingBodySchema,
]);

/** Silent merge from Surah matrix (no chat message, no progress_events except memorising). */
const MatrixPatchSchema = z.object({
  track: z.enum(["memorizing", "revising", "reciting"]),
  surah_ids: z.array(z.number().int().min(1).max(114)).min(1),
});

function mergeUniqueSorted(a: number[], b: number[]): number[] {
  return [...new Set([...a, ...b])].sort((x, y) => x - y);
}

type MemberProgressRow = {
  member_id: string;
  memorizing_surahs: number[];
  revising_surahs: number[];
  reciting_surahs: number[];
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
    .select("member_id, memorizing_surahs, revising_surahs, reciting_surahs")
    .eq("member_id", member.id)
    .maybeSingle();

  const base: MemberProgressRow = {
    member_id: member.id,
    memorizing_surahs: (existing?.memorizing_surahs as number[] | null) ?? [],
    revising_surahs: (existing?.revising_surahs as number[] | null) ?? [],
    reciting_surahs: (existing?.reciting_surahs as number[] | null) ?? [],
  };

  let body: string;
  let eventKind: "memorizing" | "revising" | "reciting";
  let surahSummary: string;
  let summary: string;
  let nextRow: MemberProgressRow = { ...base };

  const juzForChat = parsed.data.active_juz;

  if (parsed.data.track === "memorizing") {
    const { surah_ids } = parsed.data;
    const uniqueSurahs = [...new Set(surah_ids)];
    body = formatProgressChatLine("memorizing", uniqueSurahs, juzForChat);
    eventKind = "memorizing";
    surahSummary = uniqueSurahs.sort((a, b) => a - b).join(",");
    summary = formatProgressEventSummary("memorizing", uniqueSurahs);
    nextRow.memorizing_surahs = uniqueSurahs;
  } else if (parsed.data.track === "revising") {
    const { surah_ids } = parsed.data;
    const uniqueSurahs = [...new Set(surah_ids)];
    body = formatProgressChatLine("revising", uniqueSurahs, juzForChat);
    eventKind = "revising";
    surahSummary = uniqueSurahs.sort((a, b) => a - b).join(",");
    summary = formatProgressEventSummary("revising", uniqueSurahs);
    nextRow.revising_surahs = uniqueSurahs;
  } else {
    const { surah_ids } = parsed.data;
    const uniqueSurahs = [...new Set(surah_ids)];
    body = formatProgressChatLine("reciting", uniqueSurahs, juzForChat);
    eventKind = "reciting";
    surahSummary = uniqueSurahs.sort((a, b) => a - b).join(",");
    summary = formatProgressEventSummary("reciting", uniqueSurahs);
    nextRow.reciting_surahs = uniqueSurahs;
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
    juz: juzForChat ?? null,
    surah: surahSummary,
    summary,
    source_message_id: msg.id,
  });

  if (peError) {
    return NextResponse.json({ error: peError.message }, { status: 500 });
  }

  if (parsed.data.track === "memorizing") {
    const prev = (member.memorized_surah_ids as number[] | null) ?? [];
    const merged = [...new Set([...prev, ...parsed.data.surah_ids])].sort((a, b) => a - b);
    const { error: memUp } = await admin.from("members").update({ memorized_surah_ids: merged }).eq("id", member.id);
    if (memUp) {
      return NextResponse.json({ error: memUp.message }, { status: 500 });
    }
  }

  return NextResponse.json({ message: msg });
}

export async function PATCH(request: Request) {
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

  const parsed = MatrixPatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: member, error: memberError } = await admin
    .from("members")
    .select("id, memorized_surah_ids")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 401 });
  }

  const { data: existing } = await admin
    .from("member_progress")
    .select("member_id, memorizing_surahs, revising_surahs, reciting_surahs")
    .eq("member_id", member.id)
    .maybeSingle();

  const base: MemberProgressRow = {
    member_id: member.id,
    memorizing_surahs: (existing?.memorizing_surahs as number[] | null) ?? [],
    revising_surahs: (existing?.revising_surahs as number[] | null) ?? [],
    reciting_surahs: (existing?.reciting_surahs as number[] | null) ?? [],
  };

  const { track, surah_ids } = parsed.data;
  const incoming = [...new Set(surah_ids)];

  const nextRow: MemberProgressRow = { ...base };

  if (track === "memorizing") {
    nextRow.memorizing_surahs = mergeUniqueSorted(base.memorizing_surahs, incoming);
  } else if (track === "revising") {
    nextRow.revising_surahs = mergeUniqueSorted(base.revising_surahs ?? [], incoming);
  } else {
    nextRow.reciting_surahs = mergeUniqueSorted(base.reciting_surahs ?? [], incoming);
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

  if (track === "memorizing") {
    const prev = (member.memorized_surah_ids as number[] | null) ?? [];
    const mergedMem = mergeUniqueSorted(prev, incoming);
    const { error: memUp } = await admin.from("members").update({ memorized_surah_ids: mergedMem }).eq("id", member.id);
    if (memUp) {
      return NextResponse.json({ error: memUp.message }, { status: 500 });
    }

    const summary = `${formatProgressEventSummary("memorizing", incoming)} (matrix)`;
    const { error: peError } = await admin.from("progress_events").insert({
      member_id: member.id,
      event_kind: "memorizing",
      juz: null,
      surah: incoming.sort((a, b) => a - b).join(","),
      summary,
      source_message_id: null,
    });
    if (peError) {
      return NextResponse.json({ error: peError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
