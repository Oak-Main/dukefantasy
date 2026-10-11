import {
  broadcastAsOf,
  fantasyNotes,
  fantasyNotesAsOf,
  games,
  portalAsOf,
  portalCountsFor,
  preseasonRatings,
  stadiums,
  standings,
  teams,
} from "./cfb-dataset";
import { weekGames, type HomepageData } from "./homepage";

const datasetAsOf =
  [broadcastAsOf, portalAsOf, fantasyNotesAsOf, "2026-09-05"]
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1) ?? "2026-09-05";

export const homepageData: HomepageData = {
  teams,
  games,
  standings,
  portalCounts: teams
    .map((team) => {
      const counts = portalCountsFor(team.slug);
      return {
        teamSlug: team.slug,
        // No recorded events is not evidence that a team's total is zero.
        incoming: counts.incoming > 0 ? counts.incoming : null,
        outgoing: counts.outgoing > 0 ? counts.outgoing : null,
      };
    })
    .sort((a, b) => (b.incoming ?? -1) - (a.incoming ?? -1)),
  fantasyNotes,
  preseasonRatings,
  stadiums: stadiums.map((stadium) => ({
    ...stadium,
    image: "/images/saturday-lights.png",
    imageIsIllustration: true,
  })),
  referenceDate: datasetAsOf,
  datasetAsOf,
  portalAsOf,
  fantasyAsOf: fantasyNotesAsOf,
};

export const tickerGames = [
  ...games
    .filter((game) => game.status === "final")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4),
  ...weekGames(games, datasetAsOf)
    .filter((game) => game.status !== "final")
    .slice(0, 8),
];
