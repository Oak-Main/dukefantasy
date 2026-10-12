/**
 * The site speaks US Eastern (D-015): every `Game.date` is an Eastern calendar
 * day, so "today" has to be one too. The UTC day is already tomorrow from 8 PM
 * ET (7 PM once daylight time ends), which is when primetime games kick off.
 */
const eastern = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" of the Eastern calendar day that contains `instant`. */
export function easternDay(instant: Date | number | string = Date.now()): string {
  const parts = Object.fromEntries(
    eastern.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
