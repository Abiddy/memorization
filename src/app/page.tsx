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
    <div className="flex min-h-full flex-col items-center justify-center bg-[#fafaf8] px-4 py-16 dark:bg-zinc-950">
      <main className="w-full max-w-lg rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
          Alif · Laam · Meem
        </p>
        <h1 className="mt-3 text-center text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Quran memorisation club
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Share updates in one chat. When your message includes the word{" "}
          <span className="font-mono text-emerald-800 dark:text-emerald-300">chat</span>, we ask Gemini to log progress
          for the table and charts.
        </p>
        <div className="mt-8 flex justify-center">
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
