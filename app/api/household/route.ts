import { NextRequest, NextResponse } from "next/server";
import { HOUSEHOLD_KEY, badCode, isHousehold, redis } from "../../lib/server/access";

// The household's shared state: one Redis hash, one field per piece, so a
// change to the shopping list doesn't overwrite a fridge edit made on the
// other phone a moment earlier. Photos aren't stored; they stay on the
// phone that took them.

const FIELDS = ["ingredients", "recipes", "searchedFor", "picked"] as const;
const MAX_BYTES = 200_000; // generous: 20 recipes with their ingredient lists is ~30KB

// No code at all: a guest. A wrong code: the stored one is out of date.
const refuse = (req: NextRequest) =>
  req.headers.get("x-household")
    ? badCode()
    : NextResponse.json({ error: "Household only" }, { status: 401 });

const notSetUp = () =>
  NextResponse.json({ error: "Sharing isn’t set up yet.", code: "no-store" }, { status: 503 });

export async function GET(req: NextRequest) {
  if (!isHousehold(req)) return refuse(req);
  if (!redis) return notSetUp();
  const state = (await redis.hgetall(HOUSEHOLD_KEY)) ?? {};
  return NextResponse.json({ state });
}

export async function PATCH(req: NextRequest) {
  if (!isHousehold(req)) return refuse(req);
  if (!redis) return notSetUp();

  const raw = await req.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ error: "Too much to save" }, { status: 413 });
  }
  const body = JSON.parse(raw) as Record<string, unknown>;
  const patch = Object.fromEntries(FIELDS.filter((f) => f in body).map((f) => [f, body[f]]));
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  await redis.hset(HOUSEHOLD_KEY, patch);
  return NextResponse.json({ ok: true });
}
