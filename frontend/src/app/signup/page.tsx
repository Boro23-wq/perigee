"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

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
      <div className="flex min-h-full flex-col items-center justify-center px-6 text-center">
        <Logo className="mb-6" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Check your email
        </h1>
        <p className="mt-2 max-w-xs text-muted">
          We sent a verification link to <strong>{email}</strong>. Click it to
          activate your account, then log in.
        </p>
        <Link
          href="/login"
          className="mt-6 rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 justify-center" />
        <h1 className="text-center text-2xl font-semibold tracking-tight">
          Create your account
        </h1>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
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
              className="rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
            />
            <p className="text-xs text-muted">At least 8 characters.</p>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={status === "loading"}
            className="mt-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {status === "loading" ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
