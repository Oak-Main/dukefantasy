import type { Game, Team } from "@/lib/types";

export type ScoreboardFilter =
  | "all"
  | "fbs"
  | "top-25"
  | "conference"
  | "my-teams";

export const scoreboardFilters: ReadonlyArray<{
  value: ScoreboardFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "fbs", label: "FBS vs FBS" },
  { value: "top-25", label: "Top 25" },
  { value: "conference", label: "Conference" },
  { value: "my-teams", label: "My Teams" },
];

export function continuousWeeks(publishedWeeks: readonly number[]) {
  if (publishedWeeks.length === 0) return [];
  const first = Math.min(...publishedWeeks);
  const last = Math.max(...publishedWeeks);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export function defaultScoreboardWeek(
  source: readonly Game[],
  asOf: string | null,
) {
  const sortedWeeks = [...new Set(source.map((game) => game.week))].sort(
    (a, b) => a - b,
  );
  if (sortedWeeks.length === 0) return 0;
  const reference = asOf && !Number.isNaN(Date.parse(asOf)) ? asOf.slice(0, 10) : "0000-00-00";
  // NFL weeks run Thursday-Monday, so the landing week is the week of the
  // first game on or after the as-of day (the old "next Saturday" rule is a
  // college-football convention and pointed this site at a December week).
  const nextGame = source
    .filter((game) => game.date.slice(0, 10) >= reference)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];
  return nextGame?.week ?? sortedWeeks.at(-1) ?? 0;
}

export function gamesForWeek(source: readonly Game[], week: number) {
  return source
    .filter((game) => game.week === week)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.kickoffUtc ?? "").localeCompare(b.kickoffUtc ?? "") ||
        a.id.localeCompare(b.id),
    );
}

export function filterScoreboardGames({
  source,
  teams,
  filter,
  conference,
  favorites,
}: {
  source: readonly Game[];
  teams: readonly Team[];
  filter: ScoreboardFilter;
  conference: string;
  favorites: ReadonlySet<string>;
}) {
  const byId = new Map(teams.map((team) => [team.id, team]));
  return source.filter((game) => {
    const away = byId.get(game.awayTeamId);
    const home = byId.get(game.homeTeamId);
    if (!away || !home) return false;
    if (filter === "all") return true;
    if (filter === "fbs") {
      return away.subdivision !== "FCS" && home.subdivision !== "FCS";
    }
    if (filter === "top-25") return away.rank != null || home.rank != null;
    if (filter === "conference") {
      return away.conference === conference || home.conference === conference;
    }
    return favorites.has(away.id) || favorites.has(home.id);
  });
}

export function groupGamesByDate(source: readonly Game[]) {
  const groups = new Map<string, Game[]>();
  for (const game of source) {
    const date = game.date.slice(0, 10);
    const group = groups.get(date) ?? [];
    group.push(game);
    groups.set(date, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, games]) => ({ date, games }));
}

export function appointmentGames(
  source: readonly Game[],
  teams: readonly Team[],
  limit = 5,
) {
  const byId = new Map(teams.map((team) => [team.id, team]));
  const score = (game: Game) => {
    const awayRank = byId.get(game.awayTeamId)?.rank;
    const homeRank = byId.get(game.homeTeamId)?.rank;
    const rankedTeams = [awayRank, homeRank].filter(
      (rank): rank is number => rank != null,
    );
    const rankValue = rankedTeams.reduce(
      (total, rank) => total + (26 - rank) * 4,
      0,
    );
    const broadcastValue = game.broadcast ? 28 : 0;
    const timeValue = /\d{1,2}:\d{2} (?:AM|PM) ET/.test(game.kickoffLabel)
      ? 8
      : 0;
    return rankValue + broadcastValue + timeValue;
  };
  return [...source]
    .sort(
      (a, b) =>
        score(b) - score(a) ||
        a.date.localeCompare(b.date) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(0, limit));
}

export function scoreboardDateLabel(date: string, long = false) {
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "Date not published";
  return new Intl.DateTimeFormat("en-US", {
    weekday: long ? "long" : "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function kickoffTimeLabel(game: Game) {
  return game.kickoffLabel.match(/\d{1,2}:\d{2} (?:AM|PM) ET/)?.[0] ?? "TBD";
}

export function broadcastLabel(game: Game) {
  return game.broadcast ?? "Network not assigned";
}
