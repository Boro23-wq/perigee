"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MoreVertical } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { localDateString } from "@/lib/date";
import { AppHeader } from "@/components/AppHeader";
import { Skeleton } from "@/components/Skeleton";

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
  ai_confidence: "low" | "medium" | "high" | null;
  created_at: string;
};

type Totals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

type WeightSummary = {
  current_weight: number | null;
  trend_lbs_per_week: number | null;
};

type DayStat = {
  date: string;
  consumed: number;
  burned: number;
  effective_budget: number;
};

type WeeklyStats = {
  week_start: string;
  week_end: string;
  daily_calorie_budget: number;
  days: DayStat[];
  days_elapsed: number;
  days_remaining: number;
  weekly_budget_total: number;
  weekly_consumed_so_far: number;
  banking: number;
  remaining_budget: number;
  remaining_per_day: number;
  weight_trend: WeightSummary | null;
};

type Activity = {
  date: string;
  steps: number | null;
  workout_type: string | null;
  workout_minutes: number | null;
  calories_burned: number;
};

type PartnerStatus = {
  status: "none" | "pending_outgoing" | "pending_incoming" | "active";
  partner: { id: string; email: string; display_name: string | null } | null;
};

type Checkin = {
  date: string;
  mood: "great" | "ok" | "rough" | null;
  coach_response: string;
};

const MOODS = [
  { value: "great", label: "Great" },
  { value: "ok", label: "Okay" },
  { value: "rough", label: "Rough" },
] as const;

function dayLabel(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "narrow",
  });
}

type MacroTargets = {
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  fiber_target_g: number | null;
};

function hasMacroTargets(p: MacroTargets) {
  return (
    p.protein_target_g != null ||
    p.carbs_target_g != null ||
    p.fat_target_g != null ||
    p.fiber_target_g != null
  );
}

