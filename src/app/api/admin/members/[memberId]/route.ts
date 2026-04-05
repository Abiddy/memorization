import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isClubAdminRow } from "@/lib/club-admin";

const COOKIE = "alif_member_id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(_request: Request, ctx: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await ctx.params;
  if (!UUID_RE.test(memberId)) {
    return NextResponse.json({ error: "Invalid member id" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const selfId = cookieStore.get(COOKIE)?.value;
  if (!selfId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  if (memberId === selfId) {
    return NextResponse.json({ error: "You cannot remove your own account." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: self, error: selfErr } = await admin
    .from("members")
    .select("id, username")
    .eq("id", selfId)
    .maybeSingle();

  if (selfErr || !self || !isClubAdminRow(self)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: delErr } = await admin.from("members").delete().eq("id", memberId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
