import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isClubAdminRow } from "@/lib/club-admin";
import { fetchAggregatedProgress } from "@/lib/progress-response";
import { surahName } from "@/lib/quran";

function formatStatusLogLine(kind: string, summary: string | null | undefined, surahCsv: string | null | undefined): string {
  const trimmed = summary?.trim();
  if (trimmed) return trimmed;
  const ids = (surahCsv ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => n >= 1 && n <= 114);
  const names = ids.map((id) => surahName(id)).join(", ");
  const label =
    kind === "memorizing"
      ? "Memorising"
      : kind === "revising"
        ? "Revising"
        : kind === "reciting"
          ? "Reciting"
          : kind === "completed"
            ? "Completed"
            : "Activity";
  if (!names) return `${label} (update)`;
  const surahPhrases = names.split(", ").map((n) => `Surah ${n}`).join(", ");
  return `${label} ${surahPhrases}`;
}

const MEMBER_COOKIE = "alif_member_id";

function calendarDaysLeftUtc(endYmd: string): number {
  const [y, m, d] = endYmd.split("-").map(Number);
  if (!y || !m || !d) return 0;
  const end = Date.UTC(y, m - 1, d);
  const t = new Date();
  const start = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  return Math.max(0, Math.round((end - start) / 86400000));
}

function goalEntries(ids: number[]): { surahId: number; name: string }[] {
  const sorted = [...new Set(ids)].filter((n) => n >= 1 && n <= 114).sort((a, b) => a - b);
  return sorted.map((surahId) => ({ surahId, name: surahName(surahId) }));
}

export async function GET() {
  const admin = createAdminClient();
  const cookieStore = await cookies();
  const selfId = cookieStore.get(MEMBER_COOKIE)?.value ?? null;

  const aggregateIds = selfId ? [selfId] : [];
  const agg = await fetchAggregatedProgress(admin, aggregateIds);
  if (!agg.ok) {
    return NextResponse.json({ error: agg.error }, { status: 500 });
  }

  type GoalTrack = {
    entries: { surahId: number; name: string }[];
    targetEnd: string;
    daysLeft: number;
  };

  type GoalsPayload = {
    progressAnchorYmd: string;
    memorizing: GoalTrack;
    revising: GoalTrack;
    reciting: GoalTrack;
  };

  let me: {
    needsOnboarding: boolean;
    memorized_surah_ids: number[];
    goals: GoalsPayload | null;
    statusLog: { eventKind: string; line: string; dateIso: string; dateDisplay: string }[];
    is_admin: boolean;
  } | null = null;

  if (selfId) {
    let needsOnboarding = false;
    let goalsPayload: GoalsPayload | null = null;

    const { data: selfRow, error: selfErr } = await admin
      .from("members")
      .select("onboarding_completed_at, memorized_surah_ids, username")
      .eq("id", selfId)
      .maybeSingle();

    let memorized_surah_ids: number[] = [];
    let is_admin = false;
    if (!selfErr && selfRow) {
      is_admin = isClubAdminRow(selfRow);
      needsOnboarding = selfRow.onboarding_completed_at == null;
      memorized_surah_ids = ((selfRow.memorized_surah_ids as number[] | null) ?? [])
        .filter((n) => n >= 1 && n <= 114)
        .sort((a, b) => a - b);
    }

    const { data: goalRow, error: goalErr } = await admin
      .from("member_goals")
      .select("*")
      .eq("member_id", selfId)
      .maybeSingle();

    if (!goalErr && goalRow) {
      const r = goalRow as Record<string, unknown>;
      const legacy = typeof r.target_end === "string" ? r.target_end : undefined;
      const mEnd =
        (typeof r.memorize_target_end === "string" ? r.memorize_target_end : undefined) ?? legacy;
      const revEnd =
        (typeof r.revise_target_end === "string" ? r.revise_target_end : undefined) ?? legacy;
      const recEnd =
        (typeof r.recite_target_end === "string" ? r.recite_target_end : undefined) ?? legacy;
      if (mEnd && revEnd && recEnd) {
        const rawUpdated = goalRow.updated_at as string | undefined;
        let progressAnchorYmd = "";
        if (rawUpdated) {
          const ad = new Date(rawUpdated);
          if (!Number.isNaN(ad.getTime())) {
            progressAnchorYmd = `${ad.getUTCFullYear()}-${String(ad.getUTCMonth() + 1).padStart(2, "0")}-${String(ad.getUTCDate()).padStart(2, "0")}`;
          }
        }
        goalsPayload = {
          progressAnchorYmd,
          memorizing: {
            entries: goalEntries((goalRow.memorizing_surah_ids as number[] | null) ?? []),
            targetEnd: mEnd,
            daysLeft: calendarDaysLeftUtc(mEnd),
          },
          revising: {
            entries: goalEntries((goalRow.revising_surah_ids as number[] | null) ?? []),
            targetEnd: revEnd,
            daysLeft: calendarDaysLeftUtc(revEnd),
          },
          reciting: {
            entries: goalEntries((goalRow.reciting_surah_ids as number[] | null) ?? []),
            targetEnd: recEnd,
            daysLeft: calendarDaysLeftUtc(recEnd),
          },
        };
      }
    }

    const { data: logRows, error: logErr } = await admin
      .from("progress_events")
      .select("event_kind, summary, surah, created_at")
      .eq("member_id", selfId)
      .order("created_at", { ascending: false })
      .limit(100);

    const statusLog =
      !logErr && logRows
        ? logRows.map((r) => ({
            eventKind: r.event_kind as string,
            line: formatStatusLogLine(
              r.event_kind as string,
              r.summary as string | null,
              r.surah as string | null
            ),
            dateIso: r.created_at as string,
            dateDisplay: new Date(r.created_at as string).toLocaleString("en-GB", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
          }))
        : [];

    me = { needsOnboarding, memorized_surah_ids, goals: goalsPayload, statusLog, is_admin };
  }

  return NextResponse.json({
    ...agg.data,
    me,
  });
}
