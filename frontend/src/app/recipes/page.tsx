"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Check, MoreVertical, Pencil, Search, Share2, Star, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { localDateString } from "@/lib/date";
import { Skeleton } from "@/components/Skeleton";
import { FoodPicker, type PickedFood } from "@/components/FoodPicker";

type Recipe = {
  id: string;
  name: string;
  total_calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  servings: number;
  ingredients: string[];
  tags: string[];
  is_favorite: boolean;
  share_token: string | null;
  mine: boolean;
};

type Toast = { message: string };

function currentMealType() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 21) return "dinner";
  return "snack";
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [servings, setServings] = useState("4");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadRecipes = useCallback(async () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (tagFilter) params.set("tag", tagFilter);
    if (favoritesOnly) params.set("favorite", "true");
    try {
      const data = await api.get(`/api/recipes?${params.toString()}`);
      setRecipes(data.recipes);
      if (!debouncedSearch && !tagFilter && !favoritesOnly) {
        const tags = new Set<string>();
        for (const r of data.recipes as Recipe[]) r.tags.forEach((t) => tags.add(t));
        setAllTags(Array.from(tags).sort());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recipes");
    }
  }, [debouncedSearch, tagFilter, favoritesOnly]);

  useEffect(() => {
    const timer = setTimeout(() => loadRecipes(), 0);
    return () => clearTimeout(timer);
  }, [loadRecipes]);

  async function toggleFavorite(recipe: Recipe) {
    setRecipes(
      (prev) =>
        prev?.map((r) =>
          r.id === recipe.id ? { ...r, is_favorite: !r.is_favorite } : r,
        ) ?? null,
    );
    try {
      if (recipe.is_favorite) {
        await api.delete(`/api/recipes/${recipe.id}/favorite`);
      } else {
        await api.post(`/api/recipes/${recipe.id}/favorite`, {});
      }
    } catch (err) {
      setRecipes(
        (prev) =>
          prev?.map((r) => (r.id === recipe.id ? recipe : r)) ?? null,
      );
      setError(err instanceof Error ? err.message : "Failed to update favorite");
    }
  }

  function showToast(message: string) {
    setToast({ message });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleLog(recipe: Recipe) {
    try {
      await api.post(`/api/recipes/${recipe.id}/log`, {
        date: localDateString(),
        meal_type: currentMealType(),
      });
      showToast(`Logged ${recipe.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log meal");
    }
  }

  async function handleShare(recipe: Recipe) {
    if (!recipe.share_token) return;
    const url = `${window.location.origin}/recipes/shared/${recipe.share_token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(recipe.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleDelete(recipe: Recipe) {
    setOpenMenuId(null);
    const prev = recipes;
    setRecipes((cur) => cur?.filter((r) => r.id !== recipe.id) ?? null);
    if (editingId === recipe.id) resetForm();
    try {
      await api.delete(`/api/recipes/${recipe.id}`);
    } catch (err) {
      setRecipes(prev ?? null);
      setError(err instanceof Error ? err.message : "Failed to delete recipe");
    }
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setServings("4");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFat("");
    setFiber("");
    setIngredientsText("");
    setTagsText("");
  }

  function handleEdit(recipe: Recipe) {
    setOpenMenuId(null);
    setEditingId(recipe.id);
    setName(recipe.name);
    setServings(String(recipe.servings));
    setCalories(String(recipe.total_calories));
    setProtein(recipe.protein ? String(recipe.protein) : "");
    setCarbs(recipe.carbs ? String(recipe.carbs) : "");
    setFat(recipe.fat ? String(recipe.fat) : "");
    setFiber(recipe.fiber ? String(recipe.fiber) : "");
    setIngredientsText(recipe.ingredients.join("\n"));
    setTagsText(recipe.tags.join(", "));
    document.getElementById("recipeName")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Adds a searched food's macros into the running totals and appends a
  // readable ingredient line — a convenience on top of the existing manual
  // fields, not a replacement: totals stay editable afterward for anything
  // FatSecret doesn't have a clean match for.
  function handleAddIngredient(food: PickedFood) {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    setCalories((prev) => String(Math.round((Number(prev) || 0) + food.calories)));
    setProtein((prev) => String(round2((Number(prev) || 0) + food.protein)));
    setCarbs((prev) => String(round2((Number(prev) || 0) + food.carbs)));
    setFat((prev) => String(round2((Number(prev) || 0) + food.fat)));
    setFiber((prev) => String(round2((Number(prev) || 0) + food.fiber)));
    setIngredientsText((prev) => {
      const line = `${food.quantity} × ${food.servingLabel} ${food.name}`;
      return prev ? `${prev}\n${line}` : line;
    });
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const body = {
      name,
      servings: Number(servings),
      total_calories: Number(calories),
      protein: protein ? Number(protein) : 0,
      carbs: carbs ? Number(carbs) : 0,
      fat: fat ? Number(fat) : 0,
      fiber: fiber ? Number(fiber) : 0,
      ingredients: ingredientsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      tags: tagsText
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    };

    try {
      if (editingId) {
        const updated: Recipe = await api.put(`/api/recipes/${editingId}`, body);
        setRecipes((prev) => prev?.map((r) => (r.id === updated.id ? updated : r)) ?? null);
      } else {
        const recipe: Recipe = await api.post("/api/recipes", body);
        setRecipes((prev) => [recipe, ...(prev ?? [])]);
      }
      resetForm();
      loadRecipes();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Failed to ${editingId ? "update" : "create"} recipe`
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-20 pt-6 sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight">Recipes</h1>

        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}

        <section className="mt-6">
          <h2 className="label-xs">My recipes</h2>

          <div className="mt-3 flex flex-col gap-2">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search recipes"
                className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-8 pr-3 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>

            {(allTags.length > 0 || favoritesOnly) && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setFavoritesOnly((v) => !v)}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    favoritesOnly
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  <Star size={12} className={favoritesOnly ? "fill-current" : ""} />
                  Favorites
                </button>
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTagFilter((cur) => (cur === t ? null : t))}
                    className={`rounded-full border px-2.5 py-1 text-[12px] font-medium capitalize transition-colors ${
                      tagFilter === t
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border text-muted hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {recipes && recipes.length === 0 && (
            <p className="mt-3 rounded-xl border border-dashed border-border p-5 text-center text-[13px] text-muted">
              {search || tagFilter || favoritesOnly
                ? "No recipes match."
                : "No recipes yet. Build one below, or accept a share link from your partner."}
            </p>
          )}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {!recipes &&
              Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col rounded-xl border border-border bg-surface p-4 shadow-soft"
                >
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="mt-2 h-3 w-36" />
                  <Skeleton className="mt-3 h-8 w-full" />
                </div>
              ))}
            {recipes?.map((r) => (
              <div
                key={r.id}
                className="relative flex flex-col rounded-xl border border-border bg-surface p-4 shadow-soft"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-medium">{r.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {Math.round(r.total_calories / r.servings)} cal/serving ·{" "}
                      {r.servings} servings
                    </p>
                    {r.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => toggleFavorite(r)}
                      aria-label={r.is_favorite ? "Remove favorite" : "Mark as favorite"}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      <Star
                        size={16}
                        className={r.is_favorite ? "fill-accent text-accent" : ""}
                      />
                    </button>
                    {(r.mine || r.share_token) && (
                      <button
                        onClick={() => setOpenMenuId((id) => (id === r.id ? null : r.id))}
                        aria-label={`More actions for ${r.name}`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                      >
                        <MoreVertical size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleLog(r)}
                  className="mt-3 w-full rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90"
                >
                  Log a serving
                </button>

                {openMenuId === r.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setOpenMenuId(null)}
                    />
                    <div className="absolute right-4 top-11 z-20 w-44 overflow-hidden rounded-lg border border-border bg-surface shadow-soft">
                      {r.share_token && (
                        <button
                          onClick={() => handleShare(r)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                        >
                          {copiedId === r.id ? <Check size={14} /> : <Share2 size={14} />}
                          {copiedId === r.id ? "Copied!" : "Copy share link"}
                        </button>
                      )}
                      {r.mine && (
                        <button
                          onClick={() => handleEdit(r)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                      )}
                      {r.mine && (
                        <button
                          onClick={() => handleDelete(r)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-danger transition-colors hover:bg-surface-2"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-7">
          <h2 className="label-xs">{editingId ? "Edit recipe" : "New recipe"}</h2>
          <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1 lg:col-span-3">
                <label htmlFor="recipeName" className="text-[13px] font-medium text-muted">
                  Name <span className="text-danger">*</span>
                </label>
                <input
                  id="recipeName"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Chicken chili"
                  className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="servings" className="text-[13px] font-medium text-muted">
                  Servings (whole batch) <span className="text-danger">*</span>
                </label>
                <input
                  id="servings"
                  type="number"
                  required
                  min={0.5}
                  step="0.5"
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="totalCalories" className="text-[13px] font-medium text-muted">
                  Total cal <span className="text-danger">*</span>
                </label>
                <input
                  id="totalCalories"
                  type="number"
                  required
                  min={0}
                  step="1"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="totalProtein" className="text-[13px] font-medium text-muted">
                  Protein
                </label>
                <input
                  id="totalProtein"
                  type="number"
                  min={0}
                  step="0.01"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="totalCarbs" className="text-[13px] font-medium text-muted">
                  Carbs
                </label>
                <input
                  id="totalCarbs"
                  type="number"
                  min={0}
                  step="0.01"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="totalFat" className="text-[13px] font-medium text-muted">
                  Fat
                </label>
                <input
                  id="totalFat"
                  type="number"
                  min={0}
                  step="0.01"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="totalFiber" className="text-[13px] font-medium text-muted">
                  Fiber
                </label>
                <input
                  id="totalFiber"
                  type="number"
                  min={0}
                  step="0.01"
                  value={fiber}
                  onChange={(e) => setFiber(e.target.value)}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="tags" className="text-[13px] font-medium text-muted">
                Tags (comma-separated, optional)
              </label>
              <input
                id="tags"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="high-protein, quick, breakfast"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-muted">
                Add an ingredient (optional)
              </label>
              <p className="text-xs text-muted">
                Search adds its macros to the totals above and a line below —
                the totals stay editable if you need to adjust anything.
              </p>
              <div className="mt-1">
                <FoodPicker addLabel="Add ingredient" onAdd={handleAddIngredient} />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="ingredients" className="text-[13px] font-medium text-muted">
                Ingredients (one per line, optional)
              </label>
              <textarea
                id="ingredients"
                rows={8}
                value={ingredientsText}
                onChange={(e) => setIngredientsText(e.target.value)}
                placeholder={"2 lb chicken breast\n2 cans beans\n1 onion"}
                className="resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Saving…" : editingId ? "Save changes" : "Save recipe"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium transition-colors hover:border-accent"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
      </main>

      {toast && (
        <div className="fixed inset-x-0 bottom-6 flex justify-center px-6">
          <div className="rounded-lg bg-accent-soft px-4 py-2.5 text-[13px] text-accent shadow-lg">
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
