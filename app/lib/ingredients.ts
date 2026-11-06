// Comparison key for an ingredient name: lowercase, single spaces, last word
// made singular. Only used to spot repeats. The list shows the first spelling
// it saw, so a rough singular ("molass") never reaches the screen.
export function ingredientKey(name: string): string {
  const words = name.trim().toLowerCase().split(/\s+/);
  const last = words.pop() ?? "";
  return [...words, singular(last)].join(" ");
}

function singular(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y"; // berries → berry
  if (w.endsWith("oes")) return w.slice(0, -2); // tomatoes → tomato
  if (/(ss|sh|ch|x|z)es$/.test(w)) return w.slice(0, -2); // radishes → radish
  if (/(ss|us|is)$/.test(w)) return w; // swiss, hummus, asparagus
  if (w.endsWith("s")) return w.slice(0, -1); // eggs → egg
  return w;
}

// Keeps the first of each repeat, in order. Blank names are dropped.
export function dedupeIngredients(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim().toLowerCase().replace(/\s+/g, " ");
    const key = ingredientKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
