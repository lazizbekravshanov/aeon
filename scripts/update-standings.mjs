// Refreshes league-tables/data.json with current standings.
// Primary source: ESPN's public standings feed (has ranks, GF/GA and crest URLs).
// Fallback + form source: openfootball/football.json (open data, tables computed
// here from match results — tiebreak approximated as pts, GD, GF).
// No dependencies; requires Node 18+.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data.json");

// European seasons start in August; before July we are still in last year's season.
const now = new Date();
const startYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const seasonLabel = `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
const ofSeason = `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;

const COMPS = {
  epl: { name: "Premier League", espn: "eng.1", of: `${ofSeason}/en.1.json` },
  liga: { name: "La Liga", espn: "esp.1", of: `${ofSeason}/es.1.json` },
  ucl: { name: "Champions League", espn: "uefa.champions", of: null },
};

const SHORT_NAMES = {
  "afc bournemouth": "Bournemouth",
  "brighton & hove albion": "Brighton",
  "brighton and hove albion": "Brighton",
  "coventry city": "Coventry",
  "crystal palace": "Crystal Palace",
  "hull city": "Hull City",
  "ipswich town": "Ipswich",
  "leeds united": "Leeds",
  "manchester city": "Man City",
  "manchester united": "Man United",
  "newcastle united": "Newcastle",
  "nottingham forest": "Nott'm Forest",
  "tottenham hotspur": "Tottenham",
  "west ham united": "West Ham",
  "wolverhampton wanderers": "Wolves",
  "ca osasuna": "Osasuna",
  "club atletico de madrid": "Atlético Madrid",
  "atletico madrid": "Atlético Madrid",
  "deportivo alaves": "Alavés",
  "fc barcelona": "Barcelona",
  "levante ud": "Levante",
  "malaga cf": "Málaga",
  "rc celta de vigo": "Celta Vigo",
  "celta vigo": "Celta Vigo",
  "rc deportivo la coruna": "Deportivo",
  "deportivo la coruna": "Deportivo",
  "rcd espanyol de barcelona": "Espanyol",
  "rayo vallecano de madrid": "Rayo Vallecano",
  "real betis balompie": "Real Betis",
  "real madrid cf": "Real Madrid",
  "real racing club de santander": "Racing Santander",
  "racing santander": "Racing Santander",
  "real sociedad de futbol": "Real Sociedad",
  "athletic club": "Athletic Club",
  "rcd mallorca": "Mallorca",
  "paris saint-germain": "PSG",
  "bayern munich": "Bayern Munich",
  "fc bayern munchen": "Bayern Munich",
  "borussia dortmund": "Dortmund",
  "bayer leverkusen": "Leverkusen",
  "internazionale": "Inter",
  "inter milan": "Inter",
  "sporting cp": "Sporting CP",
  "sl benfica": "Benfica",
  "fc porto": "Porto",
  "as monaco": "Monaco",
  "olympique marseille": "Marseille",
  "club brugge": "Club Brugge",
  "union saint-gilloise": "Union SG",
  "psv eindhoven": "PSV",
  "afc ajax": "Ajax",
  "eintracht frankfurt": "Frankfurt",
  "slavia prague": "Slavia Prague",
  "bodo/glimt": "Bodø/Glimt",
};

const strip = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,']/g, "")
    .trim();

const dropTokens = new Set(["fc", "afc", "cf", "cd", "ca", "ud", "rc", "rcd", "sc", "ac", "as", "sl", "club", "de", "the", "balompie"]);

function shortName(name) {
  const key = strip(name);
  if (SHORT_NAMES[key]) return SHORT_NAMES[key];
  const tokens = key.split(/\s+/).filter((t) => !dropTokens.has(t));
  const cleanedKey = tokens.join(" ");
  if (SHORT_NAMES[cleanedKey]) return SHORT_NAMES[cleanedKey];
  // Title-case what's left of the original name after dropping suffix tokens.
  const orig = name.replace(/[.,]/g, "").split(/\s+/);
  const kept = orig.filter((t) => !dropTokens.has(strip(t)));
  return kept.join(" ") || name;
}

