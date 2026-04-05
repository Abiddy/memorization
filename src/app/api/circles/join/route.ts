import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMemberCircleId } from "@/lib/circle-service";
import { parseInviteTokenFromInput } from "@/lib/invite-token";

const COOKIE = "alif_member_id";

const BodySchema = z.object({
  inviteLinkOrToken: z.string().min(1, "Paste an invite link or code."),
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

  const token = parseInviteTokenFromInput(parsed.data.inviteLinkOrToken);
  if (!token) {
    return NextResponse.json({ error: "No valid invite code found in that text." }, { status: 400 });
  }

  const admin = createAdminClient();
  const existingCircleId = await fetchMemberCircleId(admin, memberId);
  if (existingCircleId) {
    return NextResponse.json(
      { error: "You already belong to a Suhbah circle." },
      { status: 409 }
    );
  }

  const { data: circle, error: findErr } = await admin
    .from("circles")
    .select("id, name, invite_token, created_at")
    .eq("invite_token", token)
    .maybeSingle();

  if (findErr || !circle) {
    return NextResponse.json({ error: "That invite is not valid or has expired." }, { status: 404 });
  }

  const { error: insErr } = await admin.from("circle_members").insert({
    circle_id: circle.id,
    member_id: memberId,
    role: "member",
  });

  if (insErr) {
    if (insErr.code === "23505") {
      return NextResponse.json({ error: "You already belong to a circle." }, { status: 409 });
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const { count } = await admin
    .from("circle_members")
    .select("*", { count: "exact", head: true })
    .eq("circle_id", circle.id);

  return NextResponse.json({
    circle: {
      id: circle.id,
      name: circle.name,
      invite_token: circle.invite_token,
      created_at: circle.created_at,
      member_count: count ?? 1,
    },
  });
}
