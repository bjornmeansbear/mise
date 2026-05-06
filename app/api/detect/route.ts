import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { images }: { images: string[] } = await req.json();

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
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
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
Be specific (e.g. "cheddar cheese" not just "cheese"). Include condiments, sauces, and spices if visible.`,
            },
          ],
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    const match = text.match(/\[[\s\S]*\]/);
    const ingredients: string[] = match ? JSON.parse(match[0]) : [];

    return NextResponse.json({ ingredients });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Detect error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
