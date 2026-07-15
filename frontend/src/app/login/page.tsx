"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PerigeeMark } from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 60% 50% at 50% 0%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 50% at 50% 0%, black 0%, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 -top-30 h-80 w-80 -translate-x-1/2 rounded-full opacity-10 blur-[100px]"
        style={{ background: "var(--accent)" }}
      />

      <Link
        href="/signup"
        className="absolute right-6 top-6 text-[13px] text-muted transition-colors hover:text-foreground"
      >
        No account? <span className="font-medium text-accent">Sign up</span>
      </Link>

      <div className="relative w-full max-w-90">
        <div className="flex flex-col items-center">
          <Link href="/" aria-label="Perigee home">
            <PerigeeMark className="h-12 w-auto" />
          </Link>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Sign in to Perigee
          </h1>
          <p className="mt-1.5 text-[13px] text-muted">
            Welcome back, let&apos;s see today&apos;s numbers.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-surface p-6 shadow-soft">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[11px] text-muted transition-colors hover:text-accent"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>

            {error && <p className="text-[13px] text-danger">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
