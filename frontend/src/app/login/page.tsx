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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#07070a] px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 60% 50% at 50% 0%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 50% at 50% 0%, black 0%, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 -top-30 h-80 w-80 -translate-x-1/2 rounded-full opacity-25 blur-[100px]"
        style={{ background: "#0068ff" }}
      />

      <Link
        href="/signup"
        className="absolute right-6 top-6 text-[13px] text-white/50 transition-colors hover:text-white"
      >
        No account? <span className="font-medium text-[#4da3ff]">Sign up</span>
      </Link>

      <div className="relative w-full max-w-90">
        <div className="flex flex-col items-center">
          <PerigeeMark className="h-12 w-auto" style={{ aspectRatio: "100 / 120" }} />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">
            Sign in to Perigee
          </h1>
          <p className="mt-1.5 text-[13px] text-white/50">
            Welcome back — let&apos;s see today&apos;s numbers.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/3 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_20px_60px_-15px_rgba(0,104,255,0.15)] backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[11px] font-medium uppercase tracking-wide text-white/40">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-white/10 bg-white/4 px-3 py-2.5 text-[13px] text-white outline-none transition-shadow placeholder:text-white/30 focus:border-[#4da3ff] focus:ring-2 focus:ring-[#0068ff]/25"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-[11px] font-medium uppercase tracking-wide text-white/40">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border border-white/10 bg-white/4 px-3 py-2.5 text-[13px] text-white outline-none transition-shadow placeholder:text-white/30 focus:border-[#4da3ff] focus:ring-2 focus:ring-[#0068ff]/25"
              />
            </div>

            {error && <p className="text-[13px] text-[#f87171]">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 rounded-lg bg-linear-to-b from-[#2f9bff] to-[#0068ff] px-4 py-2.5 text-[13px] font-medium text-white shadow-[0_8px_24px_-8px_rgba(0,104,255,0.6)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
