"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { localDateString } from "@/lib/date";
import { Logo } from "@/components/Logo";
import { Skeleton } from "@/components/Skeleton";
import { WeightChart, type WeightEntry } from "@/components/WeightChart";

type Summary = {
  start_weight: number | null;
  current_weight: number | null;
  goal_weight_lbs: number | null;
  goal_date: string | null;
  trend_lbs_per_week: number | null;
  pace_status: "on_pace" | "behind_pace" | null;
};

const RANGES = [
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "1y", value: "365d" },
];

export default function WeightPage() {
  const [range, setRange] = useState("90d");
  const [entries, setEntries] = useState<WeightEntry[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  const [weight, setWeight] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (r: string) => {
    try {
      const data = await api.get(`/api/weight/history?range=${r}`);
      setEntries(data.entries);
      setSummary(data.summary);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load weight history",
      );
    }
  }, []);

  useEffect(() => {
    async function run() {
      try {
        const data = await api.get(`/api/weight/history?range=${range}`);
        setEntries(data.entries);
        setSummary(data.summary);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load weight history",
        );
      }
    }
    run();
  }, [range]);

  async function handleWeighIn(e: FormEvent) {
    e.preventDefault();
    if (!weight) return;
    setSubmitting(true);
    setError("");

    try {
      await api.post("/api/weight", {
        date: localDateString(),
        weight_lbs: Number(weight),
      });
      setWeight("");
      await load(range);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log weight");
    } finally {
      setSubmitting(false);
    }
  }

  const paceMessage =
    summary?.pace_status === "on_pace"
      ? "On pace for your goal"
      : summary?.pace_status === "behind_pace"
        ? "Slightly behind pace"
        : null;

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

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-20 pt-6 sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight">Weight</h1>

        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}

        {!summary && (
          <div className="mt-5 rounded-xl border border-border bg-surface p-5 shadow-soft">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        )}

        {summary &&
          (summary.start_weight !== null ||
            summary.current_weight !== null) && (
            <div className="mt-5 rounded-xl border border-border bg-surface p-5 shadow-soft">
              <div className="flex items-center gap-2 text-[13px] text-muted">
                <span>Start {summary.start_weight?.toFixed(1)}</span>
                <ArrowRight size={14} className="text-muted-2" />
                <span className="text-base font-semibold tabular-nums text-foreground">
                  Now {summary.current_weight?.toFixed(1)}
                </span>
                {summary.goal_weight_lbs !== null && (
                  <>
                    <ArrowRight size={14} className="text-muted-2" />
                    <span>Goal {summary.goal_weight_lbs}</span>
                  </>
                )}
              </div>
              {paceMessage && (
                <p className="mt-2 text-[13px] text-accent">{paceMessage}</p>
              )}
            </div>
          )}

        <div className="mt-5 flex items-end justify-between">
          <div>
            <h2 className="label-xs">Trend</h2>
            <p className="mt-1 max-w-md text-[13px] text-muted">
              Daily weigh-ins (dots) with a smoothed trend line. Your weight
              swings a few pounds a day from water and food, not fat — the
              trend line is what actually matters.
            </p>
          </div>
          <div className="flex shrink-0 gap-0.5 rounded-lg border border-border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  range === r.value
                    ? "bg-accent text-accent-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-border bg-surface p-4 shadow-soft">
          {entries ? (
            <WeightChart entries={entries} />
          ) : (
            <div className="flex h-55 items-end gap-2 px-2 pb-2">
              {Array.from({ length: 20 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="w-full"
                  style={{ height: `${20 + ((i * 37) % 60)}%` }}
                />
              ))}
            </div>
          )}
        </div>

        <section className="mt-7">
          <h2 className="label-xs">Quick weigh-in</h2>
          <form
            onSubmit={handleWeighIn}
            className="mt-3 flex flex-col gap-3 sm:flex-row"
          >
            <input
              type="number"
              step="0.1"
              min={0}
              max={1499}
              inputMode="decimal"
              placeholder="Weight (lbs)"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
            />
            <button
              type="submit"
              disabled={submitting || !weight}
              className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50 sm:shrink-0"
            >
              {submitting ? "Saving…" : "Log"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
