# BitButt Garage — handoff

A car-spotting and tuning app built for Charlie, who is a demanding tester and
has caught more real bugs than the test suite has. Read this before changing
anything; most of it is hard-won.

**Live:** https://bitbutt-garage.vercel.app
**Repo:** https://github.com/thefirstgeneralof-bitbutt/BitButtGarage

---

## Where things actually live

| Thing | Where |
|---|---|
| Source (`src/01_head.html` … `07_boot.js`) | A Claude cloud container. **Not on the Mac.** |
| Build scripts (`bundle.mjs`, `minify.mjs`), tests (`test.mjs`) | Same container |
| This repo clone on the Mac | A **read-only mirror**, except when a build is dropped in for pushing |
| Deployed site | Vercel, auto-building from GitHub `main` |

The single most common mistake: assuming the source is on the Mac. It is not.
The Mac clone holds only the built `index.html` and the `api/*.js` files.
`index.html` is minified output — never hand-edit it, the edit will be lost on
the next build.

## How a change reaches Charlie

Two routes. Both end at GitHub `main`; Vercel builds automatically.

1. **Web upload** — drag files into `github.com/.../upload/main` (root) and
   `.../upload/main/api`. Slow, manual, but needs no credentials.
2. **Push from the Mac clone** — files are written into the clone, then
   committed and pushed. Needs `gh auth login` once.

**Always verify the commit landed.** Twice a commit silently failed and work was
reported as deployed when it was not:

    curl -s https://raw.githubusercontent.com/thefirstgeneralof-bitbutt/BitButtGarage/main/api/specs.js | grep maxDuration

## Traps that have bitten

- **Stale clone.** `origin/main` sat three weeks out of date and the clone looked
  "2 ahead" when it was really 2 ahead / 4 behind. Always `git fetch` first.
  Never force-push from it.
- **Stale git locks.** Zero-byte `.git/index.lock` files appear repeatedly. The
  desktop bridge cannot delete files, only move them — hence `_to_delete/gitlocks/`.
- **Trailing-space folder.** There is a `Private Stuff ` (trailing space) beside
  `Private Stuff`. The repo is in the one **without** the space.
- **Per-origin storage.** Every car, photo and build lives in `localStorage` +
  IndexedDB, keyed to the exact web address. Moving to `garage.bitbutt.com` would
  strand everything saved at the `.vercel.app` address. Decide the domain before
  Charlie collects seriously.
- **No `vercel.json`.** Its absence is deliberate; an earlier one broke function
  detection. Set function limits with `export const maxDuration` instead.

## Data model, and the honesty rules

These exist because Charlie kept catching invented numbers. Do not weaken them.

- `null` means **nobody ever published this figure**. It is not zero. It renders
  as a dash with a NOT PUBLISHED badge, and no mod may change it. Six of eight
  cars have no published downforce figure; only Porsche and Lamborghini do.
- `est: ['grip']` lists figures that exist but are estimates — grey EST badge.
  Everything else gets a green tick and a source link.
- `topCap: { why, needs: [...] }` — a top speed held back by something that is
  not power (tyre rating, factory limiter). Adding boost must not move it. The
  Demon needs `ecu` + `tires`; the Supra needs `ecu`; the Chiron never lifts.
- `drivetrain: 'electric'` blocks engine mods. You cannot turbo a Tesla.
- Rules carry `max` (usually 1) so parts cannot be stacked infinitely.
- Empty spec boxes stay empty. The app must **never** invent a plausible number.

## Testing

`node test.mjs` runs 67 Playwright steps against `build-min/`. Run it against the
exact minified file that will ship, not the readable build. It has caught real
regressions every time it was run.

## Known-good figures

All eight cars were verified twice against manufacturer press kits and
instrumented tests. **They are US-market figures** — this is a known problem,
see below.

## Pending / open

- **US vs European figures.** The app shows Civic Type R as 315 hp (SAE); Europe
  publishes 329 PS for the same engine. Not a conversion — a different test
  standard. Agreed direction: show both, but only where the two published numbers
  are not convertible into each other. Not yet built.
- **Per-car AI chat.** Agreed: it answers and proposes corrections the user
  approves, searches the web when a question needs a fact, and appears both as a
  button on the car screen and its own tab. Needs a new `/api/chat`, structured
  proposals, and an overrides layer so the eight built-in cars can be corrected.
  Undecided: reply language, daily message cap, whether to stay strictly on cars.
- **Offline.** No service worker. The app needs a connection to load the first
  time on each device.
- **Two built-in cars** (Supra, Type R) have stale Wikimedia image links.

## Cost

Kimi K2.6, roughly $2–3/month at heavy use. The 18 built-in mod rules are matched
by pattern and cost nothing — only unusual mods and spec lookups reach the model.
Moonshot is prepaid with auto-recharge OFF, so the balance is the hard ceiling.


## 2026-09-19 — Wrench, verified overrides, $3/day cap, drag race, Learn (built, NOT yet deployed)

- `api/chat.js` — Wrench (Mechanik). Moonshot + `$web_search`, max 3 model hops, 900 output tokens,
  history trimmed to 8 turns. Returns `{text, lang, proposals[], learn, sources[], cost}`.
  `mode:'translate'` returns the same answer in the other language (no search).
  Cost estimate uses `AI_PRICE_IN / AI_PRICE_OUT / AI_PRICE_SEARCH` env vars (defaults 0.6 / 2.5 $ per M tokens, $0.01 per search).
- `_provider.js` gained `converse(messages, {search, maxTokens, maxHops})`.
- Client (`src/06b_wrench.js`): sheet from ASK WRENCH on the tune screen, full page on the WRENCH tab.
  One language per conversation (`bbg.lang`), locks on first clear question, two clear messages in the
  other language switch it; PL ⇄ EN per answer (translation fetched once, cached). Threads persist in
  `bbg.chat` (30 turns per car).
- Overrides (`bbg.ovr`): a proposal the kid APPROVEs becomes `{value, was, why, src, at}` for that car+stat.
  `statOf(car,key)` is the single read path (baseStats, cards, chat payload). Stat cell shows ✓ NAME
  (name from settings → owner, default Charlie). UNDO in "WHERE THESE NUMBERS COME FROM".
- Spend cap: per phone, `bbg.spend` `{day, usd, n}`, `SPEND_CAP = 3`. No server-side cap exists
  (no DB) — server limits per-request cost instead. Moonshot prepaid balance is the hard ceiling.
- Drag race in COMPARE when ≥2 builds are picked: real 0-60 times, rAF, re-queries DOM each frame,
  result kept in `UI.raceResult` so a re-render does not wipe it.
- Tabs: 7 now. ≤520px they switch to short labels (CARS / TUNE / VS / ⚒ / LEARN / ⚑ / ⚙).
- `static/learn.html` — BitButt Learn landing (look only). LEARN tab links to `/learn.html`.
- Tests: 80 steps, `BBG_ROOT=build-min node test.mjs` → ALL GREEN.
