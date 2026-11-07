import { Redis } from "@upstash/redis";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { GUEST_LIMITS } from "../limits";

// ─── Who's asking ─────────────────────────────────────────────────────────────
// The household (anyone holding HOUSEHOLD_CODE) gets everything: unlimited
// scans and searches, and the shared fridge and list. Everyone else is a
// guest with a small daily allowance, so strangers can try the app without
// running up the API bills. The code travels in the x-household header.

// Upstash, added through the Vercel dashboard. It sets either the UPSTASH_*
// or the KV_* names depending on how it was added; fromEnv reads both.
const hasRedis =
  !!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
  !!(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN);
export const redis = hasRedis ? Redis.fromEnv() : null;

export const HOUSEHOLD_KEY = "household";

const givenCode = (req: NextRequest) => req.headers.get("x-household")?.trim() || "";

export function isHousehold(req: NextRequest): boolean {
  const code = process.env.HOUSEHOLD_CODE;
  const given = givenCode(req);
  if (!code || !given) return false;
  const a = Buffer.from(code);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

// A stored code that no longer matches (it was changed). The client clears
// it and carries on as a guest.
export const badCode = () =>
  NextResponse.json(
    { error: "That household link isn’t valid any more. Ask for the new one.", code: "bad-household" },
    { status: 401 }
  );

// ─── Guest allowance ──────────────────────────────────────────────────────────
// Per visitor per day, plus a total across all guests per day. The total is
// what caps spending: once it's used up, guests wait until tomorrow (UTC).
// The numbers live in app/lib/limits.ts.
type Kind = keyof typeof GUEST_LIMITS;

// Visitors are told apart by IP address, hashed so raw addresses are never
// stored. Counters delete themselves after two days.
const visitorId = (req: NextRequest) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
};

const TWO_DAYS = 60 * 60 * 48;

async function bump(key: string) {
  const n = await redis!.incr(key);
  if (n === 1) await redis!.expire(key, TWO_DAYS);
  return n;
}

// Returns a response to send instead of doing the work, or null to go ahead.
export async function guard(req: NextRequest, kind: Kind): Promise<NextResponse | null> {
  if (isHousehold(req)) return null;
  if (givenCode(req)) return badCode();

  // Without the store, guests can't be counted. Locally that's fine; on the
  // live site it means nobody but the household gets in.
  if (!redis) {
    return process.env.NODE_ENV === "production"
      ? NextResponse.json({ error: "Free tries aren’t switched on yet.", code: "limit" }, { status: 503 })
      : null;
  }

  const { perVisitor, total, noun } = GUEST_LIMITS[kind];
  const day = new Date().toISOString().slice(0, 10);

  if ((await bump(`guest:${kind}:${day}:${visitorId(req)}`)) > perVisitor) {
    return NextResponse.json(
      { error: `That’s today’s ${perVisitor} free ${noun}. Come back tomorrow.`, code: "limit" },
      { status: 429 }
    );
  }
  if ((await bump(`guest:${kind}:${day}:all`)) > total) {
    return NextResponse.json(
      { error: `Wjaffle is out of free ${noun} for today. Try again tomorrow.`, code: "limit" },
      { status: 429 }
    );
  }
  return null;
}
