import type { CSSProperties } from "react";
import type { FantasyNote, PollTable, PreseasonRating } from "./cfb-dataset";
import type { Game, Stadium, Team } from "./types";

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
  pollTables: readonly PollTable[];
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

export function featuredGame(
  games: readonly BroadcastGame[],
  teams: readonly BroadcastTeam[],
): BroadcastGame | undefined {
  const bySlug = new Map(teams.map((team) => [team.slug, team]));
  const score = (game: BroadcastGame) =>
    (bySlug.get(game.awayTeamId)?.rank ?? 150) +
    (bySlug.get(game.homeTeamId)?.rank ?? 150);
  const available = games.filter(
    (game) =>
      bySlug.has(game.awayTeamId) &&
      bySlug.has(game.homeTeamId) &&
      game.status !== "canceled" &&
      game.status !== "postponed",
  );
  const scheduled = available.filter(
    (game) => game.status === "scheduled" || game.status === "live",
  );
  return [...(scheduled.length ? scheduled : available)].sort(
    (a, b) => score(a) - score(b) || a.date.localeCompare(b.date),
  )[0];
}

export function playerSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z ]/g, "")
    .trim()
    .replaceAll(" ", "-");
}
