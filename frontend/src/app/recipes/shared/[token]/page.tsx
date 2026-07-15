"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Logo } from "@/components/Logo";

type Recipe = {
  id: string;
  name: string;
  total_calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servings: number;
  ingredients: string[];
};

export default function SharedRecipePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    async function run() {
      try {
        const data = await api.get(`/api/recipes/shared/${params.token}`);
        setRecipe(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Recipe not found");
      }
    }
    run();
  }, [params.token]);

  async function handleAccept() {
    setAccepting(true);
    setError("");
    try {
      await api.post(`/api/recipes/shared/${params.token}/accept`, {});
      router.push("/recipes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept recipe");
      setAccepting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <Logo className="mb-6" />

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {!error && !recipe && <p className="text-[13px] text-muted">Loading…</p>}

      {recipe && (
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-soft">
          <p className="label-xs">Shared recipe</p>
          <p className="mt-1 text-lg font-semibold tracking-tight">{recipe.name}</p>
          <p className="mt-1 text-[13px] text-muted">
            {Math.round(recipe.total_calories / recipe.servings)} cal/serving ·{" "}
            {recipe.servings} servings
          </p>

          {recipe.ingredients.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-[13px] text-muted">
              {recipe.ingredients.map((ing, i) => (
                <li key={i}>· {ing}</li>
              ))}
            </ul>
          )}

          <button
            onClick={handleAccept}
            disabled={accepting}
            className="mt-4 w-full rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {accepting ? "Adding…" : "Add to my recipes"}
          </button>
        </div>
      )}
    </div>
  );
}
