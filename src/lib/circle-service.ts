import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchMemberCircleId(
  admin: SupabaseClient,
  memberId: string
): Promise<string | null> {
  const { data, error } = await admin
    .from("circle_members")
    .select("circle_id")
    .eq("member_id", memberId)
    .maybeSingle();
  if (error || !data) return null;
  return data.circle_id as string;
}

export async function fetchCircleMemberIds(
  admin: SupabaseClient,
  circleId: string
): Promise<string[]> {
  const { data, error } = await admin.from("circle_members").select("member_id").eq("circle_id", circleId);
  if (error || !data) return [];
  return data.map((r) => r.member_id as string);
}

export async function isMemberOfCircle(
  admin: SupabaseClient,
  circleId: string,
  memberId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("circle_members")
    .select("member_id")
    .eq("circle_id", circleId)
    .eq("member_id", memberId)
    .maybeSingle();
  return !error && Boolean(data);
}
