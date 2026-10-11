/**
 * NFL data adapter for DukeFantasy.
 *
 * Keeps the export names that the CFB components expect (teams, games,
 * getTeamBySlug, etc.) but serves NFL data from lib/nfl-generated.ts.
 * The components don't change — only the data underneath.
 *
 * CFB-specific surfaces (portal, contracts, college ratings) return empty
 * arrays / null — the components already handle graceful empty states.
 */
import { formatGameResult } from "./live-scoreboard.ts";
import nfl from "./nfl-generated.ts";
import type { Game, GameStatus, Stadium, Team } from "./types.ts";

/* ---------------------------------------------------------------- helpers */

function monogramFor(name: string) {
  return name[0] ?? "?";
}

function strengthFor(wins: number) {
  return Math.max(1, Math.min(99, 50 + wins * 3));
}

const provenance = {
  provider: "ESPN NFL API",
  providerRecordId: "espn-nfl",
  sourceAsOf: nfl.generatedAt.slice(0, 10),
  fetchedAt: nfl.generatedAt,
  verifiedAt: nfl.generatedAt,
  dataEnvironment: "production" as const,
  licenseClass: "R2_LINK_ONLY" as const,
  verificationStatus: "official" as const,
  confidence: 0.95,
  recordOrigin: "provider" as const,
  freshness: "current" as const,
};

/* ---------------------------------------------------------------- teams */

const standingsBySlug = new Map(
  Object.values(nfl.standings as Record<string, { slug: string; wins: number; losses: number; ties: number; pf: number; pa: number; record: string }>)
    .map((s) => [s.slug, s]),
);

const nflTeams = nfl.teams as Array<{
  id: string; slug: string; name: string; shortName: string; abbreviation: string;
  city: string; conference: string; division: string; color: string; logo: string; record: string;
}>;

export const teams: Team[] = nflTeams.map((team) => {
  const s = standingsBySlug.get(team.slug);
  return {
    id: team.slug,
    slug: team.slug,
    name: team.name,
    shortName: team.shortName,
    abbreviation: team.abbreviation,
    monogram: team.shortName[0] ?? "?",
    conference: team.conference,
    subdivision: "P4" as const,
    rank: undefined,
    record: s?.record ?? team.record,
    color: team.color,
    strength: strengthFor(s?.wins ?? 0),
    returningProduction: 0,
    portalImpact: 0,
    playoffProbability: 0,
    logo: team.logo,
    provenance,
  };
});

const teamBySlug = new Map(teams.map((t) => [t.slug, t]));

export function getTeamBySlug(slug: string): Team | undefined {
  return teamBySlug.get(slug);
}

export function getTeam(id: string): Team {
  const team = teamBySlug.get(id);
  if (!team) throw new Error(`Unknown NFL team id: ${id}`);
  return team;
}

/* ---------------------------------------------------------------- games */

export const games: Game[] = (nfl.schedule as Array<Record<string, unknown>>).map((g) => ({
  id: g.id as string,
  week: g.week as number,
  date: `${g.date}T17:00:00.000Z`,
  kickoffLabel: g.kickoffLabel as string,
  status: (g.status === "final" ? "final" : "scheduled") as GameStatus,
  statusDetail: g.statusDetail as string,
  awayTeamId: g.awaySlug as string,
  homeTeamId: g.homeSlug as string,
  awayScore: (g.awayScore as number) ?? undefined,
  homeScore: (g.homeScore as number) ?? undefined,
  venueSlug: g.homeSlug as string,
  venue: (g.venue as string) || `${teamBySlug.get(g.homeSlug as string)?.shortName ?? "Home"} stadium`,
  city: "",
  broadcast: (g.broadcast as string) ?? null,
  weather: null,
  neutralSite: false,
  modelHomeWinProbability: 0.5,
  modelUncertainty: 0,
  provenance,
}));

