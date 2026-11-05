/**
 * Weekly NFL edition refresh — the engine behind the Tuesday job.
 *
 * It publishes one dated edition of the schedule/results module:
 *   - ESPN's week-keyed scoreboard is the primary source (the repository's
 *     existing source for schedule, results, standings and network).
 *   - NFL.com's per-week schedule page and per-game box score are the second
 *     publisher, so every newly published game carries two publisher families.
 *
 * Nothing is published that is not corroborated, and nothing that was already
 * published is silently rewritten: the previous snapshot's games, standings
 * and teams are the baseline, and a published fact may only move forward.
 *
 * Usage:
 *   node scripts/refresh-weekly-edition.mjs --week=10 [--date=YYYY-MM-DD]
 *   node scripts/refresh-weekly-edition.mjs --week=10 --dry-run
 *
 * The script writes data/content-refresh/<date>/ and repoints the manifest.
 * It never merges, never deploys and never touches editorial prose: dated desk notes are selected separately from the schedule.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchNflGame, fetchNflWeek } from "./nfl-week-source.mjs";
import { publicationWindow, resolveBroadcast, selectSlate } from "./weekly-slate.mjs";
import { materializeVerifiedSnapshot } from "./verified-snapshot.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => JSON.parse(readFileSync(join(root, file), "utf8"));
/** The repository stores JSON with non-ASCII escaped, so a rewrite leaves
 *  untouched strings byte-identical instead of re-encoding them. */
