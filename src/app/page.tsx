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
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-16">
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-zinc-950 bg-cover bg-center bg-no-repeat [background-image:url('/login-background.png')]"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-black/25 dark:bg-black/35" />
      <main className="relative w-full max-w-lg">
        <h1 className="text-center text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Hfz.app
        </h1>
        <p className="mx-auto mt-2 max-w-md text-center text-base font-medium text-zinc-600 dark:text-zinc-300">
          Track your Quran Journey
        </p>
        <p className="mx-auto mt-5 max-w-md text-center text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          This is the Book about which there is no doubt—a guidance for those mindful of Allah.
        </p>
        <p className="mx-auto mt-2 text-center text-xs text-zinc-500 dark:text-zinc-500">Surah Al-Baqarah, ayah 2</p>
        <div className="mt-8 flex justify-center">
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