export function getGame(id: string): Game | undefined {
  return games.find((g) => g.id === id);
}

/* ------------------------------------------------------- empty CFB surfaces */

export const coaches: any[] = [];
export const portalEvents: any[] = [];
export const fantasyNotes: any[] = [];
export const dfsPlayers: any[] = [];
export const stadiums: Stadium[] = (nfl.stadiums as Stadium[]) ?? [];
export const scenarioGames: any[] = [];
export const pollTables: PollTable[] = [];
export const preseasonRatings: Record<string, PreseasonRating> = {};
export const fantasyNotesAsOf: string | null = null;
export const fantasyNotesContext: string | null = null;
export const portalAsOf: string | null = null;
export const portalStatusNote: string | null = null;
export const pollsStatusNote: string | null = null;
export const modelEstimatesAvailable = false;
export const radioAsOf: string | null = null;
export const seasonRules = { season: 2026, label: "2026 NFL Season", playoffTeams: 14, byes: 2 } as const;

/* Types kept interface-compatible with the CFB Hub surfaces so the shared
 * team-hub components compile unchanged. All data stays empty/null here —
 * the components render honest "not published" states. */

export interface RosterPlayer {
  name: string;
  position: string | null;
  class: string | null;
  jersey: number | null;
  height: string | null;
  weight: string | null;
  stars: number | null;
  hometown: string | null;
}

export interface TeamRoster {
  head_coach: string | null;
  counts: { players: number; with_stars: number; with_high_school: number } | null;
  position_groups: Array<{ name: string; players: RosterPlayer[] }>;
}

export interface DepthSlotEntry {
  rank: number;
  co_listed: boolean;
  players: Array<{ name: string; class: string | null; stars: number | null }>;
}

export interface TeamDepthChart {
  status: string | null;
  status_caveat: string | null;
  schemes: { offense: string | null; defense: string | null; special_teams: string | null } | null;
  units: Array<{ unit: string; positions: Array<{ position: string; depth: DepthSlotEntry[] }> }>;
}

export interface InjuryEntry {
  name: string;
  position: string | null;
  status: string | null;
  injury: string | null;
}

export interface TeamInjuries {
  slug: string;
  opponent_context: string | null;
  players: InjuryEntry[];
}

export interface TeamSeasonRow {
  season: string;
  g: number | null;
  op: number | null;
  dp: number | null;
  oy: number | null;
  dy: number | null;
}

export interface TeamRatingRow {
  season: string;
  feiRank: number | null;
  fei: number | null;
  spRank: number | null;
  spPlus: number | null;
  record: string | null;
}

export interface TeamLeaderRow {
  season: string;
  category: string;
  player: string | null;
  rank: number | null;
}

export interface PreseasonRating {
  sp: { overall: number; rank: number; offense: number; defense: number; source: string } | null;
  fpi: { value: number | null; rank: number; source: string } | null;
  wins: { projected: number | null; line: number | null; source: string } | null;
  playoff: { outlet: string; value: string | null; source: string } | null;
  notes: string | null;
  as_of: string;
}

export interface RadioStation {
  team: string;
  station: string | null;
  frequency: string | null;
  market: string | null;
  network: string | null;
  rights_holder: string | null;
  satellite: string | null;
  stream: string | null;
  notes: string | null;
  sources: string[];
  confidence: string | null;
}

export interface PollRanking {
  rank: number;
  team_slug: string | null;
  team: string;
  record: string | null;
  points: number | null;
  first_place_votes: number | null;
  previous_rank: number | null;
  tied: boolean;
}

export interface PollTable {
  poll: string;
  name: string;
  release_date: string | null;
  rankings: PollRanking[];
  others: Array<{ team: string; team_slug: string | null; points: number | null }>;
}

