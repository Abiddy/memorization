import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMemberOfCircle } from "@/lib/circle-service";

const COOKIE = "alif_member_id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PostBodySchema = z.object({
  body: z.string().min(1).max(4000),
  circleId: z.string().uuid("Invalid circle."),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const circleId = searchParams.get("circleId");
  if (!circleId || !UUID_RE.test(circleId)) {
    return NextResponse.json({ error: "Missing or invalid circleId." }, { status: 400 });
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

  const { data, error } = await admin
    .from("messages")
    .select("id, member_id, display_name, body, created_at, circle_id")
    .eq("circle_id", circleId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: (data ?? []).reverse() });
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

  const parsed = PostBodySchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid message";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const admin = createAdminClient();
  const allowed = await isMemberOfCircle(admin, parsed.data.circleId, memberId);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: member, error: memberError } = await admin
    .from("members")
    .select("id, display_name")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 401 });
  }

  const body = parsed.data.body.trim();
  const { data: msg, error: msgError } = await admin
    .from("messages")
    .insert({
      member_id: member.id,
      display_name: member.display_name,
      body,
      circle_id: parsed.data.circleId,
    })
    .select("id, member_id, display_name, body, created_at, circle_id")
    .single();

  if (msgError || !msg) {
    return NextResponse.json({ error: msgError?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ message: msg });
}