function MacroBar({
  label,
  consumed,
  target,
}: {
  label: string;
  consumed: number;
  target: number;
}) {
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-foreground">
          {Math.round(consumed)} <span className="text-muted">/ {Math.round(target)}g</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<{
    display_name: string | null;
    avatar_url: string | null;
    protein_target_g: number | null;
    carbs_target_g: number | null;
    fat_target_g: number | null;
    fiber_target_g: number | null;
  } | null>(null);
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activitySubmitting, setActivitySubmitting] = useState(false);
  const [error, setError] = useState("");
  const [partner, setPartner] = useState<PartnerStatus | null>(null);
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [checkinLoaded, setCheckinLoaded] = useState(false);
  const [checkinMood, setCheckinMood] = useState<string | null>(null);
  const [checkinError, setCheckinError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [newSharedIds, setNewSharedIds] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<string | null>(null);
  const sharedCheckDone = useRef(false);

  const loadMeals = useCallback(async () => {
    const data = await api.get(`/api/meals?date=${localDateString()}`);
    setMeals(data.meals);
    setTotals(data.totals);
  }, []);

  const loadStats = useCallback(async () => {
    const data = await api.get("/api/stats/weekly");
    setStats(data);
  }, []);

  const loadActivity = useCallback(async () => {
    const data = await api.get(`/api/activity?date=${localDateString()}`);
    setActivity(data);
  }, []);

  const loadPartner = useCallback(async () => {
    const data = await api.get("/api/partner");
    setPartner(data);
  }, []);

  const loadCheckin = useCallback(async () => {
    try {
      const data = await api.get(
        `/api/coach/checkin?date=${localDateString()}`,
      );
      setCheckin(data);
    } catch {
      setCheckin(null);
    } finally {
      setCheckinLoaded(true);
    }
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
        const me = await api.get("/api/me");
        if (!me.onboarded) {
          router.replace("/onboarding");
          return;
        }
        setProfile({
          display_name: me.display_name,
          avatar_url: me.avatar_url,
          protein_target_g: me.protein_target_g,
          carbs_target_g: me.carbs_target_g,
          fat_target_g: me.fat_target_g,
          fiber_target_g: me.fiber_target_g,
        });

        await Promise.all([
          loadMeals(),
          loadStats(),
          loadActivity(),
          loadPartner(),
          loadCheckin(),
        ]);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load dashboard",
        );
      }
    }

    load();
  }, [router, loadMeals, loadStats, loadActivity, loadPartner, loadCheckin]);

  // First time a shared meal from a partner shows up, flag it: a one-time
  // highlight + banner, tracked in localStorage so it never repeats.
  useEffect(() => {
    if (sharedCheckDone.current || !meals || !partner) return;
    sharedCheckDone.current = true;

    const seenKey = "perigee_seen_shared_meals";
    const seen: string[] = JSON.parse(localStorage.getItem(seenKey) ?? "[]");
    const seenSet = new Set(seen);

    const shared = meals.filter((m) => m.source === "shared");
    const freshlyShared = shared.filter((m) => !seenSet.has(m.id));

    localStorage.setItem(
      seenKey,
      JSON.stringify(shared.map((m) => m.id)),
    );

    if (freshlyShared.length === 0) return;

    const name =
      partner.status === "active" && partner.partner
        ? (partner.partner.display_name ?? partner.partner.email.split("@")[0])
        : "Your partner";
    const message =
      freshlyShared.length === 1
        ? `${name} shared a meal with you`
        : `${name} shared ${freshlyShared.length} meals with you`;

    // Deferred so the state update happens outside the effect body itself.
    queueMicrotask(() => {
      setNewSharedIds(new Set(freshlyShared.map((m) => m.id)));
      setBanner(message);
      setTimeout(() => setBanner(null), 5000);
    });
  }, [meals, partner]);

  async function handleActivitySubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setActivitySubmitting(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const steps = form.get("steps");
    const workoutType = form.get("workout_type");
    const workoutMinutes = form.get("workout_minutes");
    const caloriesBurned = form.get("calories_burned");

    try {
      await api.post("/api/activity", {
        date: localDateString(),
        steps: steps ? Number(steps) : null,
        workout_type: workoutType ? String(workoutType) : null,
        workout_minutes: workoutMinutes ? Number(workoutMinutes) : null,
        calories_burned: caloriesBurned ? Number(caloriesBurned) : 0,
      });
      await Promise.all([loadActivity(), loadStats()]);
      setActivityOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log activity");
    } finally {
      setActivitySubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setOpenMenuId(null);
    setMeals((prev) => prev?.filter((m) => m.id !== id) ?? null);
    try {
      await api.delete(`/api/meals/${id}`);
      await Promise.all([loadMeals(), loadStats()]);
    } catch {
      await Promise.all([loadMeals(), loadStats()]);
    }
  }

  async function handleShare(id: string) {
    setSharingId(id);
    setError("");
    try {
      await api.post(`/api/meals/${id}/share`, {});
      setSharedIds((prev) => new Set(prev).add(id));
      setOpenMenuId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share meal");
    } finally {
      setSharingId(null);
    }
  }

  async function handleCheckin(mood: string) {
    setCheckinMood(mood);
    setCheckinError("");
    try {
      const data = await api.post("/api/coach/checkin", {
        date: localDateString(),
        mood,
      });
      setCheckin(data);
    } catch (err) {
      setCheckinError(
        err instanceof Error ? err.message : "Coach is unavailable right now",
      );
    } finally {
      setCheckinMood(null);
    }
  }

  const today = localDateString();
  const todayStat = stats?.days.find((d) => d.date === today);
  const budget =
    todayStat?.effective_budget ?? stats?.daily_calorie_budget ?? 0;
  const consumed = totals?.calories ?? 0;
  const pct =
    budget > 0 ? Math.min(100, Math.round((consumed / budget) * 100)) : 0;
  const remaining = budget - consumed;

  const partnerName =
    partner?.status === "active" && partner.partner
      ? (partner.partner.display_name ?? partner.partner.email.split("@")[0])
      : null;

  const maxDayBudget = stats
    ? Math.max(
        ...stats.days.map((d) => Math.max(d.consumed, d.effective_budget)),
        1,
      )
    : 1;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-20 pt-6 sm:px-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Today</h1>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted">
              {profile?.display_name || email || "Loading…"}
            </span>
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="h-7 w-7 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-2 text-[11px] font-medium text-muted">
                {(profile?.display_name || email || "?").charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}

        {stats && totals ? (
          <div className="mt-4 rounded-xl border border-border bg-surface p-5 shadow-soft">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular-nums tracking-tight">
                {consumed}
              </span>
              <span className="text-[13px] text-muted">of {budget} cal</span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-[13px] text-muted">
              {remaining >= 0
                ? `${remaining} cal remaining`
                : `${Math.abs(remaining)} cal over`}
              {todayStat && todayStat.burned > 0 && (
                <> · +{Math.min(todayStat.burned, 500)} cal from activity</>
              )}
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-border bg-surface p-5 shadow-soft">
            <div className="flex items-baseline justify-between">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
            <Skeleton className="mt-2 h-4 w-40" />
          </div>
        )}

        {totals && profile && hasMacroTargets(profile) && (
          <div className="mt-3 rounded-xl border border-border bg-surface p-5 shadow-soft">
            <p className="label-xs">Macros</p>
            <div className="mt-3 flex flex-col gap-3">
              {profile.protein_target_g != null && (
                <MacroBar label="Protein" consumed={totals.protein} target={profile.protein_target_g} />
              )}
              {profile.carbs_target_g != null && (
                <MacroBar label="Carbs" consumed={totals.carbs} target={profile.carbs_target_g} />
              )}
              {profile.fat_target_g != null && (
                <MacroBar label="Fat" consumed={totals.fat} target={profile.fat_target_g} />
              )}
              {profile.fiber_target_g != null && (
                <MacroBar label="Fiber" consumed={totals.fiber} target={profile.fiber_target_g} />
              )}
            </div>
          </div>
        )}

        {checkinLoaded && (
          <div className="mt-3 rounded-xl border border-border bg-surface p-5 shadow-soft">
            <p className="label-xs">Coach</p>
            {checkin ? (
              <>
                <p className="mt-2 text-[13px] leading-relaxed text-foreground">
                  {checkin.coach_response}
                </p>
                <button
                  onClick={() => setCheckin(null)}
                  className="mt-3 text-xs text-muted hover:text-foreground transition-colors"
                >
                  Check in again
                </button>
              </>
            ) : (
              <>
                <p className="mt-1 text-[13px] text-muted">
                  How&apos;s today going?
                </p>
                <div className="mt-3 flex gap-2">
                  {MOODS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => handleCheckin(m.value)}
                      disabled={checkinMood !== null}
                      className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] font-medium transition-colors hover:border-accent disabled:opacity-60"
                    >
                      {checkinMood === m.value ? "…" : m.label}
                    </button>
                  ))}
                </div>
                {checkinError && (
                  <p className="mt-2 text-[13px] text-danger">{checkinError}</p>
                )}
              </>
            )}
          </div>
        )}

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!stats && (
            <div className="rounded-xl border border-border bg-surface p-5 shadow-soft sm:col-span-2">
              <div className="flex items-baseline justify-between">
                <div>
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-2 h-5 w-32" />
                </div>
                <div className="flex flex-col items-end">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="mt-2 h-5 w-10" />
                </div>
              </div>
              <div className="mt-4 flex items-end gap-2" style={{ height: 48 }}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="w-full"
                    style={{ height: (48 * ((i % 4) + 2)) / 5 }}
                  />
                ))}
              </div>
            </div>
          )}
          {stats && (
            <div className="rounded-xl border border-border bg-surface p-5 shadow-soft sm:col-span-2">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="label-xs">This week</p>
                  <p className="mt-1 mb-4 text-lg font-semibold tracking-tight">
                    {Math.round(stats.remaining_per_day)} cal/day left
                  </p>
                </div>
                <div className="text-right">
                  <p className="label-xs">
                    {stats.banking >= 0 ? "Banked" : "Over pace"}
                  </p>
                  <p
                    className={`mt-1 text-base font-semibold tabular-nums ${stats.banking >= 0 ? "text-accent" : "text-danger"}`}
                  >
                    {stats.banking >= 0 ? "+" : ""}
                    {stats.banking}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-end gap-2" style={{ height: 48 }}>
                {stats.days.map((d) => {
                  const consumedH = (d.consumed / maxDayBudget) * 48;
                  const budgetH = (d.effective_budget / maxDayBudget) * 48;
                  const isToday = d.date === today;
                  const isFuture = d.date > today;
                  return (
                    <div
                      key={d.date}
                      className="flex flex-1 flex-col items-center gap-1"
                    >
                      <div
                        className="relative w-full overflow-hidden rounded-t"
                        style={{ height: 48 }}
                      >
                        <div
                          className="absolute bottom-0 w-full rounded-t bg-surface-2"
                          style={{ height: budgetH }}
                        />
                        {!isFuture && (
                          <div
                            className={`absolute bottom-0 w-full rounded-t ${
                              d.consumed > d.effective_budget
                                ? "bg-danger"
                                : "bg-accent"
                            }`}
                            style={{
                              height: consumedH,
                              opacity: isToday ? 1 : 0.7,
                            }}
                          />
                        )}
                      </div>
                      <span
                        className={`text-[10px] ${isToday ? "font-semibold text-foreground" : "text-muted"}`}
                      >
                        {dayLabel(d.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-surface p-5 shadow-soft">
            <button
              onClick={() => setActivityOpen((o) => !o)}
              className="group flex w-full items-center justify-between text-left"
            >
              <div>
                <p className="label-xs">Activity</p>
                <p className="mt-1 text-base font-semibold tracking-tight transition-colors group-hover:text-accent">
                  {activity?.calories_burned
                    ? `${activity.calories_burned} cal burned`
                    : "Log activity"}
                </p>
                {(activity?.steps || activity?.workout_type) && (
                  <p className="mt-1 text-xs text-muted">
                    {activity.steps
                      ? `${activity.steps.toLocaleString()} steps`
                      : ""}
                    {activity.steps && activity.workout_type ? " · " : ""}
                    {activity.workout_type
                      ? `${activity.workout_type} ${activity.workout_minutes ?? ""}min`
                      : ""}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted transition-colors group-hover:text-foreground">
                {activityOpen ? "Close" : "Edit"}
              </span>
            </button>

            {activityOpen && (
              <form
                onSubmit={handleActivitySubmit}
                className="mt-4 flex flex-col gap-3"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="steps"
                      className="text-[13px] font-medium text-muted"
                    >
                      Steps
                    </label>
                    <input
                      id="steps"
                      name="steps"
                      type="number"
                      min={0}
                      max={200000}
                      inputMode="numeric"
                      defaultValue={activity?.steps ?? ""}
                      className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="calories_burned"
                      className="text-[13px] font-medium text-muted"
                    >
                      Cal burned
                    </label>
                    <input
                      id="calories_burned"
                      name="calories_burned"
                      type="number"
                      min={0}
                      max={5000}
                      inputMode="numeric"
                      defaultValue={activity?.calories_burned || ""}
                      className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="workout_type"
                      className="text-[13px] font-medium text-muted"
                    >
                      Workout
                    </label>
                    <input
                      id="workout_type"
                      name="workout_type"
                      type="text"
                      placeholder="Running"
                      defaultValue={activity?.workout_type ?? ""}
                      className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="workout_minutes"
                      className="text-[13px] font-medium text-muted"
                    >
                      Minutes
                    </label>
                    <input
                      id="workout_minutes"
                      name="workout_minutes"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      defaultValue={activity?.workout_minutes ?? ""}
                      className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={activitySubmitting}
                  className="mt-1 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {activitySubmitting ? "Saving…" : "Save"}
                </button>
              </form>
            )}
          </div>

          <Link
            href="/weight"
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-5 shadow-soft transition-colors hover:border-accent"
          >
            <div>
              <p className="label-xs">Weight</p>
              <p className="mt-1 text-base font-semibold tracking-tight">
                {stats?.weight_trend?.current_weight
                  ? `${stats.weight_trend.current_weight.toFixed(1)} lbs`
                  : "Log weigh-in"}
              </p>
            </div>
            <span className="flex items-center gap-1 text-xs text-muted">
              Trend <ArrowRight size={12} />
            </span>
          </Link>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <h2 className="label-xs">Today&apos;s meals</h2>
          <Link
            href="/log"
            className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90"
          >
            + Log meal
          </Link>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {!meals &&
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-2.5"
              >
                <div>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="mt-2 h-3 w-20" />
                </div>
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          {meals && meals.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-5 text-center text-[13px] text-muted">
              Nothing logged yet today.
            </p>
          )}
          {meals?.map((m) => {
            const isShared = sharedIds.has(m.id);
            const isNewShared = newSharedIds.has(m.id);
            return (
              <div
                key={m.id}
                className={`relative flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-2.5 ${
                  isNewShared ? "animate-shared-in" : ""
                }`}
              >
                <div>
                  <p className="text-[13px] font-medium">{m.name}</p>
                  <p className="text-xs text-muted">
                    {m.calories} cal · {m.meal_type}
                    {m.source === "photo" && m.ai_confidence && (
                      <> · {m.ai_confidence} confidence</>
                    )}
                  </p>
                  {(isShared || m.source === "shared") && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                      ✓ {m.source === "shared" ? "Shared with you" : `Shared with ${partnerName}`}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => setOpenMenuId((id) => (id === m.id ? null : m.id))}
                  aria-label={`More actions for ${m.name}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <MoreVertical size={16} />
                </button>

                {openMenuId === m.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setOpenMenuId(null)}
                    />
                    <div className="absolute right-4 top-11 z-20 w-52 overflow-hidden rounded-lg border border-border bg-surface shadow-soft">
                      {partnerName && !isShared && m.source !== "shared" && (
                        <button
                          onClick={() => handleShare(m.id)}
                          disabled={sharingId === m.id}
                          className="flex w-full items-center px-3 py-2 text-left text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-60"
                        >
                          {sharingId === m.id ? "Sharing…" : `Share with ${partnerName}`}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="flex w-full items-center px-3 py-2 text-left text-[13px] text-danger transition-colors hover:bg-surface-2"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {banner && (
        <div className="fixed inset-x-0 bottom-6 flex justify-center px-6">
          <div className="flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-[13px] text-background shadow-lg">
            🎉 {banner}
          </div>
        </div>
      )}
    </div>
  );
}
