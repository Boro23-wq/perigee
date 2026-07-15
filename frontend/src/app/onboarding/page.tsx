"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { localDateString } from "@/lib/date";
import { PerigeeMark } from "@/components/Logo";
import { Accordion } from "@/components/Accordion";
import {
  MacroTargetFields,
  type MacroTargetValues,
} from "@/components/MacroTargetFields";

export default function OnboardingPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [weight, setWeight] = useState("");
  const [calorieBudget, setCalorieBudget] = useState("1800");
  const [goalWeight, setGoalWeight] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [macros, setMacros] = useState<MacroTargetValues>({
    protein: "",
    carbs: "",
    fat: "",
    fiber: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const heightIn =
        feet || inches
          ? Number(feet || 0) * 12 + Number(inches || 0)
          : undefined;

      await api.patch("/api/me", {
        display_name: displayName || undefined,
        height_in: heightIn,
        daily_calorie_budget: calorieBudget ? Number(calorieBudget) : undefined,
        weight_goal_lbs: goalWeight ? Number(goalWeight) : undefined,
        goal_date: goalDate || undefined,
        protein_target_g: macros.protein ? Number(macros.protein) : undefined,
        carbs_target_g: macros.carbs ? Number(macros.carbs) : undefined,
        fat_target_g: macros.fat ? Number(macros.fat) : undefined,
        fiber_target_g: macros.fiber ? Number(macros.fiber) : undefined,
        complete_onboarding: true,
      });

      if (weight) {
        await api.post("/api/weight", {
          date: localDateString(),
          weight_lbs: Number(weight),
        });
      }

      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-12">
      <div className="relative w-full max-w-90">
        <div className="flex flex-col items-center">
          <PerigeeMark className="h-12 w-auto" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Set up your profile
          </h1>
          <p className="mt-1.5 text-center text-[13px] text-muted">
            A few basics so the coach and your trends actually mean something.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-surface p-6 shadow-soft">
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
                    placeholder="5"
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
                    placeholder="9"
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
                htmlFor="weight"
                className="text-[11px] font-medium uppercase tracking-wide text-muted"
              >
                Current weight (lbs)
              </label>
              <input
                id="weight"
                type="number"
                min={0}
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
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
                <div className="relative">
                  <input
                    id="goalDate"
                    type="date"
                    value={goalDate}
                    onChange={(e) => setGoalDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 pr-9 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                  />
                  <Calendar
                    size={13}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                  />
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-2">
              Goal fields are optional. You can add or change these anytime from
              your profile.
            </p>

            <Accordion
              title="Advanced: macro targets"
              subtitle="Protein, carbs, fat, fiber (optional)"
            >
              <MacroTargetFields
                values={macros}
                onChange={(key, value) =>
                  setMacros((m) => ({ ...m, [key]: value }))
                }
              />
            </Accordion>

            <p className="text-xs text-muted-2">
              Once you&apos;re in, connect a partner from the Partner tab or
              turn on reminders from your profile — either one anytime.
            </p>

            {error && <p className="text-[13px] text-danger">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Finish setup"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
