import { NextRequest, NextResponse } from "next/server";

export interface SpoonacularRecipe {
  id: number;
  title: string;
  image: string;
  usedIngredientCount: number;
  missedIngredientCount: number;
  missedIngredients: { name: string; amount: number; unit: string }[];
  usedIngredients: { name: string; amount: number; unit: string }[];
  likes: number;
}

export const maxDuration = 30;

export async function POST(req: NextRequest) {
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
    number: "9",
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
  return NextResponse.json({ recipes });
}
