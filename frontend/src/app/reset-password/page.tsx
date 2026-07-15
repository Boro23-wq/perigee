"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PerigeeMark } from "@/components/Logo";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setStatus("loading");

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setStatus("error");
      return;
    }

    setStatus("done");
  }

  if (status === "done") {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-12 text-center">
        <div className="relative flex flex-col items-center">
          <PerigeeMark className="h-12 w-auto" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Password updated
          </h1>
          <p className="mt-2 max-w-70 text-[13px] text-muted">
            Your password has been reset. You can now log in with it.
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
      <div className="relative w-full max-w-90">
        <div className="flex flex-col items-center">
          <Link href="/" aria-label="Perigee home">
            <PerigeeMark className="h-12 w-auto" />
          </Link>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Set a new password
          </h1>
          <p className="mt-1.5 text-[13px] text-muted">
            Choose something you haven&apos;t used before.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-surface p-6 shadow-soft">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-[11px] font-medium uppercase tracking-wide text-muted">
                New password
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

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirmPassword" className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>

            {error && <p className="text-[13px] text-danger">{error}</p>}

            <button
              type="submit"
              disabled={status === "loading"}
              className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {status === "loading" ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
