import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatProgressEventSummary } from "@/lib/quran";

const COOKIE = "alif_member_id";

const SurahListSchema = z.array(z.number().int().min(1).max(114));

const CompleteSchema = z.object({
  /** Surahs the user has already fully memorised (baseline for % Quran & revise picker). */
  already_memorized_surah_ids: SurahListSchema,
  /** Goal: surahs to memorise (must not overlap already_memorized). */
  goal_memorize_surah_ids: SurahListSchema,
  /** Goal: surahs to revise (must be ⊆ already_memorized). */
  goal_revise_surah_ids: SurahListSchema,
  /** Goal: surahs to recite (any). */
  goal_recite_surah_ids: SurahListSchema,
  memorize_span: z.enum(["7d", "1m", "2m"]),
  revise_span: z.enum(["7d", "1m", "2m"]),
  recite_span: z.enum(["7d", "1m", "2m"]),
});

const SkipSchema = z.object({ skip: z.literal(true) });

const BodySchema = z.union([SkipSchema, CompleteSchema]);

function sortUnique(ids: number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

function targetEndFromSpan(span: "7d" | "1m" | "2m"): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (span === "7d") d.setUTCDate(d.getUTCDate() + 7);
  else if (span === "1m") d.setUTCDate(d.getUTCDate() + 30);
  else d.setUTCDate(d.getUTCDate() + 60);
  return d.toISOString().slice(0, 10);
}

/** DB still on `horizon` + `target_end` (before migration_member_goals_per_track_deadlines.sql). */
function isLegacyMemberGoalsColumnError(message: string): boolean {
  return (
    /memorize_target_end|revise_target_end|recite_target_end/i.test(message) ||
    (/schema cache/i.test(message) && /member_goals/i.test(message))
  );
}

function legacyHorizonFromSpans(m: "7d" | "1m" | "2m", r: "7d" | "1m" | "2m", c: "7d" | "1m" | "2m"): "week" | "month" {
  return m === "7d" && r === "7d" && c === "7d" ? "week" : "month";
}

function latestIsoDate(dates: string[]): string {
  return [...dates].sort((a, b) => a.localeCompare(b)).at(-1)!;
}

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

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: member, error: memErr } = await admin
    .from("members")
    .select("id, memorized_surah_ids")
    .eq("id", memberId)
    .maybeSingle();

  if (memErr || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 401 });
  }

  if ("skip" in parsed.data && parsed.data.skip) {
    const { error: up } = await admin
      .from("members")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", member.id);
    if (up) return NextResponse.json({ error: up.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const body = parsed.data as z.infer<typeof CompleteSchema>;
  const already = sortUnique(body.already_memorized_surah_ids);
  const goalMem = sortUnique(body.goal_memorize_surah_ids);
  const goalRev = sortUnique(body.goal_revise_surah_ids);
  const goalRec = sortUnique(body.goal_recite_surah_ids);
  const alreadySet = new Set(already);

  for (const id of goalMem) {
    if (alreadySet.has(id)) {
      return NextResponse.json(
        { error: "“I will memorise” cannot include surahs you’ve already memorised." },
        { status: 400 }
      );
    }
  }
  for (const id of goalRev) {
    if (!alreadySet.has(id)) {
      return NextResponse.json(
        { error: "“I will revise” may only include surahs you’ve already memorised." },
        { status: 400 }
      );
    }
  }

  const memorizing_surahs = sortUnique([...already, ...goalMem]);
  const revising_surahs = goalRev;
  const reciting_surahs = goalRec;
  const memEnd = targetEndFromSpan(body.memorize_span);
  const revEnd = targetEndFromSpan(body.revise_span);
  const recEnd = targetEndFromSpan(body.recite_span);

  const { error: mpErr } = await admin.from("member_progress").upsert(
    {
      member_id: member.id,
      memorizing_surahs,
      revising_surahs,
      reciting_surahs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "member_id" }
  );

  if (mpErr) {
    return NextResponse.json({ error: mpErr.message }, { status: 500 });
  }

  const { error: mErr } = await admin
    .from("members")
    .update({
      memorized_surah_ids: already,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", member.id);

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  const goalsNewRow = {
    member_id: member.id,
    memorize_target_end: memEnd,
    revise_target_end: revEnd,
    recite_target_end: recEnd,
    memorizing_surah_ids: goalMem,
    revising_surah_ids: goalRev,
    reciting_surah_ids: goalRec,
    updated_at: new Date().toISOString(),
  };

  let { error: gErr } = await admin.from("member_goals").upsert(goalsNewRow, { onConflict: "member_id" });

  if (gErr && isLegacyMemberGoalsColumnError(gErr.message)) {
    const { error: legacyErr } = await admin.from("member_goals").upsert(
      {
        member_id: member.id,
        horizon: legacyHorizonFromSpans(body.memorize_span, body.revise_span, body.recite_span),
        target_end: latestIsoDate([memEnd, revEnd, recEnd]),
        memorizing_surah_ids: goalMem,
        revising_surah_ids: goalRev,
        reciting_surah_ids: goalRec,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "member_id" }
    );
    gErr = legacyErr;
  }

  if (gErr) {
    return NextResponse.json({ error: gErr.message }, { status: 500 });
  }

  if (memorizing_surahs.length > 0) {
    const summary = formatProgressEventSummary("memorizing", memorizing_surahs);
    const { error: peErr } = await admin.from("progress_events").insert({
      member_id: member.id,
      event_kind: "memorizing",
      juz: null,
      surah: memorizing_surahs.join(","),
      summary: `${summary} (onboarding)`,
      source_message_id: null,
    });
    if (peErr) {
      return NextResponse.json({ error: peErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
