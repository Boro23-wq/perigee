"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { Skeleton } from "@/components/Skeleton";
import { MealTypeBadge } from "@/components/MealTypeBadge";

type Meal = {
  id: string;
  date: string;
  meal_type: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

function dateHeading(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function groupByDate(meals: Meal[]) {
  const groups: { date: string; meals: Meal[] }[] = [];
  for (const meal of meals) {
    const group = groups[groups.length - 1];
    if (group && group.date === meal.date) {
      group.meals.push(meal);
    } else {
      groups.push({ date: meal.date, meals: [meal] });
    }
  }
  return groups;
}

export default function HistoryPage() {
  const router = useRouter();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const loadPage = useCallback(async (before: string | null) => {
    const query = before ? `?before=${before}&limit=30` : "?limit=30";
    const data = await api.get(`/api/meals/history${query}`);
    return data as { meals: Meal[]; has_more: boolean };
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

      try {
        const data = await loadPage(null);
        setMeals(data.meals);
        setHasMore(data.has_more);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }

  const groups = groupByDate(meals);

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
              <div className="mt-2 flex flex-col gap-2">
                {group.meals.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-border bg-surface px-4 py-2.5"
                  >
                    <p className="text-[13px] font-medium">{m.name}</p>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      <span>{m.calories} cal</span>
                      <MealTypeBadge type={m.meal_type} />
                    </div>
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
    </div>
  );
}
