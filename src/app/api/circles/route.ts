import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMemberCircleId } from "@/lib/circle-service";

const COOKIE = "alif_member_id";

const BodySchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80, "Name is too long."),
});

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
    const msg = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const admin = createAdminClient();
  const existingCircleId = await fetchMemberCircleId(admin, memberId);
  if (existingCircleId) {
    return NextResponse.json(
      { error: "You already belong to a Suhbah circle. Leave it before creating another." },
      { status: 409 }
    );
  }

  const name = parsed.data.name.trim();
  const { data: circle, error: cErr } = await admin
    .from("circles")
    .insert({ name, created_by: memberId })
    .select("id, name, invite_token, created_at")
    .single();

  if (cErr || !circle) {
    return NextResponse.json({ error: cErr?.message ?? "Could not create circle." }, { status: 500 });
  }

  const { error: mErr } = await admin.from("circle_members").insert({
    circle_id: circle.id,
    member_id: memberId,
    role: "owner",
  });

  if (mErr) {
    await admin.from("circles").delete().eq("id", circle.id);
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  return NextResponse.json({
    circle: {
      id: circle.id,
      name: circle.name,
      invite_token: circle.invite_token,
      created_at: circle.created_at,
      member_count: 1,
    },
  });
}
