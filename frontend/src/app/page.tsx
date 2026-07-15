import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-260px] h-[260px] w-[260px] -translate-x-1/2 rounded-full opacity-[0.08] blur-[80px] sm:h-[340px] sm:w-[340px]"
        style={{ background: "var(--accent)" }}
      />

      <header className="relative flex items-center justify-between border-b border-border px-6 py-4 sm:px-8">
        <Logo />
        <Link
          href="/login"
          className="text-[13px] text-muted transition-colors hover:text-foreground"
        >
          Log in
        </Link>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="label-xs rounded-md border border-border bg-surface px-2 py-1">
          Calorie tracking
        </span>
        <h1 className="mt-5 max-w-md text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Track your progress.{" "}
          <span className="text-accent">Stay consistent.</span>
        </h1>
        <p className="mt-3 max-w-xs text-sm text-balance text-muted">
          Weekly deficit, weight trends, and a recipe box — with optional
          sharing if you&apos;ve got a partner.
        </p>
        <div className="mt-7 flex gap-2">
          <Link
            href="/signup"
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-border bg-surface px-4 py-2 text-[13px] font-medium transition-colors hover:border-accent"
          >
            Log in
          </Link>
        </div>
      </main>
    </div>
  );
}
