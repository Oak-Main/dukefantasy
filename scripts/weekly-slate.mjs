import { isCalendarDate } from "./week7-publication-dates.mjs";

const pacificDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" });

export function publicationWindow(date, now = new Date()) {
  const today = pacificDate.format(now);
  const day = date ?? today;
  if (!isCalendarDate(day)) throw new Error("Invalid release date; use YYYY-MM-DD");
  if (day > "2027-02-15") return { day, ended: true };
  if (day > today) throw new Error("Cannot publish a future edition");
  return { day, ended: false };
}

export function selectSlate(games, totalWeeks, previousEdition, requestedWeek) {
  const weeks = Array.from({ length: totalWeeks }, (_, index) => index + 1);
  const completed = weeks.map(week => {
    const slate = games.filter(game => game.week === week);
    if (!slate.length) throw new Error(`Missing Week ${week} schedule`);
    return slate.every(game => game.status === "final");
  });
  const firstIncomplete = completed.indexOf(false);
  const completedWeek = firstIncomplete === -1 ? totalWeeks : firstIncomplete;
  // A postponed game keeps its own status. Once a later slate starts, it
  // cannot hold the active week back indefinitely.
  const started = Math.max(0, ...games.filter(game => ["final", "in_progress"].includes(game.status)).map(game => game.week));
  const active = weeks.find(week => !completed[week - 1] && (week >= started ||
    games.some(game => game.week === week && game.status !== "final" && !/postpon|cancel|suspend|delay/i.test(game.statusDetail ?? ""))));
  const weekInPlay = active ?? totalWeeks;
  const editionWeek = requestedWeek ?? Math.max(weekInPlay, previousEdition);
  if (!Number.isInteger(editionWeek) || editionWeek < weekInPlay || editionWeek < previousEdition ||
      editionWeek > Math.min(totalWeeks, weekInPlay + 1)) {
    throw new Error(`Invalid edition Week ${editionWeek} for week in play ${weekInPlay}`);
  }
  return { weekInPlay, completedWeek, editionWeek };
}

/** A shared secondary does not establish the primary. Simulcasts require independent support. */
export function resolveBroadcast(game, nflNetworks, ruling) {
  const espn = game.broadcast;
  const nfl = nflNetworks[0] ?? null;
  const sameGame = ruling && ruling.date === game.date && ruling.away === game.awaySlug && ruling.home === game.homeSlug && ruling.network === nfl;
  if (espn && espn === nfl) {
    const verified = new Set([...nflNetworks, ...(sameGame ? ruling.simulcasts ?? [] : [])]);
    return { broadcast: espn, networks: [...new Set([espn, ...(game.networks ?? []).filter(name => verified.has(name))])], conflict: null };
  }
  if (!espn && !nfl) return { broadcast: null, networks: [], conflict: null };
  const corroborated = sameGame && Boolean(ruling.broadcasterUrl);
  const broadcast = corroborated ? nfl : null;
  return {
    broadcast,
    networks: broadcast ? [broadcast] : [],
    conflict: {
      field: "primary_network", espn, nflCom: nfl,
      resolution: corroborated ? "nfl_and_broadcaster" : "withheld",
      ...(corroborated ? { review: ruling } : {}),
    },
  };
}
