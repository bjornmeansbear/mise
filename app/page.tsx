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
    <div className="min-h-screen flex flex-col">

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 bg-stone-50/90 backdrop-blur-sm border-b border-stone-100 px-4 py-3 flex items-center gap-3">
        <div className="leading-tight">
          <p className="font-bold text-base">MISE</p>
        </div>
      </header>

      <main className="flex-1 px-4 pt-5 pb-32 space-y-5 max-w-xl mx-auto w-full">

        {/* ── Photo zone ──
            Empty state: big prompt + upload button
            With photos: horizontal scrolling strip + "add more" tile */}
        {photos.length === 0 ? (
          <div className="p-8 flex flex-col items-center gap-5 text-center">
            <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center text-4xl">
              📸
            </div>
            <div>
              <p className="font-semibold text-stone-800 text-lg">What&apos;s in your fridge?</p>
              <p className="text-sm text-stone-400 mt-1">
                Snap your fridge, pantry, or counter — Mise will figure out what you have.
              </p>
            </div>
            {/* label wraps input so iOS Safari fires onChange reliably */}
            <label className="relative w-full py-3.5 bg-green-500 text-white rounded-2xl font-semibold text-sm text-center cursor-pointer active:scale-95 transition-transform overflow-hidden">
              📷 Add Photos
              <input
                type="file"
                accept="image/*"
                multiple
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
            </label>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2 overflow-x-auto pb-1 photo-strip">
              {photos.map((p, i) => (
                <div key={i} className="relative flex-none w-28 h-28 rounded-2xl overflow-hidden bg-stone-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {photos.length < 6 && (
                <label className="relative flex-none w-28 h-28 rounded-2xl border-2 border-dashed border-stone-200 flex flex-col items-center justify-center gap-1 text-stone-400 cursor-pointer overflow-hidden">
                  <span className="text-2xl">📷</span>
                  <span className="text-xs">Add more</span>
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
            <p className="text-xs text-stone-400 text-center">
              {photos.length}/6 · add fridge, pantry, counter shots
            </p>
          </div>
        )}

        {/* ── Error ── */}
        {status === "error" && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* ── Ingredients loading skeleton ── */}
        {isScanning && ingredients.length === 0 && (
          <div className="bg-white rounded-2xl p-4 space-y-3 border border-stone-100">
            <div className="h-4 w-32 bg-stone-100 rounded-full animate-pulse" />
            <div className="flex flex-wrap gap-2">
              {[80, 60, 100, 72, 56, 88].map((w, i) => (
                <div key={i} className="h-8 rounded-full bg-stone-100 animate-pulse" style={{ width: w }} />
              ))}
            </div>
          </div>
        )}

        {/* ── Ingredients ──
            Editable chip list. Remove chips or add manually before re-scanning. */}
        {ingredients.length > 0 && (
          <div className="bg-white rounded-2xl p-4 space-y-3 shadow-sm border border-stone-100">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                🥦 Ingredients
                <span className="ml-1.5 text-stone-400 font-normal text-sm">({ingredients.length})</span>
              </h2>
              {status === "done" && (
                <button onClick={refetchRecipes} className="text-sm text-green-600 font-medium">
                  Refresh →
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {ingredients.map((ing, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-800 rounded-full text-sm font-medium">
                  {ing}
                  <button onClick={() => removeIngredient(i)} className="text-green-400 leading-none text-base">×</button>
                </span>
              ))}
            </div>

            <form onSubmit={addIngredient} className="flex gap-2">
              <input
                value={newIngredient}
                onChange={(e) => setNewIngredient(e.target.value)}
                placeholder="Add an ingredient…"
                className="flex-1 px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
              />
              <button type="submit" className="px-4 py-2.5 bg-stone-100 rounded-xl text-sm font-medium active:scale-95 transition-transform">
                Add
              </button>
            </form>
          </div>
        )}

        {/* ── Recipes loading skeleton ── */}
        {status === "fetching" && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden border border-stone-100 flex animate-pulse">
                <div className="w-24 h-24 bg-stone-100 flex-none" />
                <div className="py-3 px-3 flex-1 space-y-2">
                  <div className="h-4 bg-stone-100 rounded-full w-3/4" />
                  <div className="h-3 bg-stone-100 rounded-full w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Recipes ──
            Each card links out to the full recipe on Spoonacular.
            Shows how many ingredients you already have vs. still need. */}
        {recipes.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold text-base">🍽️ Recipes you can make</h2>
            {recipes.map((recipe) => (
              <a
                key={recipe.id}
                href={`https://spoonacular.com/recipes/${recipe.title.toLowerCase().replace(/\s+/g, "-")}-${recipe.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white rounded-2xl overflow-hidden border border-stone-100 flex active:scale-[0.98] transition-transform shadow-sm"
              >
                {recipe.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={recipe.image} alt={recipe.title} className="w-24 h-24 object-cover flex-none" />
                )}
                <div className="px-3 py-3 flex-1 min-w-0 flex flex-col justify-center gap-1">
                  <h3 className="font-semibold text-sm leading-snug line-clamp-2">{recipe.title}</h3>
                  <div className="flex gap-3 text-xs">
                    <span className="text-green-600 font-medium">✓ {recipe.usedIngredientCount} you have</span>
                    {recipe.missedIngredientCount > 0 && (
                      <span className="text-stone-400">+{recipe.missedIngredientCount} needed</span>
                    )}
                  </div>
                  {recipe.missedIngredientCount > 0 && (
                    <p className="text-xs text-stone-400 truncate">
                      Need: {recipe.missedIngredients.map((m) => m.name).join(", ")}
                    </p>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}

        {status === "done" && recipes.length === 0 && (
          <div className="text-center py-8 text-stone-400 text-sm">
            No recipes found. Try editing the ingredients above.
          </div>
        )}

        <p className="text-center text-xs text-stone-300">Powered by Claude + Spoonacular</p>
      </main>

      {/* ── Sticky scan button ──
          Only appears once photos are added. Stays fixed at the bottom. */}
      {photos.length > 0 && (
        <div
          className="fixed bottom-0 inset-x-0 px-4 pt-3 bg-gradient-to-t from-stone-50 via-stone-50/95 to-transparent"
          style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        >
          <div className="max-w-xl mx-auto">
            <button
              onClick={scan}
              disabled={isScanning}
              className="w-full py-4 rounded-2xl bg-green-500 disabled:bg-stone-200 disabled:text-stone-400 text-white font-bold text-lg shadow-lg shadow-green-200 active:scale-[0.98] transition-transform"
            >
              {status === "detecting"
                ? "🔍 Scanning ingredients…"
                : status === "fetching"
                ? "👨‍🍳 Finding recipes…"
                : "Scan my fridge"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
