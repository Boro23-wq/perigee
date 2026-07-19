"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, MoreVertical, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { Accordion } from "@/components/Accordion";
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
  const today = localDateString();
  const yesterday = shiftDate(today, -1);
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function shiftDate(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(month: Date, delta: number) {
  return new Date(month.getFullYear(), month.getMonth() + delta, 1);
}

function toDateString(year: number, month: number, day: number) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

// One calendar cell per day of the month, null-padded at the front so the
// first day lands under its correct weekday column.
function buildCalendarCells(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const numDays = new Date(year, monthIndex + 1, 0).getDate();

  const cells: ({ day: number; dateStr: string } | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= numDays; day++) {
    cells.push({ day, dateStr: toDateString(year, monthIndex, day) });
  }
  return cells;
}

export default function HistoryPage() {
  const router = useRouter();
  const today = localDateString();

  const [authed, setAuthed] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(today));
  const [loggedDates, setLoggedDates] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setAuthed(true);
    });
  }, [router]);

  const loadDay = useCallback(async (date: string) => {
    setLoading(true);
    setError("");
    try {
      const [mealsData, workoutsData] = await Promise.all([
        api.get(`/api/meals?date=${date}`),
        api.get(`/api/workouts?date=${date}`),
      ]);
      setMeals(mealsData.meals);
      setWorkouts(workoutsData.workouts);
      for (const m of mealsData.meals as Meal[]) {
        if (!m.photo_path) continue;
        api
          .get(`/api/meals/${m.id}/photo-url`)
          .then(({ url }) => setThumbUrls((prev) => ({ ...prev, [m.id]: url })))
          .catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadDay(selectedDate);
  }, [authed, selectedDate, loadDay]);

  // Fetches which days in the visible calendar month have anything logged,
  // so the picker can show a dot under them — cached per month already
  // fetched, so flipping between months you've seen doesn't re-fetch.
  useEffect(() => {
    if (!authed || !calendarOpen) return;
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const start = toDateString(year, month, 1);
    const end = toDateString(year, month, new Date(year, month + 1, 0).getDate());

    api
      .get(`/api/history/logged-dates?start=${start}&end=${end}`)
      .then(({ dates }: { dates: string[] }) => {
        setLoggedDates((prev) => new Set([...prev, ...dates]));
      })
      .catch(() => {});
  }, [authed, calendarOpen, viewMonth]);

  function toggleCalendar() {
    setViewMonth(startOfMonth(selectedDate));
    setCalendarOpen((o) => !o);
  }

  function pickDate(dateStr: string) {
    setSelectedDate(dateStr);
    setCalendarOpen(false);
  }

  const canGoNextMonth =
    viewMonth.getFullYear() < startOfMonth(today).getFullYear() ||
    (viewMonth.getFullYear() === startOfMonth(today).getFullYear() &&
      viewMonth.getMonth() < startOfMonth(today).getMonth());

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
      setMeals((prev) => (prev ? prev.map((m) => (m.id === id ? { ...m, ...updated } : m)) : prev));
      setEditingMealId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteMeal(id: string) {
    setOpenMenuId(null);
    setMeals((prev) => (prev ? prev.filter((m) => m.id !== id) : prev));
    try {
      await api.delete(`/api/meals/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete meal");
    }
  }

  async function handleDeleteWorkout(id: string) {
    setWorkouts((prev) => (prev ? prev.filter((w) => w.id !== id) : prev));
    try {
      await api.delete(`/api/workouts/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete workout");
    }
  }

  const mealGroups = MEAL_TYPES.map((type) => ({
    type,
    items: (meals ?? []).filter((m) => m.meal_type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-20 pt-6 sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight">History</h1>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedDate((d) => shiftDate(d, -1))}
              aria-label="Previous day"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={toggleCalendar}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[15px] font-semibold transition-colors hover:bg-surface-2"
              >
                <CalendarDays size={16} className="text-muted" />
                {dateHeading(selectedDate)}
              </button>

              {calendarOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setCalendarOpen(false)} />
                  <div className="absolute left-0 top-11 z-20 w-72 rounded-xl border border-border bg-surface p-3 shadow-soft">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setViewMonth((m) => addMonths(m, -1))}
                        aria-label="Previous month"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <p className="text-[13px] font-semibold">
                        {viewMonth.toLocaleDateString(undefined, {
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                      <button
                        onClick={() => setViewMonth((m) => addMonths(m, 1))}
                        disabled={!canGoNextMonth}
                        aria-label="Next month"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
                      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                        <span key={i}>{d}</span>
                      ))}
                    </div>

                    <div className="mt-1 grid grid-cols-7 gap-1">
                      {buildCalendarCells(viewMonth).map((cell, i) =>
                        cell ? (
                          <button
                            key={cell.dateStr}
                            onClick={() => pickDate(cell.dateStr)}
                            disabled={cell.dateStr > today}
                            className={`relative flex h-8 w-8 flex-col items-center justify-center rounded-lg text-[13px] transition-colors disabled:opacity-30 disabled:hover:bg-transparent ${
                              cell.dateStr === selectedDate
                                ? "bg-accent font-semibold text-accent-foreground"
                                : cell.dateStr === today
                                  ? "border border-accent text-foreground hover:bg-surface-2"
                                  : "text-foreground hover:bg-surface-2"
                            }`}
                          >
                            {cell.day}
                            {loggedDates.has(cell.dateStr) && (
                              <span
                                className={`absolute bottom-1 h-1 w-1 rounded-full ${
                                  cell.dateStr === selectedDate ? "bg-accent-foreground" : "bg-accent"
                                }`}
                              />
                            )}
                          </button>
                        ) : (
                          <span key={i} />
                        )
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
              disabled={selectedDate >= today}
              aria-label="Next day"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {selectedDate !== today && (
            <button
              onClick={() => setSelectedDate(today)}
              className="text-[13px] font-medium text-accent hover:underline"
            >
              Today
            </button>
          )}
        </div>

        {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}

        <div className="mt-4 flex flex-col gap-4">
          {loading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface px-4 py-2.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-20" />
              </div>
            ))}

          {!loading && mealGroups.length === 0 && (!workouts || workouts.length === 0) && (
            <p className="rounded-xl border border-dashed border-border p-5 text-center text-[13px] text-muted">
              Nothing logged {dateHeading(selectedDate).toLowerCase()}.
            </p>
          )}

          {!loading && workouts && workouts.length > 0 && (
            <div>
              <h2 className="label-xs mb-2">Workouts</h2>
              <Accordion
                defaultOpen
                title={`${workouts.length} ${workouts.length === 1 ? "session" : "sessions"}`}
                subtitle={`${workouts.reduce((sum, w) => sum + w.calories_burned, 0)} cal burned`}
              >
                <div className="flex flex-wrap gap-1.5">
                  {workouts.map((w) => (
                    <span
                      key={w.id}
                      className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1.5 pl-3 pr-1.5 text-[11px] font-medium text-muted"
                    >
                      <WorkoutIcon name={w.name} size={16} className="shrink-0 text-accent" />
                      {w.name}
                      {w.minutes != null && ` · ${w.minutes}min`} · {w.calories_burned} cal
                      <button
                        onClick={() => handleDeleteWorkout(w.id)}
                        aria-label={`Delete ${w.name}`}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-danger"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </Accordion>
            </div>
          )}

          {!loading && mealGroups.length > 0 && (
            <div>
              <h2 className="label-xs mb-2">Meals</h2>
              <div className="flex flex-col gap-2">
                {mealGroups.map((group) => {
                  const groupCalories = group.items.reduce((sum, m) => sum + m.calories, 0);
                  return (
                    <Accordion
                      key={group.type}
                      defaultOpen
                      title={`${group.type[0].toUpperCase() + group.type.slice(1)} · ${
                        group.items.length
                      } ${group.items.length === 1 ? "item" : "items"}`}
                      subtitle={`${groupCalories} cal`}
                    >
                      <div className="flex flex-col gap-2">
                        {group.items.map((m) => (
                          <div key={m.id} className="relative rounded-lg bg-surface-2 px-4 py-2.5">
                            {editingMealId === m.id ? (
                              <div className="flex flex-col gap-2">
                                <input
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  placeholder="Name"
                                  className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                                />
                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                                  <select
                                    value={editMealType}
                                    onChange={(e) => setEditMealType(e.target.value)}
                                    className="col-span-3 rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft sm:col-span-1"
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
                                      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <label className="text-[11px] text-muted">Protein (g)</label>
                                    <input
                                      type="number"
                                      min={0}
                                      value={editProtein}
                                      onChange={(e) => setEditProtein(e.target.value)}
                                      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <label className="text-[11px] text-muted">Carbs (g)</label>
                                    <input
                                      type="number"
                                      min={0}
                                      value={editCarbs}
                                      onChange={(e) => setEditCarbs(e.target.value)}
                                      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <label className="text-[11px] text-muted">Fat (g)</label>
                                    <input
                                      type="number"
                                      min={0}
                                      value={editFat}
                                      onChange={(e) => setEditFat(e.target.value)}
                                      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <label className="text-[11px] text-muted">Fiber (g)</label>
                                    <input
                                      type="number"
                                      min={0}
                                      value={editFiber}
                                      onChange={(e) => setEditFiber(Number(e.target.value))}
                                      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
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
                                        thumbUrls[m.id] ? "bg-surface" : "invisible"
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
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
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
                                        onClick={() => handleDeleteMeal(m.id)}
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
                    </Accordion>
                  );
                })}
              </div>
            </div>
          )}
        </div>
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
