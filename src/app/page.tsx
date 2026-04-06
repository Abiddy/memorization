import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/app/components/login-form";

const COOKIE = "alif_member_id";

export default async function Home() {
  const cookieStore = await cookies();
  if (cookieStore.get(COOKIE)?.value) {
    redirect("/club");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-black px-4 py-16">
      <main className="w-full max-w-lg">
        <div className="flex justify-center">
          <Image
            src="/app-icon.png"
            alt=""
            width={96}
            height={96}
            className="h-20 w-20 shrink-0 rounded-2xl object-contain shadow-lg ring-1 ring-white/15 sm:h-24 sm:w-24"
            priority
            aria-hidden
          />
        </div>
        <h1 className="mt-5 text-center text-3xl font-semibold tracking-tight text-zinc-50">
          Hfz.app
        </h1>
        <p className="mx-auto mt-2 max-w-md text-center text-base font-medium text-zinc-400">
          Track your Quran Journey
        </p>
        <p className="mx-auto mt-5 max-w-md text-center text-sm leading-relaxed text-zinc-400">
          This is the Book about which there is no doubt—a guidance for those mindful of Allah.
        </p>
        <p className="mx-auto mt-2 text-center text-xs text-zinc-500">Surah Al-Baqarah, ayah 2</p>
        <div className="mt-8 flex justify-center">
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
