"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import imageCompression from "browser-image-compression";
import { api } from "@/lib/api";
import { localDateString } from "@/lib/date";
import { Logo } from "@/components/Logo";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Skeleton } from "@/components/Skeleton";

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

type PhotoMeal = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ai_confidence: "low" | "medium" | "high" | null;
};

type BarcodeProduct = {
  name: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  serving_grams: number | null;
  serving_label: string | null;
};

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "drink"] as const;

function confidenceStyle(confidence: PhotoMeal["ai_confidence"]) {
  switch (confidence) {
    case "high":
      return "text-accent";
    case "medium":
      return "text-muted";
    default:
      return "text-danger";
  }
}

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const adjustTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [photoStatus, setPhotoStatus] = useState<"idle" | "processing" | "result" | "error">(
    "idle"
  );
  const [photoError, setPhotoError] = useState("");
  const [photoResult, setPhotoResult] = useState<PhotoMeal | null>(null);
  const [adjustedCalories, setAdjustedCalories] = useState(0);

  const [scanning, setScanning] = useState(false);
  const [barcodeStatus, setBarcodeStatus] = useState<
    "idle" | "looking_up" | "result" | "error"
  >("idle");
  const [barcodeError, setBarcodeError] = useState("");
  const [barcodeProduct, setBarcodeProduct] = useState<BarcodeProduct | null>(null);
  const [servings, setServings] = useState(1);
  const [gramsInput, setGramsInput] = useState("");
  const [barcodeSubmitting, setBarcodeSubmitting] = useState(false);

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

  async function handlePhotoSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhotoStatus("processing");
    setPhotoError("");

    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
      });
      const contentType = compressed.type || "image/jpeg";

      const { path, upload_url } = await api.post("/api/meals/photo/upload-url", {
        content_type: contentType,
      });

      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: compressed,
      });
      if (!putRes.ok) throw new Error("Photo upload failed");

      const meal: PhotoMeal = await api.post("/api/meals/photo/analyze", {
        path,
        date: localDateString(),
        meal_type: mealType,
      });
      setPhotoResult(meal);
      setAdjustedCalories(meal.calories);
      setPhotoStatus("result");
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Failed to analyze photo");
      setPhotoStatus("error");
    }
  }

  function handleAdjustSlider(e: ChangeEvent<HTMLInputElement>) {
    const calories = Number(e.target.value);
    setAdjustedCalories(calories);
    if (!photoResult) return;

    if (adjustTimeout.current) clearTimeout(adjustTimeout.current);
    adjustTimeout.current = setTimeout(async () => {
      try {
        const updated: PhotoMeal = await api.patch(`/api/meals/${photoResult.id}/adjust`, {
          calories,
        });
        setPhotoResult(updated);
      } catch {
        // slider stays interactive either way — user can nudge again
      }
    }, 400);
  }

  async function handleBarcodeDetected(upc: string) {
    setScanning(false);
    setBarcodeStatus("looking_up");
    setBarcodeError("");

    try {
      const product: BarcodeProduct = await api.get(`/api/barcode/${upc}`);
      setBarcodeProduct(product);
      setServings(1);
      setGramsInput("");
      setBarcodeStatus("result");
    } catch (err) {
      setBarcodeError(err instanceof Error ? err.message : "Failed to look up barcode");
      setBarcodeStatus("error");
    }
  }

  const gramsEaten = barcodeProduct?.serving_grams
    ? barcodeProduct.serving_grams * servings
    : Number(gramsInput) || 0;
  const barcodeCalories = barcodeProduct
    ? Math.round((barcodeProduct.calories_per_100g * gramsEaten) / 100)
    : 0;
  const barcodeProtein = barcodeProduct
    ? (barcodeProduct.protein_per_100g * gramsEaten) / 100
    : 0;
  const barcodeCarbs = barcodeProduct
    ? (barcodeProduct.carbs_per_100g * gramsEaten) / 100
    : 0;
  const barcodeFat = barcodeProduct ? (barcodeProduct.fat_per_100g * gramsEaten) / 100 : 0;

  async function handleLogBarcode() {
    if (!barcodeProduct || gramsEaten <= 0) return;
    setBarcodeSubmitting(true);
    setBarcodeError("");

    try {
      const meal = await api.post("/api/meals/barcode", {
        date: localDateString(),
        meal_type: mealType,
        name: barcodeProduct.name,
        calories: barcodeCalories,
        protein: barcodeProtein,
        carbs: barcodeCarbs,
        fat: barcodeFat,
        serving_grams: gramsEaten,
      });
      showToast(`Logged ${barcodeProduct.name}`, meal.id);
      setBarcodeStatus("idle");
      setBarcodeProduct(null);
    } catch (err) {
      setBarcodeError(err instanceof Error ? err.message : "Failed to log meal");
    } finally {
      setBarcodeSubmitting(false);
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
        <h1 className="text-xl font-semibold tracking-tight">Log a meal</h1>

        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <section>
            <h2 className="label-xs">Log with photo</h2>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={photoStatus === "processing"}
              className="mt-3 w-full rounded-xl border border-dashed border-border bg-surface px-4 py-4 text-[13px] font-medium text-muted shadow-soft transition-colors hover:border-accent hover:text-foreground disabled:opacity-60"
            >
              {photoStatus === "processing" ? "Analyzing photo…" : "Take or upload a photo"}
            </button>

            {photoStatus === "error" && (
              <p className="mt-2 text-[13px] text-danger">{photoError}</p>
            )}

            {photoStatus === "result" && photoResult && (
              <div className="mt-3 rounded-xl border border-border bg-surface p-4 shadow-soft">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-medium">{photoResult.name}</p>
                  <span className={`label-xs ${confidenceStyle(photoResult.ai_confidence)}`}>
                    {photoResult.ai_confidence ?? "unknown"} confidence
                  </span>
                </div>
                <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">
                  {adjustedCalories} cal
                </p>
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={10}
                  value={adjustedCalories}
                  onChange={handleAdjustSlider}
                  className="mt-3 w-full accent-accent"
                />
                <p className="mt-2 text-xs text-muted">
                  Estimate — restaurant meals often have hidden oils/butter. Nudge up if
                  it was rich.
                </p>
                <button
                  onClick={() => setPhotoStatus("idle")}
                  className="mt-3 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90"
                >
                  Done
                </button>
              </div>
            )}
          </section>

          <section>
            <h2 className="label-xs">Scan barcode</h2>
            <button
              onClick={() => setScanning(true)}
              disabled={barcodeStatus === "looking_up"}
              className="mt-3 w-full rounded-xl border border-dashed border-border bg-surface px-4 py-4 text-[13px] font-medium text-muted shadow-soft transition-colors hover:border-accent hover:text-foreground disabled:opacity-60"
            >
              {barcodeStatus === "looking_up" ? "Looking up product…" : "Scan a barcode"}
            </button>

            {barcodeStatus === "error" && (
              <p className="mt-2 text-[13px] text-danger">{barcodeError}</p>
            )}

            {barcodeStatus === "result" && barcodeProduct && (
              <div className="mt-3 rounded-xl border border-border bg-surface p-4 shadow-soft">
                <p className="text-[13px] font-medium">{barcodeProduct.name}</p>

                {barcodeProduct.serving_grams ? (
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={() => setServings((s) => Math.max(0.5, s - 0.5))}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-accent hover:text-foreground"
                    >
                      −
                    </button>
                    <span className="text-[13px] tabular-nums">
                      {servings} × {barcodeProduct.serving_label ?? `${barcodeProduct.serving_grams}g`}
                    </span>
                    <button
                      onClick={() => setServings((s) => s + 0.5)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-accent hover:text-foreground"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-col gap-1">
                    <label htmlFor="gramsEaten" className="text-[13px] font-medium text-muted">
                      Grams eaten
                    </label>
                    <input
                      id="gramsEaten"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={gramsInput}
                      onChange={(e) => setGramsInput(e.target.value)}
                      placeholder="No serving size on file — enter grams"
                      className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                  </div>
                )}

                <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">
                  {barcodeCalories} cal
                </p>
                <p className="mt-1 text-xs text-muted">
                  {barcodeProtein.toFixed(0)}g protein · {barcodeCarbs.toFixed(0)}g carbs ·{" "}
                  {barcodeFat.toFixed(0)}g fat
                </p>

                {barcodeError && (
                  <p className="mt-2 text-[13px] text-danger">{barcodeError}</p>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleLogBarcode}
                    disabled={barcodeSubmitting || gramsEaten <= 0}
                    className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {barcodeSubmitting ? "Logging…" : "Log"}
                  </button>
                  <button
                    onClick={() => {
                      setBarcodeStatus("idle");
                      setBarcodeProduct(null);
                    }}
                    className="rounded-lg border border-border bg-surface px-4 py-2 text-[13px] font-medium transition-colors hover:border-accent"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {!usuals && (
          <section className="mt-7">
            <h2 className="label-xs">Your usuals</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col items-start gap-1 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-soft"
                >
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
            </div>
          </section>
        )}

        {usuals && usuals.length > 0 && (
          <section className="mt-7">
            <h2 className="label-xs">Your usuals</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {usuals.map((u, i) => (
                <button
                  key={i}
                  onClick={() => logUsual(u)}
                  className="flex flex-col items-start gap-0.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-left shadow-soft transition-colors hover:border-accent"
                >
                  <span className="text-[13px] font-medium">{u.name}</span>
                  <span className="text-xs text-muted">
                    {u.calories} cal · {u.meal_type}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mt-7">
          <h2 className="label-xs">Manual entry</h2>
          <form
            onSubmit={handleManualSubmit}
            className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="mealType" className="text-[13px] font-medium text-muted">
                Meal
              </label>
              <select
                id="mealType"
                value={mealType}
                onChange={(e) => setMealType(e.target.value)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
              >
                {MEAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1 sm:col-span-1 lg:col-span-3">
              <label htmlFor="name" className="text-[13px] font-medium text-muted">
                Name
              </label>
              <input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Grilled chicken salad"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="calories" className="text-[13px] font-medium text-muted">
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
                className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="protein" className="text-[13px] font-medium text-muted">
                Protein
              </label>
              <input
                id="protein"
                type="number"
                min={0}
                inputMode="decimal"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="carbs" className="text-[13px] font-medium text-muted">
                Carbs
              </label>
              <input
                id="carbs"
                type="number"
                min={0}
                inputMode="decimal"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="fat" className="text-[13px] font-medium text-muted">
                Fat
              </label>
              <input
                id="fat"
                type="number"
                min={0}
                inputMode="decimal"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>

            {error && <p className="text-[13px] text-danger sm:col-span-2 lg:col-span-4">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50 sm:col-span-2 lg:col-span-4"
            >
              {submitting ? "Logging…" : "Log meal"}
            </button>
          </form>
        </section>
      </main>

      {scanning && (
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
          onClose={() => setScanning(false)}
        />
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-6 flex justify-center px-6">
          <div className="flex items-center gap-4 rounded-lg bg-foreground px-4 py-2.5 text-background shadow-lg">
            <span className="text-[13px]">{toast.message}</span>
            <button
              onClick={toast.onUndo}
              className="text-[13px] font-medium text-accent"
            >
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
