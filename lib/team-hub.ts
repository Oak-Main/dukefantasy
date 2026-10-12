import {
  coaches,
  fantasyNotesForTeam,
  getDepthChart,
  getInjuries,
  getPreseasonRating,
  getRoster,
  getTeamBySlug,
  getTeamLeaders,
  getTeamRatings,
  getTeamSchedule,
  getTeamSeasons,
  injuriesAsOf,
  pollTables,
  portalAsOf,
  portalEvents,
  radioAsOf,
  radioForTeam,
  seasonRules,
  stadiums,
  type FantasyNote,
  type PreseasonRating,
  type RadioStation,
  type TeamDepthChart,
  type TeamInjuries,
  type TeamLeaderRow,
  type TeamRatingRow,
  type TeamRoster,
  type TeamScheduleGame,
  type TeamSeasonRow,
} from "./cfb-dataset.ts";
import { easternDay } from "./eastern.ts";
import type { Team, Stadium } from "./types";

export type HubTeam = Pick<
  Team,
  | "slug"
  | "name"
  | "shortName"
  | "conference"
  | "rank"
  | "record"
  | "color"
  | "logo"
>;

export interface HubTransfer {
  id: string;
  player: string;
  position: string | null;
  from: string | null;
  to: string | null;
  date: string | null;
  href?: string;
}

export interface TeamHubProps {
  team: HubTeam;
  season: number;
  referenceDate: string;
  asOf: string | null;
  pollDate: string | null;
  schedule: TeamScheduleGame[] | null;
  portal: {
    incoming: HubTransfer[];
    outgoing: HubTransfer[];
    asOf: string | null;
  } | null;
  roster: TeamRoster | null;
  depth: TeamDepthChart | null;
  stadium: (Omit<Stadium, "capacity"> & { capacity: number | null }) | null;
  radio: RadioStation | null;
  radioAsOf: string | null;
  preseason: PreseasonRating | null;
  ratings: TeamRatingRow[] | null;
  seasons: TeamSeasonRow[] | null;
  leaders: TeamLeaderRow[] | null;
  coach: { name: string; slug: string } | null;
  injuries: TeamInjuries | null;
  injuriesAsOf: string | null;
  fantasy: FantasyNote[];
}

function programName(slug: string | null) {
  if (!slug) return null;
  return (
    getTeamBySlug(slug)?.shortName ??
    slug.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function rosterByPosition(roster: TeamRoster | undefined): TeamRoster | null {
  if (!roster) return null;
  const order = [
    "QB",
    "RB",
    "FB",
    "WR",
    "TE",
    "OL",
    "DL",
    "EDGE",
    "LB",
    "CB",
    "S",
    "DB",
    "K",
    "P",
    "LS",
    "ATH",
    "TBD",
  ];
  const units: Record<string, string> = {
    OT: "OL",
    OG: "OL",
    IOL: "OL",
    G: "OL",
    C: "OL",
    T: "OL",
    DT: "DL",
    DE: "DL",
    NT: "DL",
    FS: "S",
    SS: "S",
    SAF: "S",
    PK: "K",
  };
  const groups = new Map<
    string,
    TeamRoster["position_groups"][number]["players"]
  >();
  for (const source of roster.position_groups) {
    for (const player of source.players) {
      const position = player.position?.trim().toUpperCase();
      const name = position ? (units[position] ?? position) : "TBD";
      const players = groups.get(name) ?? [];
      players.push(player);
      groups.set(name, players);
    }
  }
  return {
    ...roster,
    position_groups: [...groups]
      .map(([name, players]) => ({ name, players }))
      .sort((a, b) => {
        const aIndex = order.indexOf(a.name);
        const bIndex = order.indexOf(b.name);
        return (
          (aIndex < 0 ? order.length : aIndex) -
            (bIndex < 0 ? order.length : bIndex) || a.name.localeCompare(b.name)
        );
      }),
  };
}

export function getTeamHubData(
  team: Team,
  // Schedule rows carry Eastern days, so "today" is the Eastern day (UTC has
  // already turned over by the time tonight's primetime game kicks off).
  referenceDate = easternDay(),
): TeamHubProps {
  const pollDate = pollTables.find((poll) =>
    /associated press|\bAP\b/i.test(`${poll.poll} ${poll.name}`),
  )?.release_date;
  const parsedPollDate = pollDate ? Date.parse(pollDate) : Number.NaN;
  const transfers = portalEvents
    .map(
      (event): HubTransfer & { fromSlug: string; toSlug: string | null } => ({
        id: event.id,
        player: event.player,
        position: event.position === "—" ? null : event.position,
        from: programName(event.fromTeamId),
        to: programName(event.toTeamId),
        fromSlug: event.fromTeamId,
        toSlug: event.toTeamId,
        date: event.eventDate,
        href: `/players/${event.playerSlug}`,
      }),
    )
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return {
    team,
    season: seasonRules.season,
    referenceDate,
    asOf: team.provenance.sourceAsOf,
    pollDate: Number.isNaN(parsedPollDate)
      ? null
      : new Date(parsedPollDate).toISOString().slice(0, 10),
    schedule: getTeamSchedule(team.slug),
    portal: portalAsOf
      ? {
          incoming: transfers.filter((event) => event.toSlug === team.slug),
          outgoing: transfers.filter((event) => event.fromSlug === team.slug),
          asOf: portalAsOf,
        }
      : null,
    roster: rosterByPosition(getRoster(team.slug)),
    depth: getDepthChart(team.slug) ?? null,
    stadium: stadiums.find((stadium) => stadium.teamId === team.slug) ?? null,
    radio: radioForTeam(team.slug),
    radioAsOf,
    preseason: getPreseasonRating(team.slug),
    ratings: getTeamRatings(team.slug),
    seasons: getTeamSeasons(team.slug),
    leaders: getTeamLeaders(team.slug),
    coach: coaches.find((coach) => coach.teamId === team.slug) ?? null,
    injuries: getInjuries(team.slug) ?? null,
    injuriesAsOf,
    fantasy: fantasyNotesForTeam(team.slug),
  };
}
