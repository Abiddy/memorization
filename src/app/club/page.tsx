import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClubRoom } from "@/app/components/club-room";

const COOKIE = "alif_member_id";

export default async function ClubPage() {
  const cookieStore = await cookies();
  const memberId = cookieStore.get(COOKIE)?.value;
  if (!memberId) {
    redirect("/");
  }

  let displayName: string;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("members").select("display_name").eq("id", memberId).maybeSingle();
    if (!data?.display_name) {
      redirect("/");
    }
    displayName = data.display_name;
  } catch {
    redirect("/");
  }

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#fafaf8] dark:bg-zinc-950">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ClubRoom memberId={memberId} initialDisplayName={displayName} />
      </div>
    </div>
  );
}