let outputRoot = root;
const write = (file, value) => {
  const path = join(outputRoot, file);
  mkdirSync(dirname(path), { recursive: true });
  const json = JSON.stringify(value, null, 2).replace(
    new RegExp("[\\u0080-\\uffff]", "g"),
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  writeFileSync(path, `${json}\n`);
};

const writeText = (file, text) => {
  const path = join(outputRoot, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const hit = argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const dryRun = argv.includes("--dry-run");

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const STANDINGS_URL = "https://site.web.api.espn.com/apis/v2/sports/football/nfl/standings?season=2026&level=3";
const ET_ZONE = "America/New_York";
const PT_ZONE = "America/Los_Angeles";

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
const ptLong = new Intl.DateTimeFormat("en-US", {
  timeZone: PT_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const partsOf = (formatter, iso) =>
  Object.fromEntries(formatter.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

function etFields(iso) {
  const p = partsOf(etClock, iso);
  return {
    weekday: p.weekday,
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`,
  };
}

/** ESPN's own pre-game detail format, so a live game never freezes a phase. */
function scheduledDetail(iso) {
  const p = partsOf(etLong, iso);
  return `${p.weekday}, ${p.month} ${ordinal(Number(p.day))} at ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()} ${p.timeZoneName}`;
}

/** The site's own Eastern and Pacific labels for a kickoff instant. */
function clockLabels(iso) {
  const et = partsOf(etLong, iso);
  const pt = partsOf(ptLong, iso);
  return {
    et: `${et.weekday}, ${et.month} ${Number(et.day)}, ${et.hour}:${et.minute} ${String(et.dayPeriod).toUpperCase()} ET`,
    pt: `${pt.weekday}, ${pt.month} ${Number(pt.day)}, ${pt.hour}:${pt.minute} ${String(pt.dayPeriod).toUpperCase()} PT`,
  };
}

const NETWORK_CANON = new Map([
  ["fox", "FOX"],
  ["cbs", "CBS"],
  ["nbc", "NBC"],
  ["abc", "ABC"],
  ["espn", "ESPN"],
  ["espn2", "ESPN2"],
  ["nfl net", "NFL Network"],
  ["nfl network", "NFL Network"],
  ["nfl network spanish", "NFL Network"],
  ["prime video", "Prime Video"],
]);
function normalizeNetwork(name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return null;
  return NETWORK_CANON.get(trimmed.toLowerCase()) ?? trimmed;
}
const parseScore = (value) => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
};
const teamSlug = (name) =>
  String(name).toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replaceAll(" ", "-");

async function fetchJson(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return { document: JSON.parse(text), raw: text, checkedAt: new Date().toISOString() };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`${url}: ${lastError?.message ?? lastError}`);
}

/* ------------------------------------------------------------------ inputs */

const manifest = read("data/content-refresh/current.json");
const previousSnapshot = read(`data/content-refresh/${manifest.snapshot}`);
const editorial = read("data/content-refresh/current-editorial.json");
const injury = read("data/injury-research/current.json");

const broadcastReviews = read("data/content-refresh/broadcast-reviews.json");
const broadcastEvidence = read("data/content-refresh/broadcast-evidence.json");
const requestedWeekArg = arg("week", null);
const requestedWeek =
  requestedWeekArg == null || requestedWeekArg === "" ? null : Number(requestedWeekArg);
const seasonYear = previousSnapshot.season.year ?? 2026;
const totalWeeks = previousSnapshot.season.weeks ?? 18;
const { day: releaseDate, ended } = publicationWindow(arg("date"));
if (ended) {
  console.log("Regular-season refresh window closed; nothing to propose.");
  process.exit(0);
}
if (requestedWeek != null && (!/^\d+$/.test(requestedWeekArg) || requestedWeek < 1 || requestedWeek > totalWeeks)) {
  throw new Error(`--week must be an official week between 1 and ${totalWeeks}`);
}
if (releaseDate < manifest.sourceAsOf) throw new Error("Cannot replace a newer edition");
if (!dryRun && existsSync(join(root, "data/content-refresh", releaseDate))) {
  if (releaseDate !== manifest.sourceAsOf || (requestedWeek != null && requestedWeek !== editorial.week)) {
    throw new Error("The dated edition already exists; review it before making corrections");
  }
  console.log("This date already has an edition; nothing to propose.");
  process.exit(0);
}

/* ------------------------------------------------------- primary: ESPN */

console.log("Fetching ESPN week-keyed scoreboard...");
const seed = await fetchJson(`${ESPN}/scoreboard`);
const espnCurrentWeek = Number.isInteger(seed.document.week?.number) ? seed.document.week.number : null;
const regularSeason = seed.document.leagues?.[0]?.calendar?.find((c) => String(c.value) === "2");
const weekNumbers = (regularSeason?.entries ?? []).map((e) => Number(e.value)).filter(Number.isInteger);
if (weekNumbers.length !== totalWeeks) {
  throw new Error(`ESPN calendar returned ${weekNumbers.length} regular-season weeks, expected ${totalWeeks}`);
}

const espnWeeks = [];
for (const week of weekNumbers) {
  const url = `${ESPN}/scoreboard?dates=${seasonYear}&seasontype=2&week=${week}&limit=100`;
  espnWeeks.push({ week, url, ...await fetchJson(url) });
}
const standingsDoc = await fetchJson(STANDINGS_URL);
console.log(`  ${espnWeeks.length} weeks from ESPN (current week ${espnCurrentWeek}).`);
const espnGames = [];
for (const { week, document } of espnWeeks) {
  for (const ev of document.events ?? []) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const away = comp.competitors?.find((c) => c.homeAway === "away");
    const home = comp.competitors?.find((c) => c.homeAway === "home");
    if (!away || !home) continue;
    const et = etFields(ev.date);
    const timeTbd = comp.timeValid === false;
    const type = ev.status?.type ?? {};
    const status =
      type.state === "in" ? "in_progress" : type.state === "post" && type.completed !== false ? "final" : "scheduled";
    espnGames.push({
      id: ev.id,
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
      statusDetail: status === "in_progress" ? scheduledDetail(ev.date) : type.detail ?? "Scheduled",
      awayScore: status === "final" ? parseScore(away.score) : null,
      homeScore: status === "final" ? parseScore(home.score) : null,
      broadcast: normalizeNetwork(comp.broadcasts?.[0]?.names?.[0]),
      venue: comp.venue?.fullName ?? "",
      networks: (comp.broadcasts ?? []).flatMap((b) => b.names ?? []).map(normalizeNetwork).filter(Boolean),
      city: comp.venue?.address?.city ?? "",
      country: comp.venue?.address?.country ?? "",
      neutral_site: comp.neutralSite === true,
      indoor_provider_value: typeof comp.venue?.indoor === "boolean" ? comp.venue.indoor : null,
    });
  }
}
espnGames.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.id.localeCompare(b.id));
if (espnGames.length !== (previousSnapshot.teams.length * 17) / 2) {
  throw new Error(`Expected ${(previousSnapshot.teams.length * 17) / 2} regular-season games, got ${espnGames.length}`);
}
if (new Set(espnGames.map((g) => g.id)).size !== espnGames.length) throw new Error("Duplicate ESPN event ids");

const { weekInPlay: dataWeek, completedWeek, editionWeek } =
  selectSlate(espnGames, totalWeeks, editorial.week, requestedWeek);
// The weeks this edition publishes: the week that just finished and the two
// weeks the edition covers. Anything earlier was published before and stays.
const published = new Set([editionWeek - 2, editionWeek - 1, editionWeek].filter(week => week >= 1));
for (const prior of previousSnapshot.schedule) {
  if (prior.week < editionWeek - 2 && prior.status !== "final" && espnGames.find(game => game.id === prior.id)?.status === "final") published.add(prior.week);
}
const publishedWeeks = [...published].sort((a,b) => a - b);
console.log(
  `Edition week ${editionWeek}; week in play ${dataWeek}; publishing weeks ${publishedWeeks.join(", ")} as of ${releaseDate}.`,
);

/* ------------------------------------------------ second publisher: NFL.com */

console.log("Fetching NFL.com week pages...");
const nflWeeks = [];
for (const week of publishedWeeks) {
  const doc = await fetchNflWeek({ year: seasonYear, week });
  nflWeeks.push(doc);
  console.log(`  week ${week}: ${doc.games.length} games, ${doc.url}`);
}

const nflByGameId = new Map();
for (const doc of nflWeeks) {
  for (const game of doc.games) {
    // NFL.com's schedule slug is the official identity for the pairing.
    const match = espnGames.find(
      (candidate) =>
        candidate.awaySlug === game.awaySlug && candidate.homeSlug === game.homeSlug && candidate.week === game.week,
    );
    if (match) {
      nflByGameId.set(match.id, {
        ...game,
        weekUrl: doc.url,
        checkedAt: doc.checkedAt,
        rawSha256: doc.rawSha256,
      });
    }
  }
}

const schedule = [];
const evidenceGames = {};
const problems = [];
const discrepancies = [];
const sourceLedger = [];

const recordSource = (name, url, checkedAt, sha256, bytes, status = 200) => {
  sourceLedger.push({ name, url, checkedAt, status, bytes, sha256 });
};

for (const { week, url, checkedAt, raw } of espnWeeks) {
  recordSource(
    `espn-week-${week}`,
    url,
    checkedAt,
    createHash("sha256").update(raw).digest("hex"),
    raw.length,
  );
}
recordSource(
  "espn-standings",
  STANDINGS_URL,
  standingsDoc.checkedAt,
  createHash("sha256").update(standingsDoc.raw).digest("hex"),
  standingsDoc.raw.length,
);
for (const doc of nflWeeks) {
  recordSource(
    `nfl-week-${doc.games[0]?.week ?? "?"}`,
    doc.url,
    doc.checkedAt,
    doc.rawSha256,
    null,
  );
}

for (const game of espnGames) {
  const published = publishedWeeks.includes(game.week);
  const nfl = nflByGameId.get(game.id);
  const espnUrl = `${ESPN}/scoreboard?dates=${seasonYear}&seasontype=2&week=${game.week}&limit=100`;

  if (!published) {
    // Already published in an earlier edition: keep the published record.
    const prior = previousSnapshot.schedule.find((row) => row.id === game.id);
    if (!prior) throw new Error(`Published week ${game.week} has no previous record for ${game.id}`);
    schedule.push(prior);
    continue;
  }

  if (!nfl) {
    problems.push(`${game.id}: NFL.com has no counterpart for ${game.awaySlug} at ${game.homeSlug} (week ${game.week})`);
    schedule.push(game);
    continue;
  }

  // Two publishers must agree on the material facts of a published game.
  if (nfl.date !== game.date) problems.push(`${game.id}: Eastern date disagrees (ESPN ${game.date}, NFL.com ${nfl.date})`);
  if (new Date(nfl.kickoffUtc).getTime() !== new Date(game.kickoffUtc).getTime()) {
    problems.push(`${game.id}: kickoff disagrees (ESPN ${game.kickoffUtc}, NFL.com ${nfl.kickoffUtc})`);
  }
  const nflNetworks = [...new Set(nfl.networks.map(normalizeNetwork).filter(Boolean))];
  const tv = resolveBroadcast(game, nflNetworks, broadcastReviews[game.id]);
  const sourceConflicts = tv.conflict ? [tv.conflict] : [];
  if (tv.conflict?.review) {
    for (const receipt of broadcastEvidence.filter(row => row.id === game.id)) {
      recordSource(`broadcast-${game.id}-${receipt.field}`, receipt.url, receipt.checkedAt, receipt.sha256, receipt.bytes);
    }
  }
  if (tv.conflict) discrepancies.push({ eventId: game.id, week: game.week, ...tv.conflict, published: tv.broadcast });
  const sources = [nfl.weekUrl, espnUrl];
  const verifiedFields = ["opponents", "date", "kickoff"];
  if (tv.broadcast) verifiedFields.push("primary_network");
  if (nfl.status && (game.status === "final") !== (nfl.status === "final")) problems.push(`${game.id}: final status disagrees`);
  if (game.status === "final" && (!nfl.slug || !Number.isInteger(game.awayScore) || !Number.isInteger(game.homeScore))) {
    problems.push(`${game.id}: final lacks scores or official game identity`);
  }

  if (game.status === "final" && nfl.slug) {
    // A completed game is corroborated on its own NFL.com box score.
    const box = await fetchNflGame({ slug: nfl.slug, away: nfl.away, home: nfl.home });
    sources.unshift(box.url);
    recordSource(`game-${game.id}`, box.url, box.checkedAt, box.rawSha256, box.bytes);
    if (nfl.status !== "final" && !box.postGame) problems.push(`${game.id}: NFL has no final designation`);
    if ((!box.totalRow && box.quarters < 4) || box.awayScore !== game.awayScore || box.homeScore !== game.homeScore) {
      problems.push(`${game.id}: final score disagrees (ESPN ${game.awayScore}-${game.homeScore}, NFL.com ${box.awayScore}-${box.homeScore})`);
    }
    verifiedFields.push("final_status", "away_score", "home_score");
  }

  const clocks = clockLabels(game.kickoffUtc);
  const espnReceipt = sourceLedger.find(row => row.url === espnUrl);
  const recorded = {
    ...game,
    broadcast: tv.broadcast,
    networks: tv.networks,
    neutral_site: game.neutral_site,
    city: game.city,
    country: game.country,
    evidenceDocument: `data/content-refresh/${releaseDate}/review.json#gameEvidence/${game.id}`,
    kickoff_et: clocks.et,
    kickoff_pt: clocks.pt,
    sources,
    source_retrieved_at: nfl.checkedAt,
    verification: "two_publishers",
    verified_fields: verifiedFields,
    ...(sourceConflicts.length ? { source_conflicts: sourceConflicts } : {}),
    weather: null,
  };
  schedule.push(recorded);
  evidenceGames[game.id] = {
    eventId: game.id,
    officialWeek: game.week,
    away: game.awaySlug,
    home: game.homeSlug,
    kickoffUtc: game.kickoffUtc,
    primaryUSNetwork: tv.broadcast,
    networks: tv.networks,
    status: game.status,
    awayScore: game.awayScore,
    homeScore: game.homeScore,
    verifiedFields,
    ...(sourceConflicts.length ? { sourceConflicts } : {}),
    sources: [
      { url: espnUrl, checkedAt: espnReceipt.checkedAt, rawSha256: espnReceipt.sha256, record: game.id },
      { url: nfl.weekUrl, checkedAt: nfl.checkedAt, rawSha256: nfl.rawSha256, record: nfl.slug ?? `${game.awaySlug} at ${game.homeSlug}` },
    ],
  };
}
if (problems.length) {
  console.error("Two-publisher disagreement, nothing published:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
schedule.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.id.localeCompare(b.id));

/* --------------------------------------------------------- standings */

const standings = {};
for (const team of previousSnapshot.teams) standings[team.slug] = { slug: team.slug, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 };
for (const game of schedule) {
  if (game.status !== "final" || game.awayScore == null || game.homeScore == null) continue;
  const away = standings[game.awaySlug];
  const home = standings[game.homeSlug];
  if (!away || !home) continue;
  away.pf += game.awayScore;
  away.pa += game.homeScore;
  home.pf += game.homeScore;
  home.pa += game.awayScore;
  if (game.awayScore > game.homeScore) {
    away.wins += 1;
    home.losses += 1;
  } else if (game.homeScore > game.awayScore) {
    home.wins += 1;
    away.losses += 1;
  } else {
    away.ties += 1;
    home.ties += 1;
  }
}
const teams = previousSnapshot.teams.map((team) => {
  const row = standings[team.slug];
  const record = `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`;
  return { ...team, record };
});
for (const team of teams) {
  const row = standings[team.slug];
  row.record = team.record;
}

const finals = schedule.filter((game) => game.status === "final");
const finalsByWeek = {};
for (const game of finals) finalsByWeek[game.week] = (finalsByWeek[game.week] ?? 0) + 1;
console.log(`  ${finals.length} finals; completed weeks ${Object.keys(finalsByWeek).map(Number).sort((a, b) => a - b).join(", ")}.`);

/* --------------------------------------------------------------- byes */

const playing = new Set(
  schedule.filter((game) => game.week === editionWeek).flatMap((game) => [game.awaySlug, game.homeSlug]),
);
const byes = previousSnapshot.teams.map((team) => team.slug).filter((slug) => !playing.has(slug)).sort();
if (playing.size + byes.length !== 32) throw new Error(`Week ${editionWeek} does not partition 32 teams`);

/* ------------------------------------------------------- write the edition */

const retrievedAt = new Date().toISOString();
const snapshot = {
  season: { year: seasonYear, currentWeek: dataWeek, weeks: totalWeeks },
  teams,
  schedule,
  standings,
  stadiums: previousSnapshot.stadiums,
  espnInjuries: previousSnapshot.espnInjuries,
  generatedAt: retrievedAt,
  sourceAsOf: releaseDate,
  fetchedAt: retrievedAt,
  verification: `Schedule, results and standings refreshed from ESPN and NFL.com at ${retrievedAt}. ${finals.length} season finals, ${finalsByWeek[completedWeek] ?? 0} Week ${completedWeek} finals and Week ${editionWeek} fixtures carried two publisher families.`,
  compiledAt: retrievedAt,
  collectedOn: releaseDate,
};

const review = {
  version: 1,
  week: editionWeek,
  cutoffUtc: retrievedAt,
  compiledAt: retrievedAt,
  retrievedAt,
  sourceAsOf: releaseDate,
  completedWeek,
  baseline: {
    snapshot: manifest.snapshot,
    week: editorial.week,
    sourceAsOf: manifest.sourceAsOf,
    finalsDigest: createHash("sha256")
      .update(
        JSON.stringify(
          previousSnapshot.schedule
            .filter((game) => game.status === "final")
            .map((game) => [game.id, game.week, game.awayScore, game.homeScore, game.status]),
        ),
      )
      .digest("hex"),
  },
  expected: { games: schedule.length, teams: teams.length, weeks: totalWeeks },
  totals: {
    finals: finals.length,
    finalsByWeek,
    weekFinals: finalsByWeek[completedWeek] ?? 0,
    publishedWeeks,
    byes,
  },
  sources: sourceLedger,
  sourceDiscrepancies: discrepancies,
  gameEvidence: evidenceGames,
  digestScope: "schedule/results/standings",
};

const espnVerification = {
  version: 1,
  cutoffUtc: retrievedAt,
  compiledAt: retrievedAt,
  responses: [
    ...espnWeeks.map(({ url, document, raw, checkedAt }) => ({
      url,
      checkedAt,
      documentSha256: createHash("sha256").update(JSON.stringify(document)).digest("hex"),
      rawSha256: createHash("sha256").update(raw).digest("hex"),
      document,
    })),
    {
      url: STANDINGS_URL,
      checkedAt: standingsDoc.checkedAt,
      documentSha256: createHash("sha256").update(JSON.stringify(standingsDoc.document)).digest("hex"),
      rawSha256: createHash("sha256").update(standingsDoc.raw).digest("hex"),
      document: standingsDoc.document,
    },
  ],
};

const nextEditorial = {
  ...editorial,
  week: editionWeek,
  asOf: releaseDate,
  compiledAt: retrievedAt,
  byes,
  moduleSources: {
    ...editorial.moduleSources,
    schedule: { sourceAsOf: releaseDate, fetchedAt: retrievedAt, compiledAt: retrievedAt },
  },
};

const nextManifest = {
  version: manifest.version ?? 1,
  sourceAsOf: releaseDate,
  fetchedAt: retrievedAt,
  snapshot: `${releaseDate}/snapshot.json`,
  compiledAt: retrievedAt,
  collectedOn: releaseDate,
  cutoffUtc: retrievedAt,
  sourceCutoffs: {
    ...(manifest.sourceCutoffs ?? {}),
    coreDatasetUtc: retrievedAt,
    completeInjuryReviewDate: injury.as_of,
  },
};

// Source retrieval times change every run. Compare the facts delivered to readers
// before opening another draft for an unchanged regular-season slate.
const facts = rows => rows.map(g => [g.id, g.week, g.kickoffUtc, g.timeTbd, g.awaySlug, g.homeSlug,
  g.status, g.statusDetail, g.awayScore, g.homeScore, g.broadcast, g.venue, g.neutral_site, g.city, g.country,
  g.indoor_provider_value, g.networks, g.verified_fields, g.source_conflicts, g.sources]);
if (!dryRun && editorial.week === editionWeek && previousSnapshot.season.currentWeek === dataWeek &&
    JSON.stringify(facts(previousSnapshot.schedule)) === JSON.stringify(facts(schedule))) {
  console.log("Schedule, scores and coverage are unchanged; nothing to propose.");
  process.exit(0);
}

if (dryRun) {
  console.log("Dry run. Nothing written.");
  console.log(JSON.stringify({ finals: finals.length, byes, publishedWeeks, editionWeek }, null, 2));
  process.exit(0);
}

outputRoot = mkdtempSync(join(root, ".nfl-edition-"));
try {
  for (const file of ["data/injury-research/current.json", "data/fantasy-desk/current.json"]) {
    mkdirSync(dirname(join(outputRoot, file)), { recursive: true });
    copyFileSync(join(root, file), join(outputRoot, file));
  }
  mkdirSync(join(outputRoot, "lib"));
  write(`data/content-refresh/${releaseDate}/snapshot.json`, snapshot);
  write(`data/content-refresh/${releaseDate}/review.json`, review);
  write(`data/content-refresh/${releaseDate}/espn-verification.json`, espnVerification);
  write("data/content-refresh/current-editorial.json", nextEditorial);
  write("data/content-refresh/current.json", nextManifest);

  // The pull-request body carries the source URL and the UTC retrieval time for
  // every source the edition read, so a reviewer can re-check each number.
  const sourceRows = sourceLedger
    .map((source) => `| ${source.name} | ${source.url} | ${source.checkedAt} | \`${source.sha256.slice(0, 16)}\` |`)
    .join("\n");
  const discrepancyRows = discrepancies.length
    ? discrepancies
        .map((row) => `| ${row.eventId} | ${row.field} | ${row.espn ?? "—"} | ${row.nflCom ?? "—"} | ${row.published ?? "—"} |`)
        .join("\n")
    : "| — | — | — | — | — |";
  const prBody = `## NFL Week ${editionWeek} edition (${releaseDate})

  Refreshed schedule, results and standings for the ${seasonYear} NFL season. This is a draft: it does not merge and does not deploy.

  - Week published: **${editionWeek}** (official ESPN week numbering; Week ${editionWeek} begins ${schedule.filter((game) => game.week === editionWeek).map((game) => game.date).sort()[0] ?? "n/a"})
  - Weeks published by this edition: ${publishedWeeks.join(", ")}
  - Season finals now published: ${finals.length}
  - Week ${completedWeek} finals backfilled: ${finalsByWeek[completedWeek] ?? 0}
  - Byes in Week ${editionWeek}: ${byes.join(", ")}

  ### Sources read (URL and UTC retrieval time)

| Source | URL | Retrieved (UTC) | SHA-256 (first 16 hex characters) |
| --- | --- | --- | --- |
${sourceRows}

  ### Source disagreements recorded

| Event | Field | ESPN | NFL.com | Published |
| --- | --- | --- | --- | --- |
${discrepancyRows}

  Review the dated desk notes and scoped injury coverage before publication.
  `;
  writeText(`data/content-refresh/${releaseDate}/pr-body.md`, prBody);

  materializeVerifiedSnapshot(outputRoot);
  const paths = [`data/content-refresh/${releaseDate}`, "data/content-refresh/current-editorial.json", "lib/nfl-generated.ts", "data/content-refresh/current.json"];
  const backups = new Map();
  try {
    for (const file of paths) {
      const destination = join(root, file);
      // The new immutable date has no previous value. Back up existing pointers
      // so a failed filesystem operation can restore the complete prior edition.
      const backup = join(outputRoot, "backup-" + backups.size);
      if (existsSync(destination)) copyFileSync(destination, backup);
      renameSync(join(outputRoot, file), destination);
      backups.set(destination, existsSync(backup) ? backup : null);
    }
  } catch (error) {
    for (const [destination, backup] of [...backups].reverse()) {
      if (backup) renameSync(backup, destination);
      else rmSync(destination, { recursive: true, force: true });
    }
    throw error;
  }
} finally { rmSync(outputRoot, { recursive: true, force: true }); }
console.log(`Edition ${releaseDate} published: Week ${editionWeek}, ${finals.length} finals, ${schedule.length} games.`);
