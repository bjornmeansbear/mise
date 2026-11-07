"use client";

import { useRef, useState } from "react";
import type { SpoonacularRecipe } from "./api/recipes/route";
import { dedupeIngredients, ingredientKey } from "./lib/ingredients";

// ─── Flow ─────────────────────────────────────────────────────────────────────
// Photo by photo. Each photo is scanned as soon as it's added, and its
// ingredients join the list while you take the next one. Scans run one at a
// time, in order, so each one can send Claude the list found so far.
// "Find recipes" runs the Spoonacular search once, on the current list.

type Photo = {
  id: number;
  file: File;
  preview: string;
  state: "scanning" | "done" | "error";
  found?: number; // new ingredients this photo added
};

type Status = "idle" | "fetching" | "done";

// Three views, switched from the tab bar at the bottom. Photos live inside
// Fridge: they're only a way to get ingredients.
type View = "fridge" | "recipes" | "list";
const VIEWS: { id: View; label: string }[] = [
  { id: "fridge", label: "Fridge" },
  { id: "recipes", label: "Recipes" },
  { id: "list", label: "List" },
];

export default function Home() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [newIngredient, setNewIngredient] = useState("");
  const [recipes, setRecipes] = useState<SpoonacularRecipe[]>([]);
  const [searchedFor, setSearchedFor] = useState(""); // list the recipes were found for
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set()); // recipe ids on the shopping list
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<View>("fridge");
  const [photosOpen, setPhotosOpen] = useState(false); // photo strip, tucked away by default

  // Queued scans read the list between renders, so it also lives in a ref.
  // Every change to the list goes through setList to keep the two in step.
  const listRef = useRef<string[]>([]);
  const setList = (next: string[]) => {
    listRef.current = next;
    setIngredients(next);
  };

  const nextId = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const removed = useRef<Set<number>>(new Set());

  const updatePhoto = (id: number, patch: Partial<Photo>) =>
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // Each view starts at its top, not wherever the last one was scrolled to.
  const goTo = (v: View) => {
    setView(v);
    window.scrollTo(0, 0);
  };

  // ─── Photos ──────────────────────────────────────────────────────────────────

  // Shrink each photo before upload. A full-size iPhone photo is 3–8MB, over
  // both the server's 4.5MB request limit and Claude's 5MB image limit.
  // 1568px on the long edge is the most detail Claude uses anyway. If the
  // browser can't decode a file, it goes up as-is.
  const shrinkToDataUrl = async (file: File): Promise<string> => {
    const MAX_EDGE = 1568;
    try {
      const bitmap = await createImageBitmap(file); // applies EXIF rotation
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return canvas.toDataURL("image/jpeg", 0.8);
    } catch {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
  };

  const scanPhoto = async (id: number, file: File) => {
    if (removed.current.has(id)) return; // removed before its turn came
    try {
      const image = await shrinkToDataUrl(file);
      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [image], known: listRef.current }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Couldn't scan that photo" }));
        throw new Error(error ?? "Couldn't scan that photo");
      }
      const { ingredients: raw }: { ingredients: string[] } = await res.json();
      const before = listRef.current;
      const next = dedupeIngredients([...before, ...raw]);
      setList(next);
      updatePhoto(id, { state: "done", found: next.length - before.length });
    } catch (e) {
      updatePhoto(id, { state: "error" });
      setError(e instanceof Error ? e.message : "Couldn't scan that photo");
    }
  };

  const addFiles = (files: FileList) => {
    setError("");
    const added: Photo[] = Array.from(files)
      .filter((f) => f.type === "" || f.type.startsWith("image/"))
      .map((file) => ({ id: nextId.current++, file, preview: URL.createObjectURL(file), state: "scanning" }));
    setPhotos((prev) => [...prev, ...added]);
    for (const p of added) {
      queue.current = queue.current.then(() => scanPhoto(p.id, p.file));
    }
  };

  // Removing a photo keeps whatever it already found; remove those pills
  // directly. A photo still waiting in the queue is skipped.
  const removePhoto = (id: number) => {
    removed.current.add(id);
    setPhotos((prev) => {
      const p = prev.find((x) => x.id === id);
      if (p) URL.revokeObjectURL(p.preview);
      return prev.filter((x) => x.id !== id);
    });
  };

  // ─── Ingredients ─────────────────────────────────────────────────────────────

  const removeIngredient = (i: number) =>
    setList(listRef.current.filter((_, idx) => idx !== i));

  const addIngredient = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const val = newIngredient.trim().toLowerCase().replace(/\s+/g, " ");
    if (val && !listRef.current.some((ing) => ingredientKey(ing) === ingredientKey(val)))
      setList([...listRef.current, val]);
    setNewIngredient("");
  };

  // ─── Recipes ─────────────────────────────────────────────────────────────────

  const findRecipes = async () => {
    const list = listRef.current;
    if (list.length === 0) return;
    goTo("recipes"); // so the loading placeholder shows where the results will land
    setStatus("fetching");
    setError("");
    setPicked(new Set());
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: list }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Failed to fetch recipes" }));
        throw new Error(error ?? "Failed to fetch recipes");
      }
      const { recipes: fetched } = await res.json();
      setRecipes(fetched);
      setSearchedFor(list.join("\n"));
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStatus(recipes.length ? "done" : "idle");
    }
  };

  const isScanning = photos.some((p) => p.state === "scanning");
  const isFetching = status === "fetching";
  const isStale = status === "done" && searchedFor !== ingredients.join("\n");

  // "Ready" means nothing missing beyond pantry basics (salt, oil, water…),
  // which Spoonacular skips via ignorePantry. The rest sort by fewest missing.
  const readyRecipes = recipes.filter((r) => r.missedIngredientCount === 0);
  const needMoreRecipes = recipes
    .filter((r) => r.missedIngredientCount > 0)
    .sort((a, b) => a.missedIngredientCount - b.missedIngredientCount);

  // ─── Shopping list ───────────────────────────────────────────────────────────
  // Missing ingredients from every dish tapped "+ List", deduped, A–Z.
  // Derived from the current results, so a new search drops old picks.

  const togglePicked = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const shoppingList = dedupeIngredients(
    needMoreRecipes
      .filter((r) => picked.has(r.id))
      .flatMap((r) => r.missedIngredients.map((m) => m.name))
  ).sort();

  const listText = shoppingList.join("\n");

  // The Clipboard API needs https. On the local-network dev address it
  // doesn't exist, so fall back to the old select-and-copy trick.
  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(listText);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = listText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shareList = () => navigator.share({ title: "Shopping list", text: listText }).catch(() => {});

  // ─── Render ──────────────────────────────────────────────────────────────────
  // Colors, type sizes and spacing all come from kit.css (see globals.css).
  // Spacing is on a 6px unit: p-1 = 6px, p-4 = 24px. Kit element rules give
  // <p> and headings a bottom margin, so text outside a space-y-* stack sets m-0.

  // Fresh results don't need another search: the button just goes to them.
  const hasFreshRecipes = status === "done" && !isStale;
  const findLabel = isFetching
    ? "Building your menu…"
    : isScanning
    ? "Scanning…"
    : isStale
    ? "Update recipes"
    : hasFreshRecipes
    ? "See recipes"
    : "Find recipes";

  const liveText = isScanning
    ? "Scanning photo"
    : isFetching
    ? "Building your menu"
    : copied
    ? "Shopping list copied"
    : status === "done"
    ? `${recipes.length} possible dishes`
    : "";

  // Tabs appear once there's anything to switch between.
  const showTabs = photos.length > 0 || ingredients.length > 0 || recipes.length > 0;
  const counts: Record<View, number> = {
    fridge: ingredients.length,
    recipes: recipes.length,
    list: shoppingList.length,
  };

  // Tab keyboard pattern (WAI-ARIA): arrows, Home and End move between tabs
  // and select as they go. Only the selected tab is in the Tab order.
  const tabRefs = useRef<Record<View, HTMLButtonElement | null>>({ fridge: null, recipes: null, list: null });
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = VIEWS.findIndex((v) => v.id === view);
    const next =
      e.key === "ArrowRight" ? (i + 1) % VIEWS.length
      : e.key === "ArrowLeft" ? (i - 1 + VIEWS.length) % VIEWS.length
      : e.key === "Home" ? 0
      : e.key === "End" ? VIEWS.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    goTo(VIEWS[next].id);
    tabRefs.current[VIEWS[next].id]?.focus();
  };

  const scanning = photos.filter((p) => p.state === "scanning").length;
  const failed = photos.filter((p) => p.state === "error").length;
  const photoSummary = scanning
    ? "Scanning…"
    : failed
    ? `${failed} didn’t scan`
    : "";

  const sectionHeading = "m-0 font-sans font-normal text-xs uppercase tracking-widest text-text-muted";
  const emptyNote = "m-0 text-sm text-text-muted py-6 text-center";
  const textLink = "underline underline-offset-2 text-text";

  // Dock buttons aren't boxes in the dock, they ARE the dock: each fills its
  // share of the strip edge to edge, split by 1px ink rules. Focus rings sit
  // inset so the screen edge can't clip them.
  const cell =
    "flex-1 min-h-11 px-2 flex items-center justify-center text-center text-base cursor-pointer focus-visible:outline-4 focus-visible:-outline-offset-4 [&+*]:border-l [&+*]:border-border";
  const plainCell = `${cell} bg-bg text-text focus-visible:outline-accent active:bg-text active:text-bg`;
  // Pink while it's the next step. On pink the ring is ink (an accent ring
  // would vanish). While busy it turns plain, so its progress text stays
  // readable (the kit's faded disabled state would not be).
  const primaryCell = `${cell} bg-accent text-bg font-bold focus-visible:outline-text active:bg-accent-hover disabled:bg-bg disabled:text-text disabled:font-normal disabled:cursor-default`;

  // The bottom row's color runs into the home-indicator area on phones: the
  // inset is added below the label, on top of the row's own height.
  const safeBottom = (rem: number) => ({
    paddingBottom: "env(safe-area-inset-bottom)",
    minHeight: `calc(${rem}rem + env(safe-area-inset-bottom))`,
  });

  // Before the first photo there are no tabs, so this is the bottom row.
  const photoInput = (
    <label
      style={showTabs ? undefined : safeBottom(4.125)}
      className={`relative overflow-hidden has-focus-visible:outline-4 has-focus-visible:-outline-offset-4 ${
        photos.length === 0
          ? `${primaryCell} has-focus-visible:outline-text`
          : `${plainCell} has-focus-visible:outline-accent`
      }`}
    >
      {photos.length === 0 ? "Photograph your fridge" : "Another shelf"}
      <input
        type="file"
        accept="image/*"
        multiple
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = ""; // so the same photo can be picked again
        }}
      />
    </label>
  );

  // What the dock offers above the tabs depends on the view.
  const actions =
    view === "fridge" ? (
      <>
        {photoInput}
        {(photos.length > 0 || ingredients.length > 0) && (
          <button
            onClick={hasFreshRecipes ? () => goTo("recipes") : findRecipes}
            disabled={isScanning || isFetching || ingredients.length === 0}
            className={hasFreshRecipes ? plainCell : primaryCell}
          >
            {findLabel}
          </button>
        )}
      </>
    ) : view === "recipes" && (isStale || isFetching) ? (
      <button onClick={findRecipes} disabled={isScanning || isFetching} className={primaryCell}>
        {findLabel}
      </button>
    ) : view === "list" && shoppingList.length > 0 ? (
      <>
        <button onClick={copyList} className={plainCell}>{copied ? "Copied" : "Copy list"}</button>
        {canShare && <button onClick={shareList} className={plainCell}>Share</button>}
      </>
    ) : null;


  return (
    <div className="min-h-screen flex flex-col">

      {/* No header. Top padding clears the notch / status bar on phones.
          Bottom padding clears the dock (actions + tabs). */}
      <main
        id="view-panel"
        role={showTabs ? "tabpanel" : undefined}
        aria-labelledby={showTabs ? `tab-${view}` : undefined}
        className="flex-1 px-3 pb-32 space-y-6 max-w-tablet mx-auto w-full"
        style={{ paddingTop: "calc(2.25rem + env(safe-area-inset-top))" }}
      >

        {/* ── Error ── shown in every view */}
        {error && (
          <p role="alert" className="m-0 text-sm text-danger border-l-2 border-danger pl-2">{error}</p>
        )}

        {/* ════ Fridge ════ */}
        {view === "fridge" && (
          <>
            {photos.length === 0 && ingredients.length === 0 ? (
              <div>
                <h1 className="m-0 font-display text-3xl font-thin italic">Stop waffling. Start cooking.</h1>
                <p className="m-0 mt-1 text-md">
                  Photograph your fridge and cabinets. Get recipes you can make with what’s there.
                </p>
              </div>
            ) : (
              <h1 className="sr-only">Fridge</h1>
            )}

            {/* ── Photos ──
                Folded to one row by default. Open it to remove a photo or
                check how each one scanned. */}
            {photos.length > 0 && (
              <section>
                <button
                  onClick={() => setPhotosOpen((o) => !o)}
                  aria-expanded={photosOpen}
                  aria-controls="photo-strip"
                  className="w-full flex items-center gap-2 py-1 bg-transparent text-text text-left cursor-pointer"
                >
                  <span className={sectionHeading}>
                    Photos <span className="font-mono">{photos.length}</span>
                  </span>
                  {photoSummary && (
                    <span
                      className={`text-xs ${failed && !scanning ? "text-danger" : "text-text"} ${
                        scanning ? "motion-safe:animate-pulse" : ""
                      }`}
                    >
                      {photoSummary}
                    </span>
                  )}
                  <span aria-hidden="true" className="ml-auto text-xs text-text-muted">
                    {photosOpen ? "Hide" : "Show"}
                  </span>
                </button>

                {photosOpen && (
                  <div id="photo-strip" className="flex gap-2 overflow-x-auto pt-2 pb-1 photo-strip">
                    {photos.map((p, i) => (
                      <div key={p.id} className="relative flex-none w-16 h-16 bg-well overflow-hidden border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.preview} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => removePhoto(p.id)}
                          aria-label={`Remove photo ${i + 1}`}
                          className="absolute top-1 right-1 w-4 h-4 bg-bg border border-border text-text text-xs flex items-center justify-center leading-none active:bg-text active:text-bg"
                        >
                          ×
                        </button>
                        <p
                          className={`m-0 absolute bottom-0 inset-x-0 bg-bg border-t border-border text-2xs text-center ${
                            p.state === "error" ? "text-danger" : "text-text"
                          } ${p.state === "scanning" ? "motion-safe:animate-pulse" : ""}`}
                        >
                          {p.state === "scanning"
                            ? "Scanning…"
                            : p.state === "error"
                            ? "Didn’t scan"
                            : p.found
                            ? `+${p.found} found`
                            : "Nothing new"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── Ingredients loading placeholder (first photo only) ── */}
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
                Grows with each photo. Remove pills or add by hand. */}
            {ingredients.length > 0 && (
              <section className="space-y-3 border-t border-border pt-4">
                <h2 className={sectionHeading}>
                  On hand <span className="font-mono">{ingredients.length}</span>
                </h2>

                <ul className="m-0 px-0 py-1 list-none flex flex-wrap gap-1">
                  {ingredients.map((ing, i) => (
                    <li key={ing} className="inline-flex items-center gap-0.5 pl-2 pr-0.5 border border-border rounded-full text-sm">
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
          </>
        )}

        {/* ════ Recipes ════ */}
        {view === "recipes" && (
          <>
            <h1 className="sr-only">Recipes</h1>

            {isStale && !isFetching && (
              <p className="m-0 text-sm text-text-muted border-l-2 border-border pl-2">
                Your fridge changed since this search.
              </p>
            )}

            {/* ── Recipes loading placeholder ── */}
            {isFetching && (
              <div aria-hidden="true" className="space-y-3">
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

            {/* ── Recipe groups ──
                Each card links out to the full recipe on Spoonacular. "Need a
                few things" cards say what's missing and have a "+ List" toggle.
                Each dish is a bordered card; pressing inverts it. */}
            {!isFetching && [
              { title: "Ready to make", list: readyRecipes },
              { title: "Need a few things", list: needMoreRecipes },
            ].map(({ title, list }, gi) => list.length > 0 && (
              <section key={title} className={gi > 0 && readyRecipes.length > 0 ? "border-t border-border pt-4" : ""}>
                <h2 className={`${sectionHeading} mb-3`}>
                  {title} <span className="font-mono">{list.length}</span>
                </h2>
                <ul className="m-0 p-0 list-none space-y-2">
                  {list.map((recipe) => (
                    <li key={recipe.id} className="flex border border-border">
                      <a
                        href={`https://spoonacular.com/recipes/${recipe.title.toLowerCase().replace(/\s+/g, "-")}-${recipe.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex flex-1 min-w-0 bg-bg text-text no-underline active:bg-text active:text-bg"
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
                      {recipe.missedIngredientCount > 0 && (
                        <button
                          onClick={() => togglePicked(recipe.id)}
                          aria-pressed={picked.has(recipe.id)}
                          aria-label={`Add what ${recipe.title} needs to the shopping list`}
                          className={`flex-none w-11 border-l border-border text-xs leading-tight ${
                            picked.has(recipe.id) ? "bg-text text-bg" : "bg-bg text-text active:bg-text active:text-bg"
                          }`}
                        >
                          {picked.has(recipe.id) ? "On list" : "+ List"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {status === "idle" && (
              <p className={emptyNote}>
                No recipes yet. Add what’s on hand in{" "}
                <button onClick={() => goTo("fridge")} className={textLink}>Fridge</button>, then find recipes.
              </p>
            )}
            {status === "done" && recipes.length === 0 && (
              <p className={emptyNote}>
                Nothing found. Try editing your{" "}
                <button onClick={() => goTo("fridge")} className={textLink}>Fridge</button>.
              </p>
            )}
          </>
        )}

        {/* ════ Shopping list ════
            Everything the tapped dishes still need, in one copyable list. */}
        {view === "list" && (
          <>
            <h1 className="sr-only">Shopping list</h1>
            {shoppingList.length > 0 ? (
              <section>
                <h2 className={`${sectionHeading} mb-3`}>
                  Shopping list <span className="font-mono">{shoppingList.length}</span>
                </h2>
                <ul className="m-0 p-0 list-none border-t border-border">
                  {shoppingList.map((item) => (
                    <li key={item} className="py-1 border-b border-border text-sm">{item}</li>
                  ))}
                </ul>
              </section>
            ) : (
              <p className={emptyNote}>
                Nothing on the list yet. In{" "}
                <button onClick={() => goTo("recipes")} className={textLink}>Recipes</button>, tap “+ List” on a
                dish to add what it needs.
              </p>
            )}
          </>
        )}

        {/* Announces progress to screen readers. */}
        <p className="sr-only" aria-live="polite">{liveText}</p>
      </main>

      {/* ── Dock ──
          The whole strip is buttons, edge to edge, 2px ink rule above, no
          shadow. Top row: this view's actions, sharing the width (pink = the
          one next step). Bottom row: the three tabs, current one inverted.
          Whichever row is last runs down into the phone's home-indicator area. */}
      <div className="fixed bottom-0 inset-x-0 border-t-2 border-border bg-bg">
        {actions && <div className="flex">{actions}</div>}

        {showTabs && (
          <div
            role="tablist"
            aria-label="Views"
            className={`grid grid-cols-3 ${actions ? "border-t border-border" : ""}`}
            onKeyDown={onTabKey}
          >
            {VIEWS.map(({ id, label }, i) => {
              const selected = view === id;
              return (
                <button
                  key={id}
                  id={`tab-${id}`}
                  ref={(el) => { tabRefs.current[id] = el; }}
                  role="tab"
                  aria-selected={selected}
                  aria-controls="view-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => goTo(id)}
                  style={safeBottom(3)}
                  className={`min-h-8 px-1 flex items-center justify-center gap-1 text-sm cursor-pointer focus-visible:outline-4 focus-visible:-outline-offset-4 ${
                    i > 0 ? "border-l border-border" : ""
                  } ${
                    // Pink focus ring on the plain tabs (4.78:1 light, 8.80:1 dark). On the
                    // inverted tab pink drops under 3:1, so its ring is the page color.
                    selected
                      ? "bg-text text-bg font-bold focus-visible:outline-bg"
                      : "bg-bg text-text focus-visible:outline-accent active:bg-text active:text-bg"
                  }`}
                >
                  {label}
                  {counts[id] > 0 && <span className="font-mono text-xs font-normal">{counts[id]}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {/* built with Claude and Claude + Spoonacular */}

    </div>
  );
}
