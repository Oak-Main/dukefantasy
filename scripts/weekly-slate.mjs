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

/**
 * The ESPN timing fields that the season compile recorded for a game.
 */
export const RETIMED_FIELDS = ["date", "kickoffUtc", "timeTbd", "kickoffLabel", "statusDetail", "broadcast"];

/**
 * A game in a week after the edition week has not been published by any
 * edition: it still carries the season compile's single-source ESPN record.
 * When ESPN later moves its kickoff (a flex), the edition takes ESPN's new
 * timing for that game, so the dataset agrees with the source it was compiled
 * from and `dataset:verify` can pass. Published (two-publisher) records, earlier
 * weeks, and games that are not scheduled on both sides are never changed here.
 */
export function retimeUnpublished(prior, fresh, editionWeek) {
  if (!prior || !fresh || prior.id !== fresh.id) throw new Error("retimeUnpublished compares one game");
  const eligible = prior.week > editionWeek && !prior.verification &&
    prior.status === "scheduled" && fresh.status === "scheduled" && prior.kickoffUtc !== fresh.kickoffUtc;
  if (!eligible) return { record: prior, retimed: false };
  const record = { ...prior };
  for (const key of RETIMED_FIELDS) if (key in prior) record[key] = fresh[key] ?? null;
  return { record, retimed: true };
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
