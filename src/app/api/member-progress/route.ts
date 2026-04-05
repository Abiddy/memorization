import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMemberCircleId } from "@/lib/circle-service";
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

  const memorizedSet = new Set(
    ((member.memorized_surah_ids as number[] | null) ?? []).filter((n) => n >= 1 && n <= 114)
  );

  const ids = [...new Set(parsed.data.surah_ids)].filter((n) => n >= 1 && n <= 114);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Pick at least one valid surah." }, { status: 400 });
  }

  if (parsed.data.track === "memorizing") {
    const already = ids.filter((id) => memorizedSet.has(id));
    if (already.length > 0) {
      return NextResponse.json(
        {
          error:
            "Memorising track is only for surahs you haven’t memorised yet. Use Revising for what you already know.",
        },
        { status: 400 }
      );
    }
  }

  if (parsed.data.track === "revising") {
    const notYet = ids.filter((id) => !memorizedSet.has(id));
    if (notYet.length > 0) {
      return NextResponse.json(
        {
          error: "Revising only includes surahs you’ve already memorised (same rule as Intention).",
        },
        { status: 400 }
      );
    }
  }

  let body: string;
  let eventKind: "memorizing" | "revising" | "reciting";
  let surahSummary: string;
  let summary: string;
  let nextRow: MemberProgressRow = { ...base };

  const juzForChat = parsed.data.active_juz;
  const uniqueSurahs = [...ids].sort((a, b) => a - b);

  if (parsed.data.track === "memorizing") {
    body = formatProgressChatLine("memorizing", uniqueSurahs, juzForChat);
    eventKind = "memorizing";
    surahSummary = uniqueSurahs.join(",");
    summary = formatProgressEventSummary("memorizing", uniqueSurahs);
    nextRow.memorizing_surahs = uniqueSurahs;
  } else if (parsed.data.track === "revising") {
    body = formatProgressChatLine("revising", uniqueSurahs, juzForChat);
    eventKind = "revising";
    surahSummary = uniqueSurahs.join(",");
    summary = formatProgressEventSummary("revising", uniqueSurahs);
    nextRow.revising_surahs = uniqueSurahs;
  } else {
    body = formatProgressChatLine("reciting", uniqueSurahs, juzForChat);
    eventKind = "reciting";
    surahSummary = uniqueSurahs.join(",");
    summary = formatProgressEventSummary("reciting", uniqueSurahs);
    nextRow.reciting_surahs = uniqueSurahs;
  }

  const circleId = await fetchMemberCircleId(admin, memberId);
  const { data: msg, error: msgError } = await admin
    .from("messages")
    .insert({
      member_id: member.id,
      display_name: member.display_name,
      body,
      ...(circleId ? { circle_id: circleId } : {}),
    })
    .select("id, member_id, display_name, body, created_at, circle_id")
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
    const merged = [...new Set([...prev, ...uniqueSurahs])].sort((a, b) => a - b);
    const { error: memUp } = await admin.from("members").update({ memorized_surah_ids: merged }).eq("id", member.id);
    if (memUp) {
      return NextResponse.json({ error: memUp.message }, { status: 500 });
    }
  }

  return NextResponse.json({ message: msg });
}

/** Surah matrix is display-only; updates go through chat (“I am…”) or Intention. */
export async function PATCH() {
  return NextResponse.json(
    {
      error:
        "The Surah matrix is view-only. Update your tracks from Circles → Chat (I am…) or under Intention.",
    },
    { status: 403 }
  );
}
