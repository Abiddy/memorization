import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const COOKIE = "alif_member_id";

/** Remove the signed-in member from their circle (one membership per member in v1). */
export async function POST() {
  const cookieStore = await cookies();
  const memberId = cookieStore.get(COOKIE)?.value;
  if (!memberId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: row, error: selErr } = await admin
    .from("circle_members")
    .select("circle_id")
    .eq("member_id", memberId)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (!row?.circle_id) {
    return NextResponse.json({ error: "You are not in a circle." }, { status: 400 });
  }

  const { error: delErr } = await admin.from("circle_members").delete().eq("member_id", memberId);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
