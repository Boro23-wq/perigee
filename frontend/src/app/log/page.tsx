"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { localDateString } from "@/lib/date";
import { Logo } from "@/components/Logo";

type Usual = {
  name: string;
  meal_type: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  times: number;
  last: string;
};

type Toast = {
  message: string;
  onUndo: () => void;
};

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "drink"] as const;

export default function LogPage() {
  const [usuals, setUsuals] = useState<Usual[] | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const [mealType, setMealType] = useState<string>("breakfast");
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/api/meals/usuals")
      .then((data) => setUsuals(data.usuals))
      .catch(() => setUsuals([]));
  }, []);

  function showToast(message: string, loggedId: string) {
    const undo = async () => {
      setToast(null);
      await api.delete(`/api/meals/${loggedId}`).catch(() => {});
    };
    setToast({ message, onUndo: undo });
    setTimeout(() => setToast((t) => (t?.onUndo === undo ? null : t)), 5000);
  }

  async function logUsual(u: Usual) {
    try {
      const meal = await api.post("/api/meals", {
        date: localDateString(),
        meal_type: u.meal_type,
        source: "repeat",
        name: u.name,
        calories: u.calories,
        protein: u.protein,
        carbs: u.carbs,
        fat: u.fat,
      });
      showToast(`Logged ${u.name}`, meal.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log meal");
    }
  }

  async function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const meal = await api.post("/api/meals", {
        date: localDateString(),
        meal_type: mealType,
        source: "manual",
        name,
        calories: Number(calories),
        protein: protein ? Number(protein) : 0,
        carbs: carbs ? Number(carbs) : 0,
        fat: fat ? Number(fat) : 0,
      });
      showToast(`Logged ${name}`, meal.id);
      setName("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log meal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Logo />
        <Link
          href="/dashboard"
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          Dashboard
        </Link>
      </header>

      <main className="flex-1 px-6 pb-24 sm:px-10">
        <h1 className="text-2xl font-semibold tracking-tight">Log a meal</h1>

        {usuals && usuals.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-medium text-muted">Your usuals</h2>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {usuals.map((u, i) => (
                <button
                  key={i}
                  onClick={() => logUsual(u)}
                  className="flex shrink-0 flex-col items-start gap-0.5 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent"
                >
                  <span className="text-sm font-medium">{u.name}</span>
                  <span className="text-xs text-muted">
                    {u.calories} cal · {u.meal_type}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-sm font-medium text-muted">Manual entry</h2>
          <form onSubmit={handleManualSubmit} className="mt-3 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="mealType" className="text-sm font-medium">
                Meal
              </label>
              <select
                id="mealType"
                value={mealType}
                onChange={(e) => setMealType(e.target.value)}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
              >
                {MEAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Grilled chicken salad"
                className="rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="calories" className="text-sm font-medium">
                Calories
              </label>
              <input
                id="calories"
                type="number"
                required
                min={0}
                max={10000}
                inputMode="numeric"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="protein" className="text-sm font-medium">
                  Protein
                </label>
                <input
                  id="protein"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  className="rounded-xl border border-border bg-surface px-3 py-3 text-base outline-none focus:border-accent"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="carbs" className="text-sm font-medium">
                  Carbs
                </label>
                <input
                  id="carbs"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  className="rounded-xl border border-border bg-surface px-3 py-3 text-base outline-none focus:border-accent"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="fat" className="text-sm font-medium">
                  Fat
                </label>
                <input
                  id="fat"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  className="rounded-xl border border-border bg-surface px-3 py-3 text-base outline-none focus:border-accent"
                />
              </div>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Logging…" : "Log meal"}
            </button>
          </form>
        </section>
      </main>

      {toast && (
        <div className="fixed inset-x-0 bottom-6 flex justify-center px-6">
          <div className="flex items-center gap-4 rounded-full bg-foreground px-5 py-3 text-background shadow-lg">
            <span className="text-sm">{toast.message}</span>
            <button
              onClick={toast.onUndo}
              className="text-sm font-medium text-accent"
            >
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
