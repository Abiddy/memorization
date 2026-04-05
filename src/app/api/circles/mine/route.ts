import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const COOKIE = "alif_member_id";

export async function GET() {
  const cookieStore = await cookies();
  const memberId = cookieStore.get(COOKIE)?.value;
  if (!memberId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("circle_members")
    .select("circle_id")
    .eq("member_id", memberId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!row?.circle_id) {
    return NextResponse.json({ circle: null });
  }

  const { data: c, error: cErr } = await admin
    .from("circles")
    .select("id, name, invite_token, created_at")
    .eq("id", row.circle_id)
    .maybeSingle();

  if (cErr || !c) {
    return NextResponse.json({ circle: null });
  }

  const { count, error: countErr } = await admin
    .from("circle_members")
    .select("*", { count: "exact", head: true })
    .eq("circle_id", c.id);

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  return NextResponse.json({
    circle: {
      id: c.id,
      name: c.name,
      invite_token: c.invite_token,
      created_at: c.created_at,
      member_count: count ?? 0,
    },
  });
}
