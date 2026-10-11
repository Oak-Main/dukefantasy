import type { CSSProperties } from "react";
import type { FantasyNote, PreseasonRating } from "./cfb-dataset";
import type { Game, Stadium, Team, TeamStanding } from "./types";

export type BroadcastTeam = Pick<
  Team,
  | "slug"
  | "name"
  | "shortName"
  | "abbreviation"
  | "conference"
  | "rank"
  | "record"
  | "color"
  | "logo"
>;
export type BroadcastGame = Pick<
  Game,
  | "id"
  | "week"
  | "date"
  | "kickoffUtc"
  | "kickoffLabel"
  | "statusDetail"
  | "awayTeamId"
  | "homeTeamId"
  | "awayScore"
  | "homeScore"
  | "venue"
  | "broadcast"
  | "neutralSite"
> & {
  status: Game["status"] | "live";
};
export type StadiumPreview = Pick<
  Stadium,
  "slug" | "name" | "teamId" | "city" | "capacity"
> & { image?: string; imageIsIllustration?: boolean };
export interface PortalCount {
  teamSlug: string;
  incoming: number | null;
  outgoing: number | null;
}
export interface HomepageData {
  teams: readonly BroadcastTeam[];
  games: readonly BroadcastGame[];
  standings: readonly TeamStanding[];
  portalCounts: readonly PortalCount[];
  fantasyNotes: readonly FantasyNote[];
  preseasonRatings: Readonly<Record<string, PreseasonRating>>;
  stadiums: readonly StadiumPreview[];
  referenceDate: string;
  datasetAsOf: string;
  portalAsOf: string | null;
  fantasyAsOf: string | null;
}

export function conferenceLabel(conference: string): string {
  const labels: Record<string, string> = {
    "Southeastern Conference": "SEC",
    "Atlantic Coast Conference": "ACC",
    "Big Ten Conference": "Big Ten",
    "Big 12 Conference": "Big 12",
    "Conference USA": "CUSA",
    "Mid-American Conference": "MAC",
  };
  return labels[conference] ?? conference.replace(/ Conference$/, "");
}

export function teamStyle(color: string): CSSProperties {
  return { "--team-color": color } as CSSProperties;
}

export function published(value: number | string | null | undefined): string {
  return value == null || value === "" ? "Not published" : String(value);
}

export function kickoffTime(game: BroadcastGame): string {
  return (
    game.kickoffLabel.match(/\d{1,2}:\d{2}\s*[AP]M\s*ET/i)?.[0] ??
    "Not published"
  );
}

export function dateLabel(
  date: string,
  weekday: "short" | "long" = "short",
): string {
  const value = new Date(date.length === 10 ? `${date}T12:00:00Z` : date);
  if (!Number.isFinite(value.getTime())) return "Not published";
  return new Intl.DateTimeFormat("en-US", {
    weekday,
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(value);
}

/** The slate for the NFL week in play on `referenceDate`: every game of the
 * week that holds the first game on or after that day (else the final week).
 * A calendar Mon-Sun window cuts the NFL week in half (Monday Night Football
 * lands in the next window and last week's Monday game leaks in). */
export function weekGames(
  games: readonly BroadcastGame[],
  referenceDate: string,
): BroadcastGame[] {
  const reference = referenceDate.slice(0, 10);
  if (!Number.isFinite(new Date(`${reference}T00:00:00Z`).getTime())) return [];
  const ordered = [...games].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.kickoffUtc ?? "").localeCompare(b.kickoffUtc ?? "") ||
      a.id.localeCompare(b.id),
  );
  const upcoming = ordered.find((game) => game.date.slice(0, 10) >= reference);
  const week = upcoming?.week ?? ordered.at(-1)?.week;
  return week == null ? [] : ordered.filter((game) => game.week === week);
}

type RecordTally = Pick<TeamStanding, "wins" | "losses" | "ties">;
export type RankedStanding = TeamStanding & {
  rank: number;
  pointDifferential: number;
};

const gamesPlayed = (tally: RecordTally) =>
  tally.wins + tally.losses + tally.ties;

/** NFL win percentage, where a tie is half a win. Null before a team has
 * played. It is a single division of integers, so equal fractions always
 * yield identical doubles and the comparisons below never hinge on float drift. */
export function winPercentage(tally: RecordTally): number | null {
  const games = gamesPlayed(tally);
  return games === 0 ? null : (2 * tally.wins + tally.ties) / (2 * games);
}

export function formatRecord(tally: RecordTally): string {
  return `${tally.wins}-${tally.losses}${tally.ties ? `-${tally.ties}` : ""}`;
}

