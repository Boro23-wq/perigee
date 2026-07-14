"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { localDateString } from "@/lib/date";
import { Logo } from "@/components/Logo";

type Profile = {
  id: string;
  display_name: string | null;
  timezone: string;
  daily_calorie_budget: number;
  week_start_day: number;
  weight_goal_lbs: number | null;
  goal_date: string | null;
};

type Meal = {
  id: string;
  date: string;
  meal_type: string;
  source: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  notes: string | null;
  created_at: string;
};

type Totals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState("");

  const loadMeals = useCallback(async () => {
    const data = await api.get(`/api/meals?date=${localDateString()}`);
    setMeals(data.meals);
    setTotals(data.totals);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }
      setEmail(user.email ?? null);

      try {
        const [profileData] = await Promise.all([
          api.get("/api/me"),
          loadMeals(),
        ]);
        setProfile(profileData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      }
    }

    load();
  }, [router, loadMeals]);

  async function handleDelete(id: string) {
    setMeals((prev) => prev?.filter((m) => m.id !== id) ?? null);
    try {
      await api.delete(`/api/meals/${id}`);
      await loadMeals();
    } catch {
      await loadMeals();
    }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const budget = profile?.daily_calorie_budget ?? 0;
  const consumed = totals?.calories ?? 0;
  const pct = budget > 0 ? Math.min(100, Math.round((consumed / budget) * 100)) : 0;
  const remaining = budget - consumed;

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Logo />
        <button
          onClick={handleLogout}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          Log out
        </button>
      </header>

      <main className="flex-1 px-6 pb-24 sm:px-10">
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="mt-1 text-muted">{email ?? "Loading…"}</p>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-semibold tracking-tight">
              {consumed}
            </span>
            <span className="text-sm text-muted">of {budget} cal</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-muted">
            {remaining >= 0
              ? `${remaining} cal remaining`
              : `${Math.abs(remaining)} cal over`}
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted">Today&apos;s meals</h2>
          <Link
            href="/log"
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            + Log meal
          </Link>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {meals && meals.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
              Nothing logged yet today.
            </p>
          )}
          {meals?.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-muted">
                  {m.calories} cal · {m.meal_type}
                </p>
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                className="text-sm text-muted hover:text-danger transition-colors"
                aria-label={`Delete ${m.name}`}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
