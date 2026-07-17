"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type FoodSearchResult = {
  food_id: string;
  name: string;
  brand: string | null;
  description: string;
};

type FoodServing = {
  id: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  metric_grams: number | null;
};

type FoodDetail = {
  food_id: string;
  name: string;
  brand: string | null;
  servings: FoodServing[];
};

export type PickedFood = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  servingGrams: number | null;
  servingLabel: string;
  quantity: number;
};

// Search -> pick a result -> pick a serving + quantity (or type exact grams)
// -> onAdd. Used by the log page (add-and-log-immediately) and the recipe
// builder (add-and-keep-adding multiple ingredients) — resets itself after
// every onAdd so both callers can just keep calling it.
//
// The results/detail panels are absolutely positioned so they float over
// whatever's below instead of pushing the rest of the page down as you type.
//
// Every button here is type="button" deliberately — this component is
// commonly rendered inside a host <form> (e.g. the recipe form), and without
// that, clicking +/-/Add would submit the host form and trigger its native
// validation instead of doing anything in this widget.
export function FoodPicker({
  addLabel = "Add",
  onAdd,
}: {
  addLabel?: string;
  onAdd: (food: PickedFood) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FoodSearchResult[] | null>(null);
  const [searchStatus, setSearchStatus] = useState<
    "idle" | "searching" | "results" | "error"
  >("idle");
  const [searchError, setSearchError] = useState("");
  const [selectedFood, setSelectedFood] = useState<FoodDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedServingId, setSelectedServingId] = useState("");
  const [qty, setQty] = useState(1);
  const [gramsMode, setGramsMode] = useState(false);
  const [gramsInput, setGramsInput] = useState("");
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestId = useRef(0);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);

    const query = searchQuery.trim();
    searchDebounce.current = setTimeout(
      async () => {
        if (!query) {
          setSearchResults(null);
          setSearchStatus("idle");
          return;
        }

        setSearchStatus("searching");
        const requestId = ++searchRequestId.current;
        try {
          const data = await api.get(`/api/foods/search?q=${encodeURIComponent(query)}`);
          if (requestId !== searchRequestId.current) return;
          setSearchResults(data.results);
          setSearchStatus("results");
          setSearchError("");
        } catch (err) {
          if (requestId !== searchRequestId.current) return;
          setSearchError(err instanceof Error ? err.message : "Search failed");
          setSearchStatus("error");
        }
      },
      query ? 400 : 0
    );

    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [searchQuery]);

  async function handleSelectFood(foodId: string) {
    setDetailLoading(true);
    setSearchError("");
    try {
      const detail: FoodDetail = await api.get(`/api/foods/${foodId}`);
      setSelectedFood(detail);
      setSelectedServingId(detail.servings[0]?.id ?? "");
      setQty(1);
      setGramsMode(false);
      setGramsInput("");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Failed to load food");
    } finally {
      setDetailLoading(false);
    }
  }

  function reset() {
    setSearchQuery("");
    setSearchResults(null);
    setSearchStatus("idle");
    setSelectedFood(null);
    setSelectedServingId("");
    setQty(1);
    setGramsMode(false);
    setGramsInput("");
  }

  const selectedServing =
    selectedFood?.servings.find((s) => s.id === selectedServingId) ?? null;
  // Any serving with a known gram weight gives us a per-gram rate — used
  // when the user types an exact gram amount instead of picking a serving.
  const gramsBasis = selectedFood?.servings.find((s) => s.metric_grams) ?? null;
  const customGrams = gramsMode ? Number(gramsInput) || 0 : 0;

  const usingGrams = gramsMode && gramsBasis && customGrams > 0;
  const calories = usingGrams
    ? Math.round((gramsBasis!.calories / gramsBasis!.metric_grams!) * customGrams)
    : selectedServing
      ? Math.round(selectedServing.calories * qty)
      : 0;
  const protein = usingGrams
    ? (gramsBasis!.protein / gramsBasis!.metric_grams!) * customGrams
    : selectedServing
      ? selectedServing.protein * qty
      : 0;
  const carbs = usingGrams
    ? (gramsBasis!.carbs / gramsBasis!.metric_grams!) * customGrams
    : selectedServing
      ? selectedServing.carbs * qty
      : 0;
  const fat = usingGrams
    ? (gramsBasis!.fat / gramsBasis!.metric_grams!) * customGrams
    : selectedServing
      ? selectedServing.fat * qty
      : 0;
  const fiber = usingGrams
    ? (gramsBasis!.fiber / gramsBasis!.metric_grams!) * customGrams
    : selectedServing
      ? selectedServing.fiber * qty
      : 0;
  const servingGrams = usingGrams
    ? customGrams
    : selectedServing?.metric_grams
      ? selectedServing.metric_grams * qty
      : null;
  const servingLabel = usingGrams ? `${customGrams}g` : (selectedServing?.description ?? "");
  const canAdd = usingGrams || !!selectedServing;

  function handleAdd() {
    if (!selectedFood || !canAdd) return;
    onAdd({
      name: selectedFood.name,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      servingGrams,
      servingLabel,
      quantity: usingGrams ? 1 : qty,
    });
    reset();
  }

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for a food…"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[13px] shadow-soft outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
        />

        {searchStatus === "results" && !selectedFood && searchResults && (
          <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface shadow-soft">
            {searchResults.length === 0 ? (
              <p className="px-4 py-3 text-[13px] text-muted">No results</p>
            ) : (
              searchResults.map((r) => (
                <button
                  key={r.food_id}
                  type="button"
                  onClick={() => handleSelectFood(r.food_id)}
                  disabled={detailLoading}
                  className="flex w-full flex-col items-start gap-0.5 border-b border-border px-4 py-2.5 text-left last:border-b-0 hover:bg-surface-2 disabled:opacity-60"
                >
                  <span className="text-[13px] font-medium">
                    {r.name}
                    {r.brand && <span className="text-muted"> · {r.brand}</span>}
                  </span>
                  <span className="text-xs text-muted">{r.description}</span>
                </button>
              ))
            )}
          </div>
        )}

        {selectedFood && (
          <div className="absolute inset-x-0 top-full z-20 mt-2 rounded-xl border border-border bg-surface p-4 shadow-soft">
            <p className="text-[13px] font-medium">
              {selectedFood.name}
              {selectedFood.brand && <span className="text-muted"> · {selectedFood.brand}</span>}
            </p>

            {!gramsMode ? (
              <>
                <select
                  value={selectedServingId}
                  onChange={(e) => setSelectedServingId(e.target.value)}
                  className="mt-3 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                >
                  {selectedFood.servings.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.description}
                    </option>
                  ))}
                </select>

                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(0.5, q - 0.5))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-accent hover:text-foreground"
                  >
                    −
                  </button>
                  <span className="text-[13px] tabular-nums">{qty}×</span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => q + 0.5)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-accent hover:text-foreground"
                  >
                    +
                  </button>
                </div>

                {gramsBasis && (
                  <button
                    type="button"
                    onClick={() => setGramsMode(true)}
                    className="mt-2 text-[12px] text-muted underline underline-offset-2 hover:text-foreground"
                  >
                    or enter exact grams
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="mt-3 flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-muted">Grams</label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    inputMode="numeric"
                    autoFocus
                    value={gramsInput}
                    onChange={(e) => setGramsInput(e.target.value)}
                    placeholder="e.g. 137"
                    className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setGramsMode(false)}
                  className="mt-2 text-[12px] text-muted underline underline-offset-2 hover:text-foreground"
                >
                  or pick a serving size
                </button>
              </>
            )}

            <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">
              {calories} cal
            </p>
            <p className="mt-1 text-xs text-muted">
              {protein.toFixed(0)}g protein · {carbs.toFixed(0)}g carbs · {fat.toFixed(0)}g fat
            </p>

            {searchError && <p className="mt-2 text-[13px] text-danger">{searchError}</p>}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleAdd}
                disabled={!canAdd}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {addLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedFood(null);
                  setSelectedServingId("");
                }}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-[13px] font-medium transition-colors hover:border-accent"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>

      {searchStatus === "error" && !selectedFood && (
        <p className="mt-2 text-[13px] text-danger">{searchError}</p>
      )}

      <p className="mt-2 text-[11px] text-muted">
        {/* Begin fatsecret Platform API HTML Attribution Snippet */}
        <a
          href="https://platform.fatsecret.com"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Powered by fatsecret Platform API
        </a>
        {/* End fatsecret Platform API HTML Attribution Snippet */}
      </p>
    </div>
  );
}
