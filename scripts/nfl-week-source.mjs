/**
 * NFL.com week pages — the second publisher for the weekly edition.
 *
 * https://www.nfl.com/schedules/<year>/by-week/week-<n> is rendered per week
 * on the server, so one fetch covers a single NFL week. The embedded payload
 * carries the official week, the kickoff instant, the national television
 * network, the venue and, for a completed week, the final score. ESPN remains
 * the primary source; this file exists so every published game can carry two
 * publisher families and a real retrieval timestamp.
 */
import { createHash } from "node:crypto";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export const NFL_SCHEDULE_URL = (year, week) =>
  `https://www.nfl.com/schedules/${year}/by-week/week-${week}`;

const ET_ZONE = "America/New_York";
const etParts = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const etLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function partsOf(formatter, iso) {
  return Object.fromEntries(
    formatter.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
}

/** The site's own Eastern calendar day and clock, derived from the kickoff instant. */
export function easternKickoff(iso) {
  const p = partsOf(etParts, iso);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`,
    label: etLabel.format(new Date(iso)).replace(",", " ·").replace(" at ", " ·"),
  };
}

/** Next.js streams the page payload as escaped JSON chunks. */
function payloadOf(html) {
  const out = [];
  const re = /self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)/g;
  let match = re.exec(html);
  while (match) {
    try {
      out.push(JSON.parse(`"${match[1]}"`));
    } catch {
      /* a chunk that is not valid on its own */
    }
    match = re.exec(html);
  }
  return out.join("");
}

/** The objects of the JSON array that starts at `start`. */
function objectsInArray(text, start) {
  const objects = [];
  let depth = 0;
  let inString = false;
  let objectStart = -1;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[") {
      depth += 1;
      continue;
    }
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) break;
      continue;
    }
    if (ch === "{") {
      if (depth === 1 && objectStart < 0) objectStart = i;
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 1 && objectStart >= 0) {
        try {
          objects.push(JSON.parse(text.slice(objectStart, i + 1)));
        } catch {
          /* not a standalone object */
        }
        objectStart = -1;
      }
    }
  }
  return objects;
}

const slugify = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replaceAll(" ", "-");

/**
 * Fetch one NFL week from NFL.com.
 * Returns the raw-body digest so the evidence file can pin what was read.
 */
export async function fetchNflWeek({ year, week, timeoutMs = 25_000 }) {
  const url = NFL_SCHEDULE_URL(year, week);
  const res = await fetch(url, {
    headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const html = await res.text();
  const text = payloadOf(html);
  // The page streams several JSON arrays. Pick the one that actually holds the
  // requested week rather than assuming the schedule array is the first.
  let raw = [];
  for (let at = text.indexOf('[{"id":"'); at >= 0; at = text.indexOf('[{"id":"', at + 1)) {
    const candidate = objectsInArray(text, at);
    if (candidate.some((game) => game.week === week && game.homeTeam?.fullName)) {
      raw = candidate;
      break;
    }
  }
  if (raw.length === 0) throw new Error(`${url}: no weekly schedule payload found`);

  const games = raw
    .filter((game) => game.week === week)
    .map((game) => {
      const external = Object.fromEntries(
        (game.externalIds ?? []).map((entry) => [entry.source, entry.id]),
      );
      const kickoffUtc = new Date(game.time ?? game.date).toISOString();
      const eastern = easternKickoff(kickoffUtc);
      const networks = [
        ...(game.broadcastInfo?.homeNetworkChannels ?? []),
        ...(game.broadcastInfo?.awayNetworkChannels ?? []),
      ].filter(Boolean);
      const status = String(game.status ?? "").toUpperCase();
      const score = (side) => {
        const team = game[`${side}Team`] ?? {};
        const value = team.score ?? game[`${side}Score`] ?? game[`${side}TeamScore`];
        return value == null || value === "" ? null : Number(value);
      };
      return {
        week: game.week,
        slug: external.slug ?? null,
        gsisId: external.gsis ?? null,
        away: game.awayTeam?.fullName ?? null,
        home: game.homeTeam?.fullName ?? null,
        awaySlug: game.awayTeam?.fullName ? slugify(game.awayTeam.fullName) : null,
        homeSlug: game.homeTeam?.fullName ? slugify(game.homeTeam.fullName) : null,
        kickoffUtc,
        date: eastern.date,
        time: eastern.time,
        kickoffLabel: eastern.label,
        category: game.category ?? null,
        networks: [...new Set(networks)],
        territory: game.broadcastInfo?.territory ?? null,
        venue: game.venue?.name ?? null,
        city: game.venue?.city ?? null,
        international: game.international === true,
        neutralSite: game.neutralSite === true,
        status: status === "FINAL" ? "final" : status === "IN_PROGRESS" ? "in_progress" : "scheduled",
        awayScore: score("away"),
        homeScore: score("home"),
      };
    });

  return {
    url,
    checkedAt: new Date().toISOString(),
    rawSha256: createHash("sha256").update(html).digest("hex"),
    games,
  };
}

/**
 * One NFL.com game page — the corroborating record for a completed game.
 * The page carries the box score with per-quarter points, so the quarters sum
 * to the final score. A page also shows a previous-season matchup, so the box
 * score is selected by the two team names that precede it.
 */
export async function fetchNflGame({ slug, away, home, timeoutMs = 25_000 }) {
  const url = `https://www.nfl.com/games/${slug}`;
  const res = await fetch(url, {
    headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const html = await res.text();
  const plain = html.replace(/\\"/g, '"');

  let chosen = null;
  let at = plain.indexOf('"quarters":[');
  while (at >= 0) {
    const before = plain.slice(Math.max(0, at - 6000), at);
    const awayBefore = [...before.matchAll(/"awayTeam":\{"fullName":"([^"]+)"/g)].at(-1)?.[1] ?? null;
    const homeBefore = [...before.matchAll(/"homeTeam":\{"fullName":"([^"]+)"/g)].at(-1)?.[1] ?? null;
    const window = plain.slice(at, at + 6000);
    const rows = [
      ...window.matchAll(
        /"accessibilityLabel":"([^"]*)","awayScore":(\d+),"awayScoreScreenReaderText":"[^"]*","homeScore":(\d+)/g,
      ),
    ].map((match) => ({
      label: match[1],
      away: Number(match[2]),
      home: Number(match[3]),
    }));
    if (awayBefore === away && homeBefore === home && rows.length) {
      chosen = rows;
      break;
    }
    at = plain.indexOf('"quarters":[', at + 12);
  }
  if (!chosen) throw new Error(`${url}: no box score for ${away} at ${home}`);

  // The box score states the final score on its Total row; the quarter rows
  // are per-quarter points and an overtime row may sit between them.
  const total = chosen.find((row) => /^total$/i.test(row.label));
  const played = chosen.filter((row) => /^quarter \d$/i.test(row.label) || /^overtime$/i.test(row.label));
  const awayScore = total ? total.away : played.reduce((sum, row) => sum + row.away, 0);
  const homeScore = total ? total.home : played.reduce((sum, row) => sum + row.home, 0);

  return {
    url,
    checkedAt: new Date().toISOString(),
    rawSha256: createHash("sha256").update(html).digest("hex"),
    bytes: html.length,
    postGame: plain.includes('"isPostGame":true'),
    awayScore,
    homeScore,
    quarters: played.length,
    totalRow: Boolean(total),
  };
}

