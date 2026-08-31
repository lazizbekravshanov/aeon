# Fulltime — League Tables

Single-page site with current standings for the Premier League, La Liga and the
UEFA Champions League, plus the full 2025/26 final tables as a switchable view.
Dark, dense, sports-app style UI. Vanilla HTML/CSS/JS — no build step.

## How the data stays fresh (no manual work)

1. **Scheduled GitHub Action** (`.github/workflows/league-tables-data.yml`)
   runs every 6 hours and executes `scripts/update-standings.mjs`, which pulls
   current standings — ESPN's public feed first (ranks, GF/GA, crest URLs),
   falling back to [openfootball](https://github.com/openfootball/football.json)
   open data (tables computed from match results) — and commits `data.json`
   when it changed.
2. **Runtime fetch**: the page loads the newest `data.json` straight from
   raw.githubusercontent.com at view time, so visitors see fresh data without a
   redeploy.
3. **In-browser fallback**: if the snapshot is older than 24 h (e.g. Actions
   disabled), the page fetches openfootball's raw JSON itself and recomputes
   the league tables client-side.

The season rolls over automatically each August — nothing to bump.

## Files

- `index.html` — the whole site
- `data.json` — latest standings snapshot (bot-committed)
- `scripts/update-standings.mjs` — the updater (Node 18+, zero dependencies)
- `vercel.json` — static deployment config

## Deploy

Any static host. For Vercel: `cd league-tables && vercel deploy --prod`.

## Notes

- European qualification zones are rendered as the standard allocation; cup
  winners and coefficient spots can shift the real allocation.
- 2025/26 final standings were compiled from public season reports (Yahoo
  Sports, NBC Sports, UEFA, club media) and are embedded in the page.
