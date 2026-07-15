import Link from "next/link";
import { redirect } from "next/navigation";
import { Scale, UtensilsCrossed, Users, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { GridBackground } from "@/components/GridBackground";

const FEATURES = [
  {
    icon: Scale,
    title: "Trend, not noise",
    body: "A Kalman-filtered weight trend that ignores daily water-weight swings and shows what's actually happening.",
  },
  {
    icon: UtensilsCrossed,
    title: "Weekly, not daily",
    body: "Bank calories across the week instead of resetting to zero every midnight, so one big day doesn't wreck you.",
  },
  {
    icon: Users,
    title: "Better with a partner",
    body: "Connect with someone and share meals and recipes. Optional, and only what you choose to send.",
  },
  {
    icon: Sparkles,
    title: "A coach that knows your numbers",
    body: "Ask about a goal and get real math back: weeks remaining, lbs/week required, grounded in your actual data.",
  },
];

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
      <GridBackground maskEllipse="70% 55% at 50% 0%" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-260px] h-[260px] w-[260px] -translate-x-1/2 rounded-full opacity-[0.1] blur-[90px] sm:h-[380px] sm:w-[380px]"
        style={{ background: "var(--accent)" }}
      />

      <header className="relative flex items-center justify-between px-6 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-5">
          <Link
            href="/login"
            className="text-[13px] text-muted transition-colors hover:text-foreground"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="relative flex flex-1 flex-col items-center px-6">
        <div className="flex flex-1 flex-col items-center justify-center pb-16 pt-10 text-center sm:pt-16">
          <span className="label-xs rounded-full border border-border bg-surface px-2.5 py-1">
            Calorie tracking, done quietly
          </span>
          <h1 className="mt-6 max-w-lg text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Track your progress.{" "}
            <span className="text-accent">Stay consistent.</span>
          </h1>
          <p className="mt-4 max-w-sm text-[15px] text-balance text-muted">
            Weekly deficit, a real weight trend, and a recipe box, with optional
            sharing if you&apos;ve got a partner.
          </p>
          <div className="mt-8 flex gap-2">
            <Link
              href="/signup"
              className="rounded-lg bg-accent px-5 py-2.5 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90"
            >
              Get started
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-border bg-surface px-5 py-2.5 text-[13px] font-medium transition-colors hover:border-accent"
            >
              Log in
            </Link>
          </div>
        </div>

        <div className="w-full max-w-3xl border-t border-border py-12">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface">
                  <Icon size={16} className="text-accent" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-[13px] font-medium">{title}</h2>
                  <p className="mt-1 text-[13px] text-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="relative border-t border-border px-6 py-6 text-center sm:px-8">
        <p className="text-xs text-muted-2">
          Perigee, built for people who wanted to stop guessing.
        </p>
      </footer>
    </div>
  );
}
