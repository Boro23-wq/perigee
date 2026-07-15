"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PerigeeMark } from "@/components/Logo";

function AuthBackdrop() {
  return (
    <>
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
    </>
  );
}

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setStatus("error");
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-12 text-center">
        <AuthBackdrop />
        <div className="relative flex flex-col items-center">
          <PerigeeMark className="h-12 w-auto" style={{ aspectRatio: "100 / 120" }} />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Check your email
          </h1>
          <p className="mt-2 max-w-70 text-[13px] text-muted">
            We sent a verification link to <strong className="text-foreground">{email}</strong>.
            Click it to activate your account, then log in.
          </p>
          <Link
            href="/login"
            className="mt-6 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90"
          >
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-12">
      <AuthBackdrop />

      <Link
        href="/login"
        className="absolute right-6 top-6 text-[13px] text-muted transition-colors hover:text-foreground"
      >
        Have an account? <span className="font-medium text-accent">Log in</span>
      </Link>

      <div className="relative w-full max-w-90">
        <div className="flex flex-col items-center">
          <PerigeeMark className="h-12 w-auto" style={{ aspectRatio: "100 / 120" }} />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Create your account
          </h1>
          <p className="mt-1.5 text-[13px] text-muted">
            Track your progress. Stay consistent.
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
              <label htmlFor="password" className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
              <p className="text-xs text-muted-2">At least 8 characters.</p>
            </div>

            {error && <p className="text-[13px] text-danger">{error}</p>}

            <button
              type="submit"
              disabled={status === "loading"}
              className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {status === "loading" ? "Creating account…" : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
