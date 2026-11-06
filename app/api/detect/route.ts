import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { images, known = [] }: { images: string[]; known?: string[] } = await req.json();

  // Photos are scanned one at a time. `known` is the list found so far, so
  // Claude reuses those names instead of adding "whole milk" next to "milk".
  const knownList = known.slice(0, 200).map((k) => String(k).slice(0, 60));
  const knownNote = knownList.length
    ? `\nAlready on the list: ${JSON.stringify(knownList)}
Don't repeat those. If you see the same item under another name, leave it out. Only return items that are new.`
    : "";

  if (!images || images.length === 0) {
    return NextResponse.json({ error: "No images provided" }, { status: 400 });
  }

  const imageContent: Anthropic.ImageBlockParam[] = images.map((b64) => {
    const match = b64.match(/^data:(image\/\w+);base64,/);
    const media_type = (match?.[1] ?? "image/jpeg") as Anthropic.Base64ImageSource["media_type"];
    return {
      type: "image",
      source: {
        type: "base64",
        media_type,
        data: b64.replace(/^data:image\/\w+;base64,/, ""),
      },
    };
  });

  try {
    const response = await client.messages.create({
      // Haiku 5.5 thinks by default and thinking counts toward max_tokens,
      // so the cap leaves room for it. Low effort: listing what's visible
      // doesn't need much reasoning.
      model: "claude-haiku-5-5",
      max_tokens: 4096,
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: [
            ...imageContent,
            {
              type: "text",
              text: `Look at these photos of fridge/pantry contents. List every distinct food ingredient you can identify.
Return ONLY a JSON array of ingredient names (lowercase, singular), nothing else.
Example: ["chicken breast", "broccoli", "garlic", "olive oil", "lemon"]
Be specific (e.g. "cheddar cheese" not just "cheese"). Include condiments, sauces, and spices if visible.${knownNote}`,
            },
          ],
        },
      ],
    });

    // The reply can start with thinking blocks, so find the text by type.
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const match = text.match(/\[[\s\S]*\]/);
    const ingredients: string[] = match ? JSON.parse(match[0]) : [];

    return NextResponse.json({ ingredients });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Detect error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