export function portalCountsFor(_slug?: string): { incoming: number; outgoing: number; net: number } {
  return { incoming: 0, outgoing: 0, net: 0 };
}
export function radioForTeam(_slug?: string): RadioStation | null { return null; }
export function getStadiumBySlug(_slug?: string): Stadium | undefined { return undefined; }
export function getPreseasonRating(_slug?: string): PreseasonRating | null { return null; }
export function searchPlayers(
  _query: string,
  _limit?: number,
): Array<{ n: string; t: string; p: string | null; teamName: string; id: string }> {
  return [];
}
export function getRoster(_slug?: string): TeamRoster | undefined { return undefined; }
export function getDepthChart(_slug?: string): TeamDepthChart | null { return null; }
export function getInjuries(_slug?: string): TeamInjuries | null { return null; }
export function getTeamSeasons(_slug?: string): TeamSeasonRow[] { return []; }
export function getTeamRatings(_slug?: string): TeamRatingRow[] { return []; }
export function getTeamLeaders(_slug?: string): TeamLeaderRow[] { return []; }
export function getStaff(_slug?: string): null { return null; }
export function getSchemes(_slug?: string): null { return null; }
export function getCoachBySlug(_slug?: string): undefined { return undefined; }

export function fantasyNotesForTeam(_slug?: string): Array<FantasyNote> { return []; }

export interface TeamScheduleGame {
  /** Row key, unique within one team's schedule. Not an ESPN id; use `eventId` to match the live feed. */
  id: string;
  /** ESPN event id (the same id as `Game.id`); the only key the live overlay matches on. */
  eventId: string | null;
  date: string | null;
  week: number | null;
  opponent: string | null;
  opponentSlug: string | null;
  homeAway: string | null;
  isBye: boolean;
  result: string | null;
  kickoffLabel: string | null;
  broadcast: string | null;
  venue: string | null;
  href: string | null;
}

export function getTeamSchedule(slug: string): TeamScheduleGame[] {
  const teamGames = games.filter((g) => g.awayTeamId === slug || g.homeTeamId === slug);
  return teamGames.map((g, i) => {
    const isHome = g.homeTeamId === slug;
    const oppSlug = isHome ? g.awayTeamId : g.homeTeamId;
    const opp = teamBySlug.get(oppSlug);
    const ownScore = isHome ? g.homeScore : g.awayScore;
    const oppScore = isHome ? g.awayScore : g.homeScore;
    let result: string | null = null;
    if (ownScore !== undefined && oppScore !== undefined) {
      result = formatGameResult(ownScore, oppScore);
    }
    return {
      id: `${slug}-${g.date.slice(0, 10)}-${i}`,
      eventId: g.id,
      date: g.date.slice(0, 10),
      week: g.week,
      opponent: opp?.name ?? null,
      opponentSlug: oppSlug,
      homeAway: isHome ? "home" : "away",
      isBye: false,
      result,
      kickoffLabel: g.kickoffLabel.match(/\d{1,2}:\d{2} [AP]M ET/)?.[0] ?? null,
      broadcast: g.broadcast,
      venue: g.venue,
      href: `/games/${g.id}`,
    };
  });
}

export interface RadioStation { team: string; station: string | null; frequency: string | null; market: string | null; network: string | null; rights_holder: string | null; satellite: string | null; stream: string | null; notes: string | null; sources: string[]; confidence: string | null; }

export const injuriesAsOf: string | null = null;

export interface FantasyNote {
  id: string; player: string; team: string; position: string | null; class: string | null;
  role: string | null; usage: string | null; availability: string | null; injury: string | null;
  projection: { outlet: string | null; value: string | null } | null;
  sources: string[]; as_of: string | null;
}

export interface PlayerIndexEntry { n: string; t: string; p: string | null }

export interface TvRow { date: string; away: string; home: string; tv: string | null; time_et: string | null; status: string; week: number }

/* --------------------------------------------------------- TV / broadcast */

