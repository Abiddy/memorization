import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const COOKIE = "alif_member_id";

const PostBodySchema = z.object({
  body: z.string().min(1).max(4000),
});

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("messages")
    .select("id, member_id, display_name, body, created_at")
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
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const admin = createAdminClient();
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
    })
    .select("id, member_id, display_name, body, created_at")
    .single();

  if (msgError || !msg) {
    return NextResponse.json({ error: msgError?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ message: msg });
}
