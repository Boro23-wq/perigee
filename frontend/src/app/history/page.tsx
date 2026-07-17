"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { Skeleton } from "@/components/Skeleton";
import { MealTypeBadge } from "@/components/MealTypeBadge";
import { WorkoutIcon } from "@/components/WorkoutIcon";
import { localDateString } from "@/lib/date";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "drink"] as const;

type Meal = {
  id: string;
  date: string;
  meal_type: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  photo_path: string | null;
};

type Workout = {
  id: string;
  date: string;
  name: string;
  minutes: number | null;
  calories_burned: number;
};

function dateHeading(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// Groups by the union of meal dates and workout dates, not just meal dates —
// a day with a workout but no meals logged yet (e.g. today, before your
// first meal) would otherwise never get a group at all.
function groupByDate(meals: Meal[], workoutsByDate: Record<string, Workout[]>) {
  const dateSet = new Set(meals.map((m) => m.date));
  for (const date of Object.keys(workoutsByDate)) {
    if (workoutsByDate[date].length > 0) dateSet.add(date);
  }
  const dates = Array.from(dateSet).sort((a, b) => (a < b ? 1 : -1));
  return dates.map((date) => ({
    date,
    meals: meals.filter((m) => m.date === date),
  }));
}

export default function HistoryPage() {
  const router = useRouter();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [workoutsByDate, setWorkoutsByDate] = useState<Record<string, Workout[]>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMealType, setEditMealType] = useState("breakfast");
  const [editCalories, setEditCalories] = useState("");
  const [editProtein, setEditProtein] = useState("");
  const [editCarbs, setEditCarbs] = useState("");
  const [editFat, setEditFat] = useState("");
  const [editFiber, setEditFiber] = useState(0);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});

  const loadPage = useCallback(async (before: string | null) => {
    const query = before ? `?before=${before}&limit=30` : "?limit=30";
    const data = await api.get(`/api/meals/history${query}`);
    return data as { meals: Meal[]; has_more: boolean };
  }, []);

  // Thumbnails are a nice-to-have preview, not the primary "View photo"
  // flow — fetched in the background, best-effort, one signed URL per
  // photo-logged meal on the page.
  function loadThumbnails(pageMeals: Meal[]) {
    for (const m of pageMeals) {
      if (!m.photo_path) continue;
      api
        .get(`/api/meals/${m.id}/photo-url`)
        .then(({ url }) => setThumbUrls((prev) => ({ ...prev, [m.id]: url })))
        .catch(() => {});
    }
  }

  // Workouts aren't paginated separately — each page of meals already
  // defines a date span, so workouts for that same span are fetched
  // alongside it rather than running an independent cursor/Load More.
  // `includeToday` covers the one date that can have a workout with zero
  // meals logged yet — today — which the first page's meal span alone
  // might not reach.
  async function loadWorkoutsForDates(pageMeals: Meal[], includeToday = false) {
    const dates = pageMeals.map((m) => m.date);
    if (includeToday) dates.push(localDateString());
    if (dates.length === 0) return;
    const start = dates.reduce((a, b) => (b < a ? b : a));
    const end = dates.reduce((a, b) => (b > a ? b : a));
    try {
      const data = await api.get(`/api/workouts/range?start=${start}&end=${end}`);
      const grouped: Record<string, Workout[]> = {};
      for (const w of data.workouts as Workout[]) {
        (grouped[w.date] ??= []).push(w);
      }
      setWorkoutsByDate((prev) => ({ ...prev, ...grouped }));
    } catch (err) {
      // Best-effort — history still works with just meals if this fails —
      // but log it, silent failures here are exactly what made this hard
      // to debug once already.
      console.error("Failed to load workout history:", err);
    }
  }

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

      try {
        const data = await loadPage(null);
        setMeals(data.meals);
        setHasMore(data.has_more);
        loadThumbnails(data.meals);
        loadWorkoutsForDates(data.meals, true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router, loadPage]);

  async function handleLoadMore() {
    const oldest = meals[meals.length - 1]?.date;
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const data = await loadPage(oldest);
      setMeals((prev) => [...prev, ...data.meals]);
      setHasMore(data.has_more);
      loadThumbnails(data.meals);
      loadWorkoutsForDates(data.meals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }

  function startEdit(m: Meal) {
    setOpenMenuId(null);
    setEditingMealId(m.id);
    setEditName(m.name);
    setEditMealType(m.meal_type);
    setEditCalories(String(m.calories));
    setEditProtein(String(m.protein));
    setEditCarbs(String(m.carbs));
    setEditFat(String(m.fat));
    setEditFiber(m.fiber);
    setEditError("");
  }

  function cancelEdit() {
    setEditingMealId(null);
    setEditError("");
  }

  async function saveEdit(id: string) {
    setEditSaving(true);
    setEditError("");
    try {
      const updated: Meal = await api.patch(`/api/meals/${id}`, {
        name: editName,
        meal_type: editMealType,
        calories: Number(editCalories),
        protein: editProtein ? Number(editProtein) : 0,
        carbs: editCarbs ? Number(editCarbs) : 0,
        fat: editFat ? Number(editFat) : 0,
        fiber: editFiber,
      });
      setMeals((prev) => prev.map((m) => (m.id === id ? { ...m, ...updated } : m)));
      setEditingMealId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setOpenMenuId(null);
    setMeals((prev) => prev.filter((m) => m.id !== id));
    try {
      await api.delete(`/api/meals/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete meal");
    }
  }

  const groups = groupByDate(meals, workoutsByDate);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-20 pt-6 sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight">History</h1>

        {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}

        <div className="mt-4 flex flex-col gap-6">
          {loading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-32" />
                <div className="mt-2 flex flex-col gap-2">
                  {Array.from({ length: 2 }).map((__, j) => (
                    <div
                      key={j}
                      className="rounded-xl border border-border bg-surface px-4 py-2.5"
                    >
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="mt-2 h-3 w-20" />
                    </div>
                  ))}
                </div>
              </div>
            ))}

          {!loading && groups.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-5 text-center text-[13px] text-muted">
              No past meals yet.
            </p>
          )}

          {groups.map((group) => (
            <div key={group.date}>
              <h2 className="label-xs">{dateHeading(group.date)}</h2>

              {workoutsByDate[group.date] && workoutsByDate[group.date].length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {workoutsByDate[group.date].map((w) => (
                    <span
                      key={w.id}
                      className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-muted"
                    >
                      <WorkoutIcon name={w.name} size={16} className="shrink-0 text-accent" />
                      {w.name}
                      {w.minutes != null && ` · ${w.minutes}min`} · {w.calories_burned} cal
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-2 flex flex-col gap-2">
                {group.meals.map((m) => (
                  <div
                    key={m.id}
                    className="relative rounded-xl border border-border bg-surface px-4 py-2.5"
                  >
                    {editingMealId === m.id ? (
                      <div className="flex flex-col gap-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Name"
                          className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                        />
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                          <select
                            value={editMealType}
                            onChange={(e) => setEditMealType(e.target.value)}
                            className="col-span-3 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft sm:col-span-1"
                          >
                            {MEAL_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t[0].toUpperCase() + t.slice(1)}
                              </option>
                            ))}
                          </select>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[11px] text-muted">Cal</label>
                            <input
                              type="number"
                              min={0}
                              value={editCalories}
                              onChange={(e) => setEditCalories(e.target.value)}
                              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[11px] text-muted">Protein (g)</label>
                            <input
                              type="number"
                              min={0}
                              value={editProtein}
                              onChange={(e) => setEditProtein(e.target.value)}
                              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[11px] text-muted">Carbs (g)</label>
                            <input
                              type="number"
                              min={0}
                              value={editCarbs}
                              onChange={(e) => setEditCarbs(e.target.value)}
                              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[11px] text-muted">Fat (g)</label>
                            <input
                              type="number"
                              min={0}
                              value={editFat}
                              onChange={(e) => setEditFat(e.target.value)}
                              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[11px] text-muted">Fiber (g)</label>
                            <input
                              type="number"
                              min={0}
                              value={editFiber}
                              onChange={(e) => setEditFiber(Number(e.target.value))}
                              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                            />
                          </div>
                        </div>
                        {editError && <p className="text-[13px] text-danger">{editError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(m.id)}
                            disabled={editSaving || !editName.trim() || !editCalories}
                            className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {editSaving ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-accent"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {m.photo_path && (
                            <button
                              onClick={() => thumbUrls[m.id] && setViewingPhotoUrl(thumbUrls[m.id])}
                              aria-label={`View photo for ${m.name}`}
                              className={`h-10 w-10 shrink-0 overflow-hidden rounded-lg ${
                                thumbUrls[m.id] ? "bg-surface-2" : "invisible"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={thumbUrls[m.id]}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </button>
                          )}
                          <div>
                            <p className="text-[13px] font-medium">{m.name}</p>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                              <span>{m.calories} cal</span>
                              <MealTypeBadge type={m.meal_type} />
                            </div>
                          </div>
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
                            <div className="absolute right-4 top-11 z-20 w-40 overflow-hidden rounded-lg border border-border bg-surface shadow-soft">
                              <button
                                onClick={() => startEdit(m)}
                                className="flex w-full items-center px-3 py-2 text-left text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                              >
                                Edit
                              </button>
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
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {!loading && hasMore && (
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="mt-6 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-[13px] font-medium text-muted transition-colors hover:border-accent hover:text-foreground disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </main>

      {viewingPhotoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setViewingPhotoUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewingPhotoUrl}
            alt="Logged meal"
            className="max-h-full max-w-full rounded-xl object-contain"
          />
          <button
            onClick={() => setViewingPhotoUrl(null)}
            aria-label="Close photo"
            className="absolute right-6 top-6 rounded-full bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
