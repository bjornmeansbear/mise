"use client";

import { useState, useCallback } from "react";
import type { SpoonacularRecipe } from "./api/recipes/route";

type Status = "idle" | "detecting" | "fetching" | "done" | "error";

// ─── State ────────────────────────────────────────────────────────────────────
// photos    : images the user has added (up to 6)
// status    : drives loading states and which sections are visible
// ingredients: detected by Claude, editable before fetching recipes
// recipes   : returned by Spoonacular based on ingredients

export default function Home() {
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [newIngredient, setNewIngredient] = useState("");
  const [recipes, setRecipes] = useState<SpoonacularRecipe[]>([]);
  const [error, setError] = useState("");

  // ─── Photo handlers ──────────────────────────────────────────────────────────

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const added = Array.from(files)
        .filter((f) => f.type === "" || f.type.startsWith("image/"))
        .slice(0, 6 - photos.length)
        .map((file) => ({ file, preview: URL.createObjectURL(file) }));
      setPhotos((prev) => [...prev, ...added].slice(0, 6));
    },
    [photos.length]
  );

  const removePhoto = (i: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[i].preview);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // ─── Scan: detect ingredients → fetch recipes ────────────────────────────────

  const scan = async () => {
    if (photos.length === 0) return;
    setStatus("detecting");
    setError("");
    setIngredients([]);
    setRecipes([]);

    try {
      const images = await Promise.all(photos.map((p) => toBase64(p.file)));
      const detectRes = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });
      if (!detectRes.ok) {
        const { error } = await detectRes.json().catch(() => ({ error: "Failed to detect ingredients" }));
        throw new Error(error ?? "Failed to detect ingredients");
      }
      const { ingredients: detected } = await detectRes.json();
      setIngredients(detected);

      setStatus("fetching");
      const recipesRes = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: detected }),
      });
      if (!recipesRes.ok) {
        const { error } = await recipesRes.json().catch(() => ({ error: "Failed to fetch recipes" }));
        throw new Error(error ?? "Failed to fetch recipes");
      }
      const { recipes: fetched } = await recipesRes.json();
      setRecipes(fetched);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStatus("error");
    }
  };

  // ─── Ingredient handlers ─────────────────────────────────────────────────────

  const removeIngredient = (i: number) =>
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));

  const addIngredient = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const val = newIngredient.trim().toLowerCase();
    if (val && !ingredients.includes(val)) setIngredients((prev) => [...prev, val]);
    setNewIngredient("");
  };

  const refetchRecipes = async () => {
    if (ingredients.length === 0) return;
    setStatus("fetching");
    setError("");
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients }),
      });
      if (!res.ok) throw new Error("Failed to fetch recipes");
      const { recipes: fetched } = await res.json();
      setRecipes(fetched);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStatus("error");
    }
  };

  const isScanning = status === "detecting" || status === "fetching";

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-white text-ink">

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 bg-white px-4 py-2 flex items-center">
        <p className="font-sans text-xs font-bold uppercase">Mise</p>
      </header>

      <main className="flex-1 px-4 pt-8 pb-32 space-y-8 max-w-xl mx-auto w-full">

        {/* ── Photo zone ──
            Empty state: prompt + upload button
            With photos: horizontal scrolling strip + "add more" tile */}
        {photos.length === 0 ? (
          <div>
            <p className="font-serif text-3xl font-thin italic">What&apos;s in your larder?</p>
            <p className="font-sans text-md mt-1">
              Photograph what you have. Mise will create a list of ingredients and prepare some options for what you can cook.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2 overflow-x-auto pb-1 photo-strip">
              {photos.map((p, i) => (
                <div key={i} className="relative flex-none w-24 h-24 bg-stone-100 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 w-5 h-5 bg-white border border-ink text-ink text-xs flex items-center justify-center leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
              {photos.length < 6 && (
                <label className="relative flex-none w-24 h-24 border border-stone-300 flex flex-col items-center justify-center text-stone-400 cursor-pointer hover:border-ink hover:text-ink transition-colors overflow-hidden">
                  <span className="text-xs">+ Add</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    onChange={(e) => e.target.files && addFiles(e.target.files)}
                  />
                </label>
              )}
            </div>
            <p className="text-xs text-stone-400 font-mono">{photos.length}/6</p>
          </div>
        )}

        {/* ── Error ── */}
        {status === "error" && (
          <p className="text-sm text-red-700 border-l-2 border-red-700 pl-3">{error}</p>
        )}

        {/* ── Ingredients loading skeleton ── */}
        {isScanning && ingredients.length === 0 && (
          <div className="space-y-3 border-t border-stone-200 pt-6">
            <div className="h-3 w-24 bg-stone-100 animate-pulse" />
            <div className="flex flex-wrap gap-2">
              {[80, 60, 100, 72, 56, 88].map((w, i) => (
                <div key={i} className="h-6 bg-stone-100 animate-pulse" style={{ width: w }} />
              ))}
            </div>
          </div>
        )}

        {/* ── Ingredients ──
            Editable tag list. Remove tags or add manually before re-scanning. */}
        {ingredients.length > 0 && (
          <div className="space-y-4 border-t border-stone-200 pt-6">
            <div className="flex items-center justify-between">
              <p className="font-sans text-xs uppercase tracking-widest text-stone-400">
                On hand <span className="font-mono">{ingredients.length}</span>
              </p>
              {status === "done" && (
                <button onClick={refetchRecipes} className="font-sans text-xs underline underline-offset-2 text-stone-500 hover:text-ink">
                  Refresh
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {ingredients.map((ing, i) => (
                <span key={i} className="font-sans inline-flex items-center gap-1 px-2 py-1 border border-stone-300 text-sm">
                  {ing}
                  <button onClick={() => removeIngredient(i)} className="text-stone-400 hover:text-ink leading-none">×</button>
                </span>
              ))}
            </div>

            <form onSubmit={addIngredient} className="flex gap-2">
              <input
                value={newIngredient}
                onChange={(e) => setNewIngredient(e.target.value)}
                placeholder="Add ingredient"
                className="font-sans flex-1 px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:border-ink"
              />
              <button type="submit" className="font-sans px-4 py-2 border border-stone-300 text-sm hover:border-ink transition-colors">
                Add
              </button>
            </form>
          </div>
        )}

        {/* ── Recipes loading skeleton ── */}
        {status === "fetching" && (
          <div className="space-y-4 border-t border-stone-200 pt-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-16 h-16 bg-stone-100 flex-none" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 bg-stone-100 w-3/4" />
                  <div className="h-3 bg-stone-100 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Recipes ──
            Each row links out to the full recipe on Spoonacular.
            Shows how many ingredients you already have vs. still need. */}
        {recipes.length > 0 && (
          <div className="border-t border-stone-200 pt-6">
            <p className="font-sans text-xs uppercase tracking-widest text-stone-400 mb-4">Possible dishes</p>
            {recipes.map((recipe) => (
              <a
                key={recipe.id}
                href={`https://spoonacular.com/recipes/${recipe.title.toLowerCase().replace(/\s+/g, "-")}-${recipe.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-3 border-t border-stone-200 py-3 hover:bg-stone-50 transition-colors"
              >
                {recipe.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={recipe.image} alt={recipe.title} className="w-16 h-16 object-cover flex-none" />
                )}
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                  <p className="font-serif text-base leading-snug line-clamp-2">{recipe.title}</p>
                  <p className="font-sans text-xs text-stone-400 font-mono">
                    {recipe.usedIngredientCount} have · {recipe.missedIngredientCount} needed
                  </p>
                </div>
              </a>
            ))}
            <div className="border-t border-stone-200" />
          </div>
        )}

        {status === "done" && recipes.length === 0 && (
          <p className="text-sm text-stone-400 py-8 text-center">
            Nothing found. Edit your larder above.
          </p>
        )}
      </main>

      {/* ── Primary action bar ──
          Always fixed at the bottom. Shows Add Photos or Scan depending on state. */}
      <div
        className="fixed bottom-0 inset-x-0 px-4 pt-3 bg-white"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="max-w-xl mx-auto">
          {photos.length === 0 ? (
            <label className="relative block w-full py-3.5 bg-ink text-white font-sans text-sm font-medium tracking-wide text-center cursor-pointer overflow-hidden">
              Add Photos
              <input
                type="file"
                accept="image/*"
                multiple
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
            </label>
          ) : (
            <button
              onClick={scan}
              disabled={isScanning}
              className="w-full py-3.5 bg-ink disabled:bg-stone-200 disabled:text-stone-400 text-white font-sans text-sm font-medium tracking-wide transition-colors"
            >
              {status === "detecting"
                ? "Taking stock…"
                : status === "fetching"
                ? "Building your menu…"
                : "Take stock"}
            </button>
          )}
        </div>
      </div>
      {/* built with Claude and Claude + Spoonacular */}

    </div>
  );
}

