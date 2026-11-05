// Isolated November 10 rehearsal. Week 9 scores below are synthetic test inputs.
import { readFileSync } from "node:fs";
const baseline = JSON.parse(readFileSync("data/content-refresh/2026-11-05/snapshot.json", "utf8"));
const RealDate = Date;
const now = RealDate.parse(process.env.FIXTURE_CLOCK ?? "2026-11-10T14:00:00Z");
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};
const teams = new Map(baseline.teams.map(team => [team.slug, team]));
const games = baseline.schedule.map(game => game.week === 9 ? { ...game, status: "final", awayScore: 17, homeScore: 13 } : game);
const event = game => ({
  id: game.id, week: { number: game.week }, date: game.kickoffUtc,
  status: { type: { state: game.status === "final" ? "post" : "pre", completed: game.status === "final", detail: game.status === "final" ? "Final" : game.statusDetail } },
  competitions: [{
    timeValid: !game.timeTbd, neutralSite: game.neutral_site,
    broadcasts: [{ names: game.id === "401873042" ? ["FOX"] : game.networks ?? (game.broadcast ? [game.broadcast] : []) }],
    venue: { fullName: game.venue, address: { city: game.city, country: game.country } },
    competitors: ["away", "home"].map(side => {
      const team = teams.get(game[side + "Slug"]);
      return { homeAway: side, team: { displayName: team.name, abbreviation: team.abbreviation }, score: game[side + "Score"] };
    }),
  }],
});
function leagueGame(game) {
  return {
    id: game.id, week: game.week, date: game.kickoffUtc, status: game.status.toUpperCase(),
    awayTeam: { fullName: teams.get(game.awaySlug).name }, homeTeam: { fullName: teams.get(game.homeSlug).name },
    broadcastInfo: { homeNetworkChannels: game.broadcast ? [game.broadcast] : [] },
    externalIds: [{ source: "slug", id: game.id }],
  };
}
globalThis.fetch = async input => {
  const url = new URL(input);
  if (url.pathname.endsWith("/scoreboard")) {
    if (url.searchParams.has("week")) return Response.json({ events: games.filter(g => g.week === Number(url.searchParams.get("week"))).map(event) });
    return Response.json({ week: { number: 10 }, leagues: [{ calendar: [{ value: 2, entries: Array.from({ length: 18 }, (_, i) => ({ value: i + 1 })) }] }] });
  }
  if (url.pathname.endsWith("/standings")) {
    const rows = structuredClone(baseline.standings);
    for (const g of games.filter(g => g.week === 9)) {
      rows[g.awaySlug].wins++; rows[g.homeSlug].losses++;
      rows[g.awaySlug].pf += 17; rows[g.homeSlug].pa += 17;
      rows[g.awaySlug].pa += 13; rows[g.homeSlug].pf += 13;
    }
    return Response.json({ standings: { entries: Object.entries(rows).map(([slug, r]) => ({
      team: { displayName: teams.get(slug).name },
      stats: Object.entries({ wins:r.wins, losses:r.losses, ties:r.ties, pointsFor:r.pf, pointsAgainst:r.pa }).map(([name, value]) => ({ name, value })),
    })) } });
  }
  if (url.pathname.includes("/by-week/")) {
    const week = Number(url.pathname.split("-").pop());
    const data = games.filter(g => g.week === week).map(leagueGame);
    return new Response("self.__next_f.push([1," + JSON.stringify(JSON.stringify(data)) + "])");
  }
  if (url.pathname.startsWith("/games/")) {
    const game = games.find(g => g.id === url.pathname.split("/").pop());
    const row = leagueGame(game);
    const score = game.awayScore + (game.week === 9 && process.env.FIXTURE_MISMATCH === "true" ? 1 : 0);
    return Response.json({ awayTeam: row.awayTeam, homeTeam: row.homeTeam, isPostGame: true, quarters: [{ accessibilityLabel: "Total", awayScore: score, awayScoreScreenReaderText: "", homeScore: game.homeScore }] });
  }
  throw new Error("Unexpected fixture URL " + input);
};
