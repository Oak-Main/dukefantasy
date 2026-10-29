import type { Game } from "@/lib/types";

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

/** A single stored season week can override the landing slate. Future fixtures
 * remain planning data with their existing single-source provenance. */
export function requestedScoreboardWeek(source: readonly Game[], asOf: string | null, value?: string | string[]) {
  const week = typeof value === "string" && /^(?:[1-9]|1[0-8])$/.test(value) ? Number(value) : null;
  return week != null && source.some(game => game.week === week) ? week : defaultScoreboardWeek(source, asOf);
}
