"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";

type Profile = {
  display_name: string | null;
  daily_calorie_budget: number;
  weight_goal_lbs: number | null;
  goal_date: string | null;
  height_in: number | null;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [calorieBudget, setCalorieBudget] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/me").then((data: Profile) => {
      setProfile(data);
      setDisplayName(data.display_name ?? "");
      setFeet(data.height_in ? String(Math.floor(data.height_in / 12)) : "");
      setInches(data.height_in ? String(Math.round(data.height_in % 12)) : "");
      setCalorieBudget(String(data.daily_calorie_budget));
      setGoalWeight(data.weight_goal_lbs != null ? String(data.weight_goal_lbs) : "");
      setGoalDate(data.goal_date ?? "");
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const heightIn =
        feet || inches ? Number(feet || 0) * 12 + Number(inches || 0) : undefined;

      const updated = await api.patch("/api/me", {
        display_name: displayName || undefined,
        height_in: heightIn,
        daily_calorie_budget: calorieBudget ? Number(calorieBudget) : undefined,
        weight_goal_lbs: goalWeight ? Number(goalWeight) : undefined,
        goal_date: goalDate || undefined,
      });
      setProfile(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4 sm:px-8">
          <Logo />
          <Link
            href="/dashboard"
            className="text-[13px] text-muted hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-90 flex-1 px-6 pb-20 pt-10 sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1.5 text-[13px] text-muted">
          Update your measurements and goals.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-soft">
          {!profile ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="displayName"
                  className="text-[11px] font-medium uppercase tracking-wide text-muted"
                >
                  Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Height
                </label>
                <div className="flex gap-2">
                  <div className="flex flex-1 items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={8}
                      value={feet}
                      onChange={(e) => setFeet(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                    <span className="text-[13px] text-muted">ft</span>
                  </div>
                  <div className="flex flex-1 items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={11}
                      value={inches}
                      onChange={(e) => setInches(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                    <span className="text-[13px] text-muted">in</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="calorieBudget"
                  className="text-[11px] font-medium uppercase tracking-wide text-muted"
                >
                  Daily calorie budget
                </label>
                <input
                  id="calorieBudget"
                  type="number"
                  min={800}
                  max={10000}
                  value={calorieBudget}
                  onChange={(e) => setCalorieBudget(e.target.value)}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                />
              </div>

              <div className="flex gap-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  <label
                    htmlFor="goalWeight"
                    className="text-[11px] font-medium uppercase tracking-wide text-muted"
                  >
                    Goal weight (lbs)
                  </label>
                  <input
                    id="goalWeight"
                    type="number"
                    min={0}
                    step="0.1"
                    value={goalWeight}
                    onChange={(e) => setGoalWeight(e.target.value)}
                    className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <label
                    htmlFor="goalDate"
                    className="text-[11px] font-medium uppercase tracking-wide text-muted"
                  >
                    Goal date
                  </label>
                  <input
                    id="goalDate"
                    type="date"
                    value={goalDate}
                    onChange={(e) => setGoalDate(e.target.value)}
                    className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                  />
                </div>
              </div>

              <p className="text-xs text-muted-2">
                To log a new weigh-in, use the{" "}
                <Link href="/weight" className="text-accent hover:opacity-90">
                  weight page
                </Link>
                .
              </p>

              {error && <p className="text-[13px] text-danger">{error}</p>}
              {saved && !error && (
                <p className="text-[13px] text-accent">Saved.</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
