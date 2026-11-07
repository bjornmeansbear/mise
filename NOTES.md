# Wjaffle notes

Open items, most important first. Delete each one once it's done.

Last updated 2026-11-06.

## Check next time

- **Try the three-view layout on a phone** (Fridge · Recipes · List tabs in
  the bottom dock, photos folded into one row). Only tested in a desktop
  browser at phone size, with fake scan results.
- On the local-network dev address (http, not https), Share doesn't show up
  and Copy uses a fallback. Test those on the live site.

## To do

Direction (2026-11-06): build it for the household (Kristian and his wife),
not for everyone. Next steps, in order:

1. **Sharing between phones: built 2026-11-07, not switched on yet.**
   To switch it on:
   - Vercel dashboard → the `mise` project → Storage → add **Upstash Redis**
     (free plan), connected to Production. It adds its own env vars.
   - Vercel → Settings → Environment Variables → add `HOUSEHOLD_CODE` with
     the value from `.env.local`. Redeploy.
   - Open `https://<site>/?h=<code>` once on each phone. The phone keeps the
     code and the address bar drops it.
   - Set a monthly spending limit in the Anthropic console as a backstop.
   How it works: `app/lib/server/access.ts` (who's asking, guest
   allowance), `app/api/household/route.ts` (load/save), guest numbers in
   `app/lib/limits.ts` (5 scans + 3 searches per guest a day; 30 scans and 20
   searches a day across all guests). Without Upstash on the live site,
   guests are refused and the household still works, just unshared.
   Tested locally against a stand-in for Upstash, not the real one.
   To change the code later: change it in Vercel and `.env.local`, redeploy,
   open the new link on both phones.
2. **"Not for us"** on each recipe card, so hidden recipes stay hidden after
   new searches. Ask Spoonacular for ~20 results so enough remain.
3. **Meal-type chips** (Dinner · Brunch · Sweet · Under 30 min): switch to
   Spoonacular's complexSearch, which takes `type` and `maxReadyTime`.
4. **Household page + kid tags**: who eats, what the kids won't touch; Haiku
   sorts or tags recipes against it.

Assumptions in the app to revisit: the fridge is re-scanned every time
(it could be a running list instead); quantities don't matter; nothing is
about to go bad; Spoonacular is the only recipe source; the shopping list
lives in the app rather than a list you already share.

- **Design** — sketch before deciding what's next. Ideas still open:
  a hard offset outline or a slight tilt on the recipe cards (both are
  card traits from other Wjerk designs); a shorter intro sentence.

## Housekeeping

- **Design-kit repo** (`~/Code/color-system-and-guidelines`): today's
  Wjaffle entries in NOTES.md and the focus-ring line in RULES.md are
  uncommitted, alongside earlier uncommitted edits there. (The "pink on a
  mid-gray ground" question no longer applies here: the gray dock is gone.)
- **Names.** The folder and package are still `fridgechef`; the GitHub repo
  and Vercel project are still `mise` (mise-ivory.vercel.app). Renaming the
  GitHub repo means updating the git remote.
- **Stray `~/package-lock.json`** (88 bytes, owned by root, from 2026-10-03).
  Next.js warns about it on every build. Safe to delete; needs `sudo`.
- **README.md** is still the Next.js starter text.
- **Ingredient parsing** reads the JSON array out of Claude's reply with a
  regex. Structured outputs would make it guaranteed instead of likely.
- **Cloudflare / SvelteKit**: only if you want it on the usual stack later.
  Vercel works fine for now.
