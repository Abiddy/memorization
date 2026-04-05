import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const COOKIE = "alif_member_id";

const BodySchema = z.object({
  track: z.enum(["memorizing", "revising", "reciting"]),
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

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid track" }, { status: 400 });
  }

  const { track } = parsed.data;
  const admin = createAdminClient();

  const { data: member, error: memberError } = await admin.from("members").select("id").eq("id", memberId).maybeSingle();
  if (memberError || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 401 });
  }

  const { data: existing } = await admin
    .from("member_progress")
    .select(
      "member_id, memorizing_surahs, revising_surahs, reciting_surahs, completed_memorizing_surahs, completed_revising_surahs, completed_reciting_surahs"
    )
    .eq("member_id", member.id)
    .maybeSingle();

  const mem = (existing?.memorizing_surahs as number[] | null) ?? [];
  const rev = (existing?.revising_surahs as number[] | null) ?? [];
  const rec = (existing?.reciting_surahs as number[] | null) ?? [];
  const doneMem = (existing?.completed_memorizing_surahs as number[] | null) ?? [];
  const doneRev = (existing?.completed_revising_surahs as number[] | null) ?? [];
  const doneRec = (existing?.completed_reciting_surahs as number[] | null) ?? [];

  const clearMem = track === "memorizing";
  /** Revising must be a subset of memorised surahs — wipe it when memorisation is reset. */
  const clearRev = track === "revising" || clearMem;

  const row = {
    member_id: member.id,
    memorizing_surahs: clearMem ? [] : mem,
    revising_surahs: clearRev ? [] : rev,
    reciting_surahs: track === "reciting" ? [] : rec,
    completed_memorizing_surahs: clearMem ? [] : doneMem,
    completed_revising_surahs: clearRev ? [] : doneRev,
    completed_reciting_surahs: track === "reciting" ? [] : doneRec,
    updated_at: new Date().toISOString(),
  };

  const { error: upError } = await admin.from("member_progress").upsert(row, { onConflict: "member_id" });
  if (upError) {
    return NextResponse.json({ error: upError.message }, { status: 500 });
  }

  if (track === "memorizing") {
    const { error: memClearErr } = await admin
      .from("members")
      .update({ memorized_surah_ids: [] })
      .eq("id", member.id);
    if (memClearErr) {
      return NextResponse.json({ error: memClearErr.message }, { status: 500 });
    }
  }

  const summary =
    track === "memorizing"
      ? "Cleared memorising & revising tracks (Progress) and reset % Quran"
      : track === "revising"
        ? "Cleared revising track (Progress)"
        : "Cleared reciting track (Progress)";

  await admin.from("progress_events").insert({
    member_id: member.id,
    event_kind: track,
    juz: null,
    surah: null,
    summary,
    source_message_id: null,
  });

  return NextResponse.json({ ok: true });
}
