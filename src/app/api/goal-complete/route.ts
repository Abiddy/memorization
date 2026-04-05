import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatProgressEventSummary } from "@/lib/quran";

const COOKIE = "alif_member_id";

const BodySchema = z.object({
  track: z.enum(["memorizing", "revising", "reciting"]),
});

function mergeUniqueSorted(a: number[], b: number[]): number[] {
  return [...new Set([...a, ...b])].sort((x, y) => x - y);
}

function removeIdsFromSorted(base: number[], toRemove: number[]): number[] {
  const drop = new Set(toRemove);
  return base.filter((id) => !drop.has(id));
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

  const { track } = parsed.data;
  const admin = createAdminClient();

  const { data: goalsRow, error: gErr } = await admin
    .from("member_goals")
    .select("memorizing_surah_ids, revising_surah_ids, reciting_surah_ids")
    .eq("member_id", memberId)
    .maybeSingle();

  if (gErr) {
    return NextResponse.json({ error: gErr.message }, { status: 500 });
  }
  if (!goalsRow) {
    return NextResponse.json({ error: "No goals row found. Add goals first." }, { status: 400 });
  }

  const rawGoalIds =
    track === "memorizing"
      ? goalsRow.memorizing_surah_ids
      : track === "revising"
        ? goalsRow.revising_surah_ids
        : goalsRow.reciting_surah_ids;
  const goalIds = sortUnique(((rawGoalIds as number[] | null) ?? []) as number[]);
  if (goalIds.length === 0) {
    return NextResponse.json({ error: "Nothing to complete for this track." }, { status: 400 });
  }

  const { data: member, error: memErr } = await admin
    .from("members")
    .select("id, memorized_surah_ids")
    .eq("id", memberId)
    .maybeSingle();

  if (memErr || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 401 });
  }

  const { data: mpRow, error: mpErr } = await admin
    .from("member_progress")
    .select(
      "memorizing_surahs, revising_surahs, reciting_surahs, completed_memorizing_surahs, completed_revising_surahs, completed_reciting_surahs"
    )
    .eq("member_id", memberId)
    .maybeSingle();

  if (mpErr) {
    return NextResponse.json({ error: mpErr.message }, { status: 500 });
  }

  const memorizing = (mpRow?.memorizing_surahs as number[] | null) ?? [];
  const revising = (mpRow?.revising_surahs as number[] | null) ?? [];
  const reciting = (mpRow?.reciting_surahs as number[] | null) ?? [];
  const doneMem = (mpRow?.completed_memorizing_surahs as number[] | null) ?? [];
  const doneRev = (mpRow?.completed_revising_surahs as number[] | null) ?? [];
  const doneRec = (mpRow?.completed_reciting_surahs as number[] | null) ?? [];

  let nextMem = memorizing;
  let nextRev = revising;
  let nextRec = reciting;
  let nextDoneMem = doneMem;
  let nextDoneRev = doneRev;
  let nextDoneRec = doneRec;

  if (track === "memorizing") {
    nextDoneMem = mergeUniqueSorted(doneMem, goalIds);
    nextMem = removeIdsFromSorted(memorizing, goalIds);
    const prevMem = (member.memorized_surah_ids as number[] | null) ?? [];
    const mergedMem = mergeUniqueSorted(prevMem, goalIds);
    const { error: upM } = await admin.from("members").update({ memorized_surah_ids: mergedMem }).eq("id", member.id);
    if (upM) return NextResponse.json({ error: upM.message }, { status: 500 });
  } else if (track === "revising") {
    nextDoneRev = mergeUniqueSorted(doneRev, goalIds);
    nextRev = removeIdsFromSorted(revising, goalIds);
  } else {
    nextDoneRec = mergeUniqueSorted(doneRec, goalIds);
    nextRec = removeIdsFromSorted(reciting, goalIds);
  }

  const { error: upMp } = await admin.from("member_progress").upsert(
    {
      member_id: member.id,
      memorizing_surahs: nextMem,
      revising_surahs: nextRev,
      reciting_surahs: nextRec,
      completed_memorizing_surahs: nextDoneMem,
      completed_revising_surahs: nextDoneRev,
      completed_reciting_surahs: nextDoneRec,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "member_id" }
  );

  if (upMp) {
    return NextResponse.json({ error: upMp.message }, { status: 500 });
  }

  const clearPatch =
    track === "memorizing"
      ? { memorizing_surah_ids: [] as number[] }
      : track === "revising"
        ? { revising_surah_ids: [] as number[] }
        : { reciting_surah_ids: [] as number[] };
  const { error: upGoals } = await admin.from("member_goals").update(clearPatch).eq("member_id", memberId);
  if (upGoals) {
    return NextResponse.json({ error: upGoals.message }, { status: 500 });
  }

  const eventKind = track === "memorizing" ? "memorizing" : track === "revising" ? "revising" : "reciting";
  const summary = `${formatProgressEventSummary(eventKind, goalIds)} (Intention — Alhamdulillah)`;
  const { error: peErr } = await admin.from("progress_events").insert({
    member_id: member.id,
    event_kind: eventKind,
    juz: null,
    surah: goalIds.join(","),
    summary,
    source_message_id: null,
  });
  if (peErr) {
    return NextResponse.json({ error: peErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function sortUnique(ids: number[]): number[] {
  return [...new Set(ids)].filter((n) => n >= 1 && n <= 114).sort((a, b) => a - b);
}
