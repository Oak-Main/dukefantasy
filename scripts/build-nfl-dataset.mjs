/**
 * Builds the NFL dataset for DukeFantasy from ESPN's free public API.
 * Unlike CFBApex (build-time frozen), this runs at BUILD time but the
 * Worker fetches live scoreboard data at REQUEST time for real-time scores.
 *
 * Run: node scripts/build-nfl-dataset.mjs
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

/** Retrying fetch: a transient ESPN hiccup must not silently drop data from the
 * snapshot (the old per-day `catch {}` shipped a partial schedule unnoticed). */
async function fetchJson(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`${url}: ${lastError?.message ?? lastError}`);
}

/* ---- Eastern-time helpers -------------------------------------------------
 * ESPN serves kickoff instants in UTC. The site speaks Eastern: ESPN indexes a
 * game under its ET calendar day (an 8:20 PM ET Sunday kickoff is 00:20Z
 * Monday), and every consumer regex-extracts "h:mm AM|PM ET" from
 * kickoffLabel. Convert with the IANA zone so EDT/EST is always right. */
const ET_ZONE = "America/New_York";
const etClock = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const etLong = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  weekday: "short",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

function partsOf(formatter, iso) {
  return Object.fromEntries(formatter.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
}

function etFields(iso) {
  const p = partsOf(etClock, iso);
  return {
    weekday: p.weekday,
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`,
  };
}

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

/** ESPN's own pre-game detail format ("Sun, October 11th at 1:00 PM EDT"),
 * synthesized from the kickoff instant. Used for games that were already in
 * progress when the snapshot was compiled, so a baked "Halftime" can never
 * outlive the halftime. */
function scheduledDetail(iso) {
  const p = partsOf(etLong, iso);
  return `${p.weekday}, ${p.month} ${ordinal(Number(p.day))} at ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()} ${p.timeZoneName}`;
}

/** The watch board orders networks by exact (case-sensitive) name; ESPN has
 * flipped "FOX"/"Fox" between pulls, so pin the canonical spellings. */
const NETWORK_CANON = new Map([
  ["fox", "FOX"],
  ["cbs", "CBS"],
  ["nbc", "NBC"],
  ["abc", "ABC"],
  ["espn", "ESPN"],
  ["espn2", "ESPN2"],
]);
function normalizeNetwork(name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return null;
  return NETWORK_CANON.get(trimmed.toLowerCase()) ?? trimmed;
}

const parseScore = (value) => {
  if (value == null || value === "") return null;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
};

function teamSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replaceAll(" ", "-");
}

// ---------- Teams ----------
console.log("Fetching NFL teams...");
const teamsDoc = await fetchJson(`${ESPN}/teams?limit=40`);
const espnTeams = teamsDoc.sports[0].leagues[0].teams.map((t) => t.team);

const afc = ["buf", "mia", "ne", "nyj", "bal", "cin", "cle", "pit", "hou", "ind", "jax", "ten", "den", "kc", "lv", "lac"];
const divisions = {
  buf: "AFC East", mia: "AFC East", ne: "AFC East", nyj: "AFC East",
  bal: "AFC North", cin: "AFC North", cle: "AFC North", pit: "AFC North",
  hou: "AFC South", ind: "AFC South", jax: "AFC South", ten: "AFC South",
  den: "AFC West", kc: "AFC West", lv: "AFC West", lac: "AFC West",
  dal: "NFC East", nyg: "NFC East", phi: "NFC East", wsh: "NFC East",
  chi: "NFC North", det: "NFC North", gb: "NFC North", min: "NFC North",
  atl: "NFC South", car: "NFC South", no: "NFC South", tb: "NFC South",
  ari: "NFC West", lar: "NFC West", sf: "NFC West", sea: "NFC West",
};
const brandColors = {
  ari: "#97233F", atl: "#A71930", bal: "#241773", buf: "#00338D",
  car: "#0085CA", chi: "#0B162A", cin: "#FB4F14", cle: "#311D00",
  dal: "#041E42", den: "#FB4F14", det: "#0076B6", gb: "#203731",
  hou: "#03202F", ind: "#002C5F", jax: "#006778", kc: "#E31837",
  lac: "#0080C6", lar: "#003594", lv: "#000000", mia: "#008E97",
  min: "#4F2683", ne: "#002244", no: "#D3BC8D", nyg: "#0B2265",
  nyj: "#125740", phi: "#004C54", pit: "#FFB612", sf: "#AA0000",
  sea: "#002244", tb: "#D50A0A", ten: "#4B92DB", wsh: "#5A1414",
};

const teams = espnTeams.map((et) => {
  const slug = teamSlug(et.displayName);
  const abbr = et.abbreviation.toLowerCase();
  return {
    id: et.id,
    slug,
    name: et.displayName,
    shortName: et.displayName.split(" ").slice(0, -1).join(" ") || et.displayName,
    abbreviation: et.abbreviation,
    city: et.city ?? "",
    conference: afc.includes(abbr) ? "AFC" : "NFC",
    division: divisions[abbr] ?? "",
    color: brandColors[abbr] ?? "#4A90D9",
    logo: `/logos/${slug}.png`,
    record: "0-0",
  };
});

// ---------- Stadiums (ESPN venue facts; editorial fields stay empty until researched) ----------
const nowIso = new Date().toISOString();
const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams";
const stadiums = [];
for (const et of espnTeams) {
  try {
    const detail = await fetchJson(`${CORE}/${et.id}`);
    const venue = detail?.venue;
    if (!venue?.fullName) continue;
    stadiums.push({
      slug: teamSlug(et.displayName) + "-" + String(venue.fullName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      name: venue.fullName,
      teamId: teamSlug(et.displayName),
      city: [venue.address?.city, venue.address?.state].filter(Boolean).join(", "),
      address: [venue.address?.line1, venue.address?.city, venue.address?.state, venue.address?.zipCode]
        .filter(Boolean).join(", "),
      capacity: venue.seatingCapacity ?? venue.capacity ?? 0,
      parking: "",
      transit: "",
      clearBag: "",
      tailgating: "",
      visitorSection: "",
      accessibility: "",
      notes: "Venue name/location/capacity from ESPN NFL API. Gameday-visit details (parking, transit, bag policy) not yet published.",
      sources: [`${CORE}/${et.id}`],
      lastVerified: nowIso.slice(0, 10),
      provenance: {
        provider: "ESPN NFL API",
        providerRecordId: `espn:venue:${venue.id ?? et.id}`,
        sourceUrl: `${CORE}/${et.id}`,
        sourceAsOf: nowIso,
        fetchedAt: nowIso,
        verifiedAt: nowIso,
        verificationStatus: "single_source",
        licenseClass: "R3_CITED_FACTS",
        confidence: 0.9,
        dataEnvironment: "production",
        recordOrigin: "provider",
        freshness: "current",
      },
    });
  } catch (error) {
    console.warn(`  venue fetch failed for ${et.displayName} — skipped (${error.message})`);
  }
}
console.log(`  ${stadiums.length} stadiums (ESPN venue facts)`);

// ---------- Download logos ----------
console.log("Downloading 32 team logos...");
mkdirSync(join(root, "public", "logos"), { recursive: true });
for (const et of espnTeams) {
  const slug = teamSlug(et.displayName);
  const logoHref = et.logos?.find((l) => l.rel?.includes("full") || l.rel?.includes("default"))?.href ?? et.logos?.[0]?.href;
  if (!logoHref) continue;
  try {
    const res = await fetch(logoHref);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 1000) {
      writeFileSync(join(root, "public", "logos", `${slug}.png`), buf);
    }
  } catch { /* skip */ }
}
console.log("  logos saved to public/logos/");

// ---------- Full Season Schedule ----------
// Keyed by ESPN's own regular-season weeks (seasontype=2&week=N) rather than a
// hand-typed date window: the old Sep-10..Jan-5 UTC window silently dropped the
// Week 1 Wednesday opener and all of Week 18 (17 of 272 games), and ESPN's
// event.week.number replaces the date-bucket week heuristic.
console.log("Fetching full season schedule (ESPN week-keyed)...");
const GAMES_PER_TEAM = 17;
const seed = await fetchJson(`${ESPN}/scoreboard`);
const seasonYear = seed.season?.year ?? 2026;
const currentWeek = Number.isInteger(seed.week?.number) ? seed.week.number : null;
const regularSeason = seed.leagues?.[0]?.calendar?.find((c) => String(c.value) === "2");
const weekNumbers = (regularSeason?.entries ?? []).map((e) => Number(e.value)).filter(Number.isInteger);
if (weekNumbers.length === 0) throw new Error("ESPN calendar returned no regular-season weeks");

const weekDocs = await Promise.all(
  weekNumbers.map(async (week) => ({
    week,
    doc: await fetchJson(`${ESPN}/scoreboard?dates=${seasonYear}&seasontype=2&week=${week}&limit=100`),
  })),
);

const schedule = [];
for (const { week, doc } of weekDocs) {
  for (const ev of doc.events ?? []) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const away = comp.competitors?.find((c) => c.homeAway === "away");
    const home = comp.competitors?.find((c) => c.homeAway === "home");
    if (!away || !home) continue;

    const et = etFields(ev.date);
    const timeTbd = comp.timeValid === false; // unflexed slots carry a placeholder instant
    const type = ev.status?.type ?? {};
    const status =
      type.state === "in" ? "in_progress" : type.state === "post" && type.completed !== false ? "final" : "scheduled";

    schedule.push({
      id: ev.id,
      // ET calendar day — the day ESPN indexes the game under (SNF is Sunday, not Monday).
      date: et.date,
      week: Number.isInteger(ev.week?.number) ? ev.week.number : week,
      kickoffUtc: ev.date,
      timeTbd,
      kickoffLabel: timeTbd ? `${et.weekday} · ${et.date} · Time TBD (ET)` : `${et.weekday} · ${et.date} · ${et.time} ET`,
      awaySlug: teamSlug(away.team.displayName),
      homeSlug: teamSlug(home.team.displayName),
      awayAbbr: away.team.abbreviation,
      homeAbbr: home.team.abbreviation,
      status,
      // A game live at compile time must not freeze "Halftime"/"Q3" into a static page.
      statusDetail: status === "in_progress" ? scheduledDetail(ev.date) : (type.detail ?? "Scheduled"),
      // Scores are baked for finals only; live scores arrive through /api/nfl-scoreboard.
      awayScore: status === "final" ? parseScore(away.score) : null,
      homeScore: status === "final" ? parseScore(home.score) : null,
      broadcast: normalizeNetwork(comp.broadcasts?.[0]?.names?.[0]),
      venue: comp.venue?.fullName ?? "",
    });
  }
}
schedule.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.id.localeCompare(b.id));
console.log(`  ${schedule.length} games fetched across ${weekNumbers.length} weeks (ESPN current week: ${currentWeek ?? "n/a"})`);

// Fail closed on a partial schedule: a stale-but-complete deploy beats a fresh-but-truncated one.
{
  const problems = [];
  const expectedGames = (teams.length * GAMES_PER_TEAM) / 2;
  if (schedule.length !== expectedGames) problems.push(`expected ${expectedGames} regular-season games, got ${schedule.length}`);
  if (new Set(schedule.map((g) => g.id)).size !== schedule.length) problems.push("duplicate ESPN event ids");
  const perTeam = new Map();
  for (const g of schedule) for (const slug of [g.awaySlug, g.homeSlug]) perTeam.set(slug, (perTeam.get(slug) ?? 0) + 1);
  for (const t of teams) {
    const n = perTeam.get(t.slug) ?? 0;
    if (n !== GAMES_PER_TEAM) problems.push(`${t.slug}: ${n} games (expected ${GAMES_PER_TEAM})`);
  }
  for (const slug of perTeam.keys()) if (!teams.some((t) => t.slug === slug)) problems.push(`schedule references unknown team ${slug}`);
  if (problems.length) throw new Error(`Schedule integrity check failed:\n  - ${problems.join("\n  - ")}`);
}

// ---------- Standings ----------
const standings = {};
for (const t of teams) standings[t.slug] = { slug: t.slug, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 };
for (const g of schedule) {
  if (g.status !== "final" || g.awayScore == null || g.homeScore == null) continue;
  const a = standings[g.awaySlug], h = standings[g.homeSlug];
  if (!a || !h) continue;
  a.pf += g.awayScore; a.pa += g.homeScore;
  h.pf += g.homeScore; h.pa += g.awayScore;
  if (g.awayScore > g.homeScore) { a.wins++; h.losses++; }
  else if (g.homeScore > g.awayScore) { h.wins++; a.losses++; }
  else { a.ties++; h.ties++; }
}
for (const t of teams) {
  const s = standings[t.slug];
  if (s) {
    s.record = `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""}`;
    t.record = s.record;
  }
}

// ---------- ESPN injury base feed ----------
console.log("Fetching ESPN injury feed...");
const STATUS_MAP = { "Injured Reserve": "IR", "Out": "OUT", "Questionable": "QUESTIONABLE", "Doubtful": "DOUBTFUL", "Suspension": "SUSPENSION", "Active": "ACTIVE" };
const injuriesDoc = await fetchJson(`${ESPN}/injuries`).catch(() => ({ injuries: [] }));
const teamByEspnId = new Map(teams.map((t) => [t.id, t.slug]));
const espnInjuries = { asOf: null, entries: [] };
try {
  espnInjuries.asOf = injuriesDoc.timestamp ? injuriesDoc.timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10);
  for (const block of injuriesDoc.injuries ?? []) {
    const teamSlug = teamByEspnId.get(String(block.id)) ?? null;
    for (const row of block.injuries ?? []) {
      const status = STATUS_MAP[row.status] ?? "QUESTIONABLE";
      if (status === "ACTIVE") continue; // resolved players stay out of the base feed
      espnInjuries.entries.push({
        player: row.athlete?.displayName ?? "Unknown",
        team_slug: teamSlug,
        position: row.athlete?.position?.abbreviation ?? null,
        status,
        detail: row.shortComment ?? row.longComment ?? null,
        as_of: row.date ? row.date.slice(0, 10) : null,
      });
    }
  }
} catch (error) {
  console.warn(`ESPN injury feed unreadable — shipping empty base (${error.message})`);
}

// ---------- Editorial injury research (fail-closed) ----------
// data/injury-research/current.json is written by scripts/ingest-injury-research.mjs
// from the weekly research run. Absent file = nothing published.
const RESEARCH_PATH = join(root, "data", "injury-research", "current.json");
let injuryResearch = { week: null, as_of: null, ledger: [], watch: [] };
if (existsSync(RESEARCH_PATH)) {
  try {
    const raw = JSON.parse(readFileSync(RESEARCH_PATH, "utf8"));
    injuryResearch = {
      week: typeof raw.week === "number" ? raw.week : null,
      as_of: raw.as_of ?? null,
      ledger: Array.isArray(raw.ledger) ? raw.ledger : [],
      watch: Array.isArray(raw.watch) ? raw.watch : [],
    };
  } catch (error) {
    console.warn(`injury research present but unreadable — skipping (${error.message})`);
  }
} else {
  console.log("No injury research staged yet — editorial layer ships empty (fail-closed).");
}

// data/fantasy-desk/current.json is written by scripts/ingest-fantasy-desk.mjs
// from the weekly research runs (prompts 11-14). Absent file = nothing published.
const DESK_PATH = join(root, "data", "fantasy-desk", "current.json");
let fantasyDesk = { waiver: null, start_sit: null, rookie: null, trade: null };
if (existsSync(DESK_PATH)) {
  try {
    const raw = JSON.parse(readFileSync(DESK_PATH, "utf8"));
    fantasyDesk = {
      waiver: raw.waiver ?? null,
      start_sit: raw.start_sit ?? null,
      rookie: raw.rookie ?? null,
      trade: raw.trade ?? null,
    };
    const staged = Object.entries(fantasyDesk).filter(([, v]) => v).map(([k]) => k);
    console.log(`fantasy desk staged: ${staged.length ? staged.join(", ") : "nothing (fail-closed)"}`);
  } catch (error) {
    console.warn(`fantasy desk present but unreadable — skipping (${error.message})`);
  }
} else {
  console.log("No fantasy desk staged yet — editorial layer ships empty (fail-closed).");
}

// ---------- Write ----------
const payload = {
  season: { year: seasonYear, currentWeek, weeks: weekNumbers.length },
  teams,
  schedule,
  standings,
  stadiums,
  espnInjuries,
  injuryResearch,
  fantasyDesk,
  generatedAt: new Date().toISOString(),
};
const target = join(root, "lib", "nfl-generated.ts");
writeFileSync(target,
  `// GENERATED by scripts/build-nfl-dataset.mjs from ESPN's free NFL API\n` +
  `// Live scores fetch from the Worker at request time; this is the build-time snapshot.\n` +
  `// biome-ignore lint: generated file\n` +
  `export default ${JSON.stringify(payload)};\n`
);
console.log(`Wrote ${target}: ${teams.length} teams, ${schedule.length} games`);
