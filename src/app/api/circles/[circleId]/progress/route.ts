import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAggregatedProgress } from "@/lib/progress-response";
import { fetchCircleMemberIds, isMemberOfCircle } from "@/lib/circle-service";

const COOKIE = "alif_member_id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, ctx: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await ctx.params;
  if (!UUID_RE.test(circleId)) {
    return NextResponse.json({ error: "Invalid circle" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const memberId = cookieStore.get(COOKIE)?.value;
  if (!memberId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const admin = createAdminClient();
  const allowed = await isMemberOfCircle(admin, circleId, memberId);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const memberIds = await fetchCircleMemberIds(admin, circleId);
  const agg = await fetchAggregatedProgress(admin, memberIds);
  if (!agg.ok) {
    return NextResponse.json({ error: agg.error }, { status: 500 });
  }

  return NextResponse.json(agg.data);
}