export const tvRows: Array<{ date: string; away: string; home: string; tv: string | null; time_et: string | null; status: string; week: number }> =
  games.map((g) => ({
    date: g.date.slice(0, 10),
    away: g.awayTeamId,
    home: g.homeTeamId,
    tv: g.broadcast,
    time_et: g.kickoffLabel.match(/\d{1,2}:\d{2} [AP]M ET/)?.[0] ?? null,
    status: g.status === "final" ? "final" : "announced",
    week: g.week,
  }));

export function tvWeeks(): number[] {
  return [...new Set(tvRows.map((r) => r.week))].sort((a, b) => a - b);
}

export function tvRowsForWeek(week: number) {
  return tvRows.filter((r) => r.week === week);
}

export function broadcastFor(): { tv: string | null; time_et: string | null } | null {
  return null;
}

export function timeEtLabel(timeEt: string | null): string | null {
  if (!timeEt) return null;
  const match = timeEt.match(/(\d{1,2}):(\d{2}) (AM|PM)/);
  if (!match) return timeEt;
  return `${match[1]}:${match[2]} ${match[3]} ET`;
}

export const datasetAsOf: string = nfl.generatedAt.slice(0, 10);
export const broadcastAsOf: string = nfl.generatedAt.slice(0, 10);
export const broadcastNote: string =
  "TV designations from ESPN's live NFL schedule. Times Eastern; flex scheduling windows apply from Week 5 onward.";

/* ---------------------------------------------------- conference hub (NFL) */

export function conferenceHubSlugs(): string[] {
  return ["afc", "nfc", "afc-east", "afc-north", "afc-south", "afc-west", "nfc-east", "nfc-north", "nfc-south", "nfc-west"];
}

export function getConferenceHub(slug: string): {
  slug: string; name: string; shortName: string;
  teams: Team[]; scheduledGames: Game[];
  topSPPlus: any[]; playoffContenders: any[]; tvGamesThisWeek: Array<{ game: Game; network: string }>;
} | null {
  const isConf = slug === "afc" || slug === "nfc";
  if (!isConf && !slug.includes("-")) return null;

  let name: string;
  let conferenceTeams: Team[];

  if (isConf) {
    name = slug.toUpperCase();
    conferenceTeams = teams.filter((t) => t.conference === slug.toUpperCase());
  } else {
    const conf = slug.startsWith("afc") ? "AFC" : "NFC";
    const divWord = slug.split("-").pop() ?? "";
    const divisionName = `${divWord[0]?.toUpperCase() ?? ""}${divWord.slice(1)}`;
    name = `${conf} ${divisionName}`;
    conferenceTeams = nflTeams
      .filter((n) => n.conference === conf && n.division.toLowerCase().includes(divWord))
      .map((n) => teamBySlug.get(n.slug))
      .filter((t): t is Team => t !== undefined);
  }

  if (conferenceTeams.length === 0) return null;
  const teamIds = new Set(conferenceTeams.map((t) => t.id));
  const conferenceGames = games.filter((g) => teamIds.has(g.homeTeamId) || teamIds.has(g.awayTeamId));

  return {
    slug,
    name,
    shortName: name,
    teams: conferenceTeams.sort((a, b) => a.shortName.localeCompare(b.shortName)),
    scheduledGames: conferenceGames,
    topSPPlus: [],
    playoffContenders: [],
    tvGamesThisWeek: conferenceGames
      .filter((g) => g.broadcast && Date.parse(g.date) >= Date.now() - 86400000 * 3)
      .slice(0, 6)
      .map((g) => ({ game: g, network: g.broadcast ?? "" })),
  };
}

/* ------------------------------------------------------ provider health */

export const providerHealth = [
  {
    id: "espn-nfl",
    label: "ESPN NFL API",
    mode: "production" as const,
    status: "operational" as const,
    lastSuccess: nfl.generatedAt,
    cadence: "Build-time snapshot; scores update via Worker fetch",
    note: "Live NFL data from ESPN's free public API.",
  },
];
