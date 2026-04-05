import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isClubAdminRow } from "@/lib/club-admin";

const COOKIE = "alif_member_id";

export async function GET() {
  const cookieStore = await cookies();
  const selfId = cookieStore.get(COOKIE)?.value;
  if (!selfId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
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

  const { data: rows, error } = await admin
    .from("members")
    .select("id, display_name, username, created_at")
    .order("display_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ members: rows ?? [] });
}
