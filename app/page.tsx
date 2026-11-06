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

  // "Ready" means nothing missing beyond pantry basics (salt, oil, water…),
  // which Spoonacular skips via ignorePantry. The rest sort by fewest missing.
  const readyRecipes = recipes.filter((r) => r.missedIngredientCount === 0);
  const needMoreRecipes = recipes
    .filter((r) => r.missedIngredientCount > 0)
    .sort((a, b) => a.missedIngredientCount - b.missedIngredientCount);

  // ─── Render ──────────────────────────────────────────────────────────────────
  // Colors, type sizes and spacing all come from kit.css (see globals.css).
  // Spacing is on a 6px unit: p-1 = 6px, p-4 = 24px. Kit element rules give
  // <p> and headings a bottom margin, so text outside a space-y-* stack sets m-0.

  const statusText =
    status === "detecting"
      ? "Taking stock…"
      : status === "fetching"
      ? "Building your menu…"
      : "Take stock";

  return (
    <div className="min-h-screen flex flex-col">

      {/* No header. Top padding clears the notch / status bar on phones. */}
      <main
        className="flex-1 px-3 pb-24 space-y-6 max-w-tablet mx-auto w-full"
        style={{ paddingTop: "calc(2.25rem + env(safe-area-inset-top))" }}
      >

        {/* ── Photo zone ──
            Empty state: prompt + upload button
            With photos: horizontal scrolling strip + "add more" tile */}
        {photos.length === 0 ? (
          <div>
            <h1 className="m-0 font-display text-3xl font-thin italic">Stop waffling. Start cooking.</h1>
            <p className="m-0 mt-1 text-md">
              Create a list of recipes you can make from the photographs of your cabinet and refrigerator contents.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex gap-2 overflow-x-auto pb-1 photo-strip">
              {photos.map((p, i) => (
                <div key={i} className="relative flex-none w-16 h-16 bg-well overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute top-1 right-1 w-4 h-4 bg-bg border border-border text-text text-xs flex items-center justify-center leading-none active:bg-text active:text-bg"
                  >
                    ×
                  </button>
                </div>
              ))}
              {photos.length < 6 && (
                <label className="relative flex-none w-16 h-16 border border-border flex flex-col items-center justify-center cursor-pointer overflow-hidden active:bg-text active:text-bg has-focus-visible:outline-4 has-focus-visible:outline-accent has-focus-visible:outline-offset-2">
                  <span className="text-xs">+ Add</span>
                  <span className="text-2xs font-mono text-text-muted">{photos.length}/6</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    aria-label="Add more photos"
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    onChange={(e) => e.target.files && addFiles(e.target.files)}
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {status === "error" && (
          <p role="alert" className="m-0 text-sm text-danger border-l-2 border-danger pl-2">{error}</p>
        )}

        {/* ── Ingredients loading placeholder ── */}
        {isScanning && ingredients.length === 0 && (
          <div aria-hidden="true" className="space-y-2 border-t border-border pt-4">
            <div className="h-2 w-16 bg-well motion-safe:animate-pulse" />
            <div className="flex flex-wrap gap-1">
              {[80, 60, 100, 72, 56, 88].map((w, i) => (
                <div key={i} className="h-4 rounded-full bg-well motion-safe:animate-pulse" style={{ width: w }} />
              ))}
            </div>
          </div>
        )}

        {/* ── Ingredients ──
            Editable pill list. Remove pills or add manually before re-scanning. */}
        {ingredients.length > 0 && (
          <section className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <h2 className="m-0 font-sans font-normal text-xs uppercase tracking-widest text-text-muted">
                On hand <span className="font-mono">{ingredients.length}</span>
              </h2>
              {status === "done" && (
                <button onClick={refetchRecipes} className="min-h-4 text-xs underline underline-offset-2 text-text-muted hover:text-text">
                  Refresh
                </button>
              )}
            </div>

            <ul className="m-0 px-0 py-1 list-none flex flex-wrap gap-1">
              {ingredients.map((ing, i) => (
                <li key={i} className="inline-flex items-center gap-0.5 pl-2 pr-0.5 border border-border rounded-full text-sm">
                  {ing}
                  <button
                    onClick={() => removeIngredient(i)}
                    aria-label={`Remove ${ing}`}
                    className="w-4 h-4 rounded-full flex items-center justify-center leading-none text-text-muted hover:text-text active:bg-text active:text-bg"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            <form onSubmit={addIngredient} className="flex gap-2">
              <label htmlFor="new-ingredient" className="sr-only">Add ingredient</label>
              <input
                id="new-ingredient"
                value={newIngredient}
                onChange={(e) => setNewIngredient(e.target.value)}
                placeholder="Add ingredient"
                className="flex-1 min-w-0 px-2 py-2 bg-bg text-text border border-border text-sm"
              />
              <button type="submit" className="px-4 py-2 border border-border text-sm active:bg-text active:text-bg">
                Add
              </button>
            </form>
          </section>
        )}

        {/* ── Recipes loading placeholder ── */}
        {status === "fetching" && (
          <div aria-hidden="true" className="space-y-3 border-t border-border pt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-2 motion-safe:animate-pulse">
                <div className="w-11 h-11 bg-well flex-none" />
                <div className="flex-1 space-y-1 py-1">
                  <div className="h-2 bg-well w-3/4" />
                  <div className="h-2 bg-well w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Recipes ──
            Each row links out to the full recipe on Spoonacular.
            Shows how many ingredients you already have vs. still need.
            Each dish is a bordered card; pressing inverts it. */}
        {[
          { title: "Ready to make", list: readyRecipes },
          { title: "Need a few things", list: needMoreRecipes },
        ].map(({ title, list }) => list.length > 0 && (
          <section key={title} className="border-t border-border pt-4">
            <h2 className="m-0 mb-3 font-sans font-normal text-xs uppercase tracking-widest text-text-muted">
              {title} <span className="font-mono">{list.length}</span>
            </h2>
            <ul className="m-0 p-0 list-none space-y-2">
              {list.map((recipe) => (
                <li key={recipe.id}>
                  <a
                    href={`https://spoonacular.com/recipes/${recipe.title.toLowerCase().replace(/\s+/g, "-")}-${recipe.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex bg-bg text-text no-underline border border-border active:bg-text active:text-bg"
                  >
                    {recipe.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={recipe.image} alt="" className="w-12 min-h-12 self-stretch object-cover flex-none border-r border-border" />
                    )}
                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5 px-2 py-1">
                      <p className="m-0 font-display text-md line-clamp-2 group-hover:underline underline-offset-2">{recipe.title}</p>
                      <p className="m-0 text-xs text-text-muted group-active:text-bg">
                        {recipe.missedIngredientCount === 0
                          ? `Uses ${recipe.usedIngredientCount} of yours`
                          : `Need: ${recipe.missedIngredients.map((m) => m.name).join(", ")}`}
                      </p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {status === "done" && recipes.length === 0 && (
          <p className="m-0 text-sm text-text-muted py-6 text-center">
            Nothing found. Edit your larder above.
          </p>
        )}

        {/* Announces scan progress to screen readers. */}
        <p className="sr-only" aria-live="polite">
          {isScanning ? statusText : status === "done" ? `${recipes.length} possible dishes` : ""}
        </p>
      </main>

      {/* ── Primary action bar ──
          Fixed at the bottom with a 2px rule, never a shadow. Shows Add Photos
          or Take stock depending on state. Pink is for this one action only.
          While scanning it turns into a plain bordered button so the progress
          text stays readable (the kit's faded disabled state would not be). */}
      <div
        className="fixed bottom-0 inset-x-0 px-3 pt-2 bg-dock border-t-2 border-border"
        style={{ paddingBottom: "calc(1.125rem + env(safe-area-inset-bottom))" }}
      >
        <div className="max-w-tablet mx-auto">
          {photos.length === 0 ? (
            <label className="btn btn-accent border-text relative block w-full text-center overflow-hidden active:bg-accent-hover has-focus-visible:outline-4 has-focus-visible:outline-accent has-focus-visible:outline-offset-2">
              Add photos
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
              className="btn btn-accent border-text w-full disabled:opacity-100 disabled:bg-bg disabled:text-text disabled:border-border disabled:font-normal"
            >
              {statusText}
            </button>
          )}
        </div>
      </div>
      {/* built with Claude and Claude + Spoonacular */}

    </div>
  );
}