export function formatPointDifferential(value: number): string {
  if (value === 0) return "0";
  // A true minus sign (U+2212), not a hyphen: it reads as "minus" and lines up with "+".
  return `${value > 0 ? "+" : "\u2212"}${Math.abs(value)}`;
}

/** The league's best teams by win percentage, then point differential. Ties
 * beyond that fall to points scored, then team slug, so the order never
 * depends on input order. Teams that have not played are left out. */
export function topStandings(
  rows: readonly TeamStanding[],
  limit = 5,
): RankedStanding[] {
  const differential = (row: TeamStanding) => row.pointsFor - row.pointsAgainst;
  return rows
    .filter((row) => gamesPlayed(row) > 0)
    .sort(
      (a, b) =>
        (winPercentage(b) ?? 0) - (winPercentage(a) ?? 0) ||
        differential(b) - differential(a) ||
        b.pointsFor - a.pointsFor ||
        a.teamSlug.localeCompare(b.teamSlug),
    )
    .slice(0, Math.max(0, limit))
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      pointDifferential: differential(row),
    }));
}

/** Networks that put a game in a national or primetime window. Regional
 * CBS/FOX Sunday windows and NFL Network are deliberately not listed. */
const NATIONAL_WINDOW_NETWORKS = new Set([
  "nbc",
  "espn",
  "abc",
  "primevideo",
  "amazonprimevideo",
  "netflix",
]);

export function isNationalWindow(broadcast: string | null | undefined) {
  return (broadcast ?? "")
    .split(/[/,&+]/)
    .some((network) =>
      NATIONAL_WINDOW_NETWORKS.has(network.toLowerCase().replace(/[^a-z0-9]/g, "")),
    );
}

function parseRecord(record: string | null | undefined): RecordTally | null {
  const match = /^\s*(\d+)-(\d+)(?:-(\d+))?\s*$/.exec(record ?? "");
  if (!match) return null;
  return {
    wins: Number(match[1]),
    losses: Number(match[2]),
    ties: Number(match[3] ?? 0),
  };
}

/** Win percentage of the two teams' records taken together. A record that is
 * not published adds nothing, and with no games between them the matchup reads
 * as an even .500 rather than being penalised. */
function combinedWinPercentage(a: BroadcastTeam, b: BroadcastTeam): number {
  let points = 0;
  let games = 0;
  for (const team of [a, b]) {
    const tally = parseRecord(team.record);
    if (!tally) continue;
    points += 2 * tally.wins + tally.ties;
    games += gamesPlayed(tally);
  }
  return games === 0 ? 0.5 : points / (2 * games);
}

/** Kickoff instant in epoch milliseconds. Unflexed "Time TBD" slots carry a
 * placeholder at the start of their Eastern day, so they order before any real
 * kickoff that day and never outrank one; a game with no instant at all falls
 * back to its Eastern day's 17:00Z anchor. */
function kickoffInstant(game: BroadcastGame): number {
  const instant = Date.parse(game.kickoffUtc ?? game.date);
  return Number.isFinite(instant) ? instant : Number.MIN_SAFE_INTEGER;
}

/** The week's marquee game: the strongest matchup by combined record among
 * games that are not over. Ties go to a national or primetime window, then to
 * the later kickoff (the earliest slot is the likeliest to be under way, or
 * done, by the time a visitor reads a build-time snapshot), then game id.
 * Returns undefined when nothing eligible is left rather than featuring a
 * final. */
export function featuredGame(
  games: readonly BroadcastGame[],
  teams: readonly BroadcastTeam[],
): BroadcastGame | undefined {
  const bySlug = new Map(teams.map((team) => [team.slug, team]));
  const candidates: Array<{
    game: BroadcastGame;
    combined: number;
    national: boolean;
    kickoff: number;
  }> = [];
  for (const game of games) {
    if (
      game.status === "final" ||
      game.status === "canceled" ||
      game.status === "postponed"
    )
      continue;
    const away = bySlug.get(game.awayTeamId);
    const home = bySlug.get(game.homeTeamId);
    if (!away || !home) continue;
    candidates.push({
      game,
      combined: combinedWinPercentage(away, home),
      national: isNationalWindow(game.broadcast),
      kickoff: kickoffInstant(game),
    });
  }
  candidates.sort(
    (a, b) =>
      b.combined - a.combined ||
      Number(b.national) - Number(a.national) ||
      b.kickoff - a.kickoff ||
      a.game.id.localeCompare(b.game.id),
  );
  return candidates[0]?.game;
}

export function playerSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z ]/g, "")
    .trim()
    .replaceAll(" ", "-");
}
