# Wjaffle notes

Open items, most important first. Delete each one once it's done.

Last updated 2026-11-06.

## Check next time

- **Run one real scan on a phone.** Nothing below has been seen with real
  results yet:
  - "Ready to make" / "Need a few things" groups and the recipe cards
  - "+ List" toggles and the shopping list (Copy, and Share where the
    browser has it)
  - photo shrinking: full-size iPhone photos should now go through on the
    live site
  - Haiku 5.5 ingredient lists. A text-only test passed; check that photo
    results are as good as Haiku 4.5's were.
  - The photo-by-photo flow: each tile should go "Scanning…" → "+N found",
    and a second photo of the same shelf should mostly say "Nothing new"
    (Claude is sent the running list and told to reuse its names).
  - Duplicates: "Eggs" and "egg" should never both appear.
- On the local-network dev address (http, not https), Share doesn't show up
  and Copy uses a fallback. Test those on the live site.

## To do

- **Design** — sketch before deciding what's next. Ideas still open:
  a hard offset outline or a slight tilt on the recipe cards (both are
  card traits from other Wjerk designs); a shorter intro sentence.

## Housekeeping

- **Design-kit repo** (`~/Code/color-system-and-guidelines`): today's
  Wjaffle entries in NOTES.md are uncommitted, alongside earlier uncommitted
  edits there. Open question in it: should "pink on a mid-gray ground gets a
  dark outline" become a rule in RULES.md?
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
