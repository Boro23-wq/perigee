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
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Logo />
        <Link
          href="/login"
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          Log in
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="max-w-md text-4xl font-semibold tracking-tight sm:text-5xl">
          Track together.{" "}
          <span className="text-accent">Stay consistent.</span>
        </h1>
        <p className="mt-4 max-w-sm text-balance text-muted">
          Calorie tracking built for two — weekly deficit, weight trends, and
          a shared recipe box.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/signup"
            className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-surface"
          >
            Log in
          </Link>
        </div>
      </main>
    </div>
  );
}
