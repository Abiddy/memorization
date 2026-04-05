import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPassword, verifyPassword } from "@/lib/password";
import { fetchCircleMemberIds, fetchMemberCircleId } from "@/lib/circle-service";

const UsernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(32, "Username is too long.")
  .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, underscores, or hyphens only.");

const BodySchema = z.object({
  username: UsernameSchema,
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
});

const COOKIE = "alif_member_id";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function GET() {
  const cookieStore = await cookies();
  const memberId = cookieStore.get(COOKIE)?.value;
  if (!memberId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const admin = createAdminClient();
  const circleId = await fetchMemberCircleId(admin, memberId);

  if (!circleId) {
    const { data: selfOnly, error: selfErr } = await admin
      .from("members")
      .select("id, display_name")
      .eq("id", memberId)
      .maybeSingle();
    if (selfErr) {
      return NextResponse.json({ error: selfErr.message }, { status: 500 });
    }
    return NextResponse.json({ members: selfOnly ? [selfOnly] : [] });
  }

  const ids = await fetchCircleMemberIds(admin, circleId);
  if (ids.length === 0) {
    return NextResponse.json({ members: [] });
  }

  const { data, error } = await admin
    .from("members")
    .select("id, display_name")
    .in("id", ids)
    .order("display_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ members: data ?? [] });
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
    const msg = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const usernameNormalized = parsed.data.username.trim().toLowerCase();
  const password = parsed.data.password;
  const displayName = parsed.data.username.trim();
  const admin = createAdminClient();

  const { data: existing, error: findError } = await admin
    .from("members")
    .select("id, display_name, password_hash")
    .eq("username", usernameNormalized)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  let memberId: string;
  let name: string;

  if (existing) {
    if (!existing.password_hash) {
      return NextResponse.json(
        { error: "This account has no password set yet. Ask your admin to finish setup." },
        { status: 403 },
      );
    }
    const ok = verifyPassword(password, existing.password_hash);
    if (!ok) {
      return NextResponse.json({ error: "Wrong password." }, { status: 401 });
    }
    memberId = existing.id;
    name = existing.display_name;
  } else {
    const passwordHash = hashPassword(password);
    const { data: inserted, error: insertError } = await admin
      .from("members")
      .insert({
        username: usernameNormalized,
        display_name: displayName,
        password_hash: passwordHash,
      })
      .select("id, display_name")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "That username or display name is already taken." }, { status: 409 });
      }
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