// Loose matcher so ESPN and openfootball names can be joined (e.g. "Brighton &
// Hove Albion" vs "Brighton & Hove Albion FC").
function nameKey(name) {
  return strip(name)
    .replace(/&/g, "and")
    .split(/\s+/)
    .filter((t) => !dropTokens.has(t))
    .sort()
    .join(" ");
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { "user-agent": "league-tables-updater" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function computeFromOpenfootball(data) {
  const table = new Map();
  const t = (name) => {
    if (!table.has(name))
      table.set(name, { team: name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, results: [] });
    return table.get(name);
  };
  let matchday = 0;
  for (const m of data.matches ?? []) {
    // Seed every club from the fixture list so sides without a completed
    // match yet still appear in the table.
    if (m.team1) t(m.team1);
    if (m.team2) t(m.team2);
    const ft = m?.score?.ft;
    if (!Array.isArray(ft) || ft.length !== 2) continue;
    const [g1, g2] = ft;
    const a = t(m.team1);
    const b = t(m.team2);
    a.p++; b.p++;
    a.gf += g1; a.ga += g2;
    b.gf += g2; b.ga += g1;
    if (g1 > g2) { a.w++; b.l++; a.results.push([m.date, "W"]); b.results.push([m.date, "L"]); }
    else if (g1 < g2) { b.w++; a.l++; a.results.push([m.date, "L"]); b.results.push([m.date, "W"]); }
    else { a.d++; b.d++; a.results.push([m.date, "D"]); b.results.push([m.date, "D"]); }
    const md = parseInt(String(m.round ?? "").replace(/\D+/g, ""), 10);
    if (md > matchday) matchday = md;
  }
  const rows = [...table.values()].map((r) => ({
    ...r,
    gd: r.gf - r.ga,
    pts: r.w * 3 + r.d,
    form: r.results
      .sort((x, y) => String(x[0]).localeCompare(String(y[0])))
      .slice(-5)
      .map((x) => x[1])
      .join(""),
  }));
  rows.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team));
  return {
    matchday,
    rows: rows.map((r, i) => ({
      pos: i + 1,
      team: r.team,
      short: shortName(r.team),
      p: r.p, w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga, gd: r.gd, pts: r.pts,
      form: r.form,
      logo: null,
    })),
  };
}

function stat(entry, ...names) {
  for (const n of names) {
    const s = (entry.stats ?? []).find((st) => st.name === n || st.type === n);
    if (s && typeof s.value === "number") return s.value;
  }
  return null;
}

function parseESPN(json) {
  const children = json.children ?? [];
  let entries = children.flatMap((c) => c.standings?.entries ?? []);
  if (!entries.length) entries = json.standings?.entries ?? [];
  if (!entries.length) return null;
  const rows = entries.map((e) => {
    const gf = stat(e, "pointsFor");
    const ga = stat(e, "pointsAgainst");
    return {
      pos: stat(e, "rank"),
      team: e.team?.displayName ?? e.team?.name ?? "?",
      short: shortName(e.team?.shortDisplayName ?? e.team?.displayName ?? "?"),
      p: stat(e, "gamesPlayed"),
      w: stat(e, "wins"),
      d: stat(e, "ties"),
      l: stat(e, "losses"),
      gf, ga,
      gd: stat(e, "pointDifferential") ?? (gf != null && ga != null ? gf - ga : null),
      pts: stat(e, "points"),
      form: "",
      logo: e.team?.logos?.[0]?.href ?? null,
    };
  });
  rows.sort((x, y) => (x.pos ?? 99) - (y.pos ?? 99) || y.pts - x.pts || y.gd - x.gd);
  rows.forEach((r, i) => { if (r.pos == null) r.pos = i + 1; });
  const matchday = Math.max(0, ...rows.map((r) => r.p ?? 0));
  return { matchday, rows };
}

async function build() {
  const comps = {};
  for (const [key, cfg] of Object.entries(COMPS)) {
    let result = null;
    let source = null;

    try {
      const espn = await getJSON(
        `https://site.api.espn.com/apis/v2/sports/soccer/${cfg.espn}/standings?season=${startYear}`
      );
      result = parseESPN(espn);
      if (result) source = "espn";
    } catch (e) {
      console.error(`[${key}] espn failed: ${e.message}`);
    }

    let ofTable = null;
    if (cfg.of) {
      try {
        const of = await getJSON(
          `https://raw.githubusercontent.com/openfootball/football.json/master/${cfg.of}`
        );
        ofTable = computeFromOpenfootball(of);
      } catch (e) {
        console.error(`[${key}] openfootball failed: ${e.message}`);
      }
    }

    if (!result && ofTable && ofTable.rows.length) {
      result = ofTable;
      source = "openfootball";
    } else if (result && ofTable) {
      // ESPN standings don't carry recent form; borrow it from openfootball.
      const formByKey = new Map(ofTable.rows.map((r) => [nameKey(r.team), r.form]));
      for (const r of result.rows) r.form = formByKey.get(nameKey(r.team)) ?? r.form;
    }

    if (result && result.rows.some((r) => (r.p ?? 0) > 0)) {
      comps[key] = {
        name: cfg.name,
        source,
        matchday: result.matchday,
        rows: result.rows,
      };
    } else {
      comps[key] = { name: cfg.name, notStarted: true };
    }
    console.error(`[${key}] source=${comps[key].notStarted ? "none (not started)" : source} rows=${result?.rows?.length ?? 0}`);
  }

  const out = {
    generated: new Date().toISOString(),
    season: seasonLabel,
    comps,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.error(`wrote ${OUT}`);
}

await build();
