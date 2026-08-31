# Fulltime — 25/26 Final Tables

Single-page infographic of the final 2025/26 standings for the Premier League,
La Liga and the UEFA Champions League (league phase).

- `index.html` — the whole site: vanilla HTML/CSS/JS, no build step, no dependencies
  beyond Google Fonts.
- `vercel.json` — static deployment config for Vercel.

Data was compiled on 31 Aug 2026 from public season reports (Yahoo Sports,
NBC Sports, UEFA, club media). Tables show final position and points;
ties on points are ordered by the competition's tiebreak rules.

## Deploy

Any static host works. For Vercel:

```sh
cd league-tables && vercel deploy --prod
```
