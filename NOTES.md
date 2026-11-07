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

1. **Save and share between both phones.** One household record (fridge
   list, hidden/liked recipes, shopping list, household notes) on a small
   key-value store, unlocked with a shared passphrase. No accounts. Photos
   stay on the phone that took them.
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
