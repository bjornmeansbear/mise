import { NextRequest, NextResponse } from "next/server";
import { guard } from "../../lib/server/access";

export interface SpoonacularRecipe {
  id: number;
  title: string;
  image: string;
  usedIngredientCount: number;
  missedIngredientCount: number;
  missedIngredients: { name: string; amount: number; unit: string }[];
  usedIngredients: { name: string; amount: number; unit: string }[];
  likes: number;
  // Added from informationBulk. Optional: older saved recipes lack them.
  sourceUrl?: string; // the original author's page, with the instructions
  sourceName?: string;
  spoonacularSourceUrl?: string;
}

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const blocked = await guard(req, "search"); // household, or a guest with searches left
  if (blocked) return blocked;

  const { ingredients }: { ingredients: string[] } = await req.json();

  if (!ingredients || ingredients.length === 0) {
    return NextResponse.json({ error: "No ingredients provided" }, { status: 400 });
  }

  const apiKey = process.env.SPOONACULAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Spoonacular API key not configured" }, { status: 500 });
  }

  const params = new URLSearchParams({
    apiKey,
    ingredients: ingredients.join(","),
    number: "20",
    ranking: "2", // maximize used ingredients
    ignorePantry: "true",
  });

  const res = await fetch(
    `https://api.spoonacular.com/recipes/findByIngredients?${params}`,
    { next: { revalidate: 0 } }
  );

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `Spoonacular error: ${body}` }, { status: res.status });
  }

  const recipes: SpoonacularRecipe[] = await res.json();

  // findByIngredients has no source links. One bulk call adds them.
  // If it fails, the list still works; cards fall back to Spoonacular's page.
  try {
    const info = await fetch(
      `https://api.spoonacular.com/recipes/informationBulk?${new URLSearchParams({
        apiKey,
        ids: recipes.map((r) => r.id).join(","),
      })}`,
      { next: { revalidate: 0 } }
    );
    if (info.ok) {
      const details: { id: number; sourceUrl?: string; sourceName?: string; spoonacularSourceUrl?: string }[] =
        await info.json();
      const byId = new Map(details.map((d) => [d.id, d]));
      for (const r of recipes) {
        const d = byId.get(r.id);
        if (d) {
          r.sourceUrl = d.sourceUrl;
          r.sourceName = d.sourceName;
          r.spoonacularSourceUrl = d.spoonacularSourceUrl;
        }
      }
    }
  } catch {}

  return NextResponse.json({ recipes });
}
