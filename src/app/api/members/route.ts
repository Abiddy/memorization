import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({
  display_name: z.string().min(1).max(80),
});

const COOKIE = "alif_member_id";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function GET() {
  const cookieStore = await cookies();
  if (!cookieStore.get(COOKIE)?.value) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("members").select("id, display_name").order("display_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ members: data ?? [] });
}

function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid display name" }, { status: 400 });
  }

  const displayName = parsed.data.display_name.trim();
  const admin = createAdminClient();

  const safePattern = escapeIlike(displayName);
  const { data: existing, error: findError } = await admin
    .from("members")
    .select("id, display_name")
    .ilike("display_name", safePattern)
    .limit(1)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  let memberId: string;
  let name: string;

  if (existing) {
    memberId = existing.id;
    name = existing.display_name;
  } else {
    const { data: inserted, error: insertError } = await admin
      .from("members")
      .insert({ display_name: displayName })
      .select("id, display_name")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    memberId = inserted.id;
    name = inserted.display_name;
  }

  const res = NextResponse.json({ id: memberId, display_name: name });
  res.cookies.set(COOKIE, memberId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
