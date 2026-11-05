import { lastCompletedWeek, moduleSources, refreshAsOf, refreshWeek, weekInPlay } from "./content-refresh.ts";

export const routeSearchCopy: Record<string, { title: string; description: string }> = {
  "/": { title: `NFL Week ${refreshWeek} Schedule, Results & Fantasy Watch`, description: `Plan NFL Week ${refreshWeek} with kickoff times, TV networks, results, standings and sourced fantasy guidance. Latest verified update ${refreshAsOf}; module source dates vary.` },
  "/scores": { title: lastCompletedWeek ? `NFL Scores: Week ${lastCompletedWeek} Finals & Week ${weekInPlay} Games` : `NFL Scores: Week ${weekInPlay} Games`, description: `The Week ${weekInPlay} scoreboard includes Eastern kickoff times and verified results as games finish.` },
  "/schedule": { title: `2026 NFL Schedule & Week ${refreshWeek} TV Networks`, description: `The Week ${refreshWeek} slate includes dates, byes, TV networks and Eastern kickoff times. Later fixtures are subject to flex scheduling.` },
  "/fantasy-desk": { title: `Week ${refreshWeek} Fantasy Desk: Byes & Lineup Planning`, description: `Plan NFL Week ${refreshWeek} around byes and kickoff windows. Check dated injury reporting and the publication status of waiver, start/sit, rookie and trade boards.` },
  "/injuries": { title: "NFL Week 8 Thursday Injury Watch", description: `Targeted October 28 CAR/GB reporting; complete ledger review ${moduleSources.injuries.sourceAsOf}. Estimated walkthroughs, final designations, reserve status and historical inactives remain distinct.` },
  "/dfs": { title: "NFL Fantasy Projections & Published-Pick Ledger", description: "How Duke Fantasy publishes and grades pregame picks. Accuracy metrics appear only when real published projections can be evaluated." },
  "/data-sources": { title: "NFL Data Sources, Verification & Freshness", description: "Source dates, collection times, corroboration standards and coverage limits for Duke Fantasy's NFL schedule, results, injuries and fantasy research." },
  "/transactions": { title: "NFL Transactions: Dated October 14–28 Coverage", description: "35 corroborated NFL roster announcements with individual dates and sources. Targeted coverage; pending physicals and practice windows remain distinct." },
  "/transfer-portal": { title: "Verified NFL Roster & Transaction Wire", description: "Corroborated NFL roster moves with dates, teams and publisher sources. Research coverage and held claims are disclosed." },
  "/stats": { title: "2026 NFL Yardage Leaders Through Week 6", description: "The top five NFL passing, rushing and receiving yardage leaders, checked against NFL and ESPN as of October 20, 2026." },
  "/rankings": { title: "2026 NFL Season Yardage Leaders", description: "Published NFL passing, rushing and receiving yardage leaders through Week 6, with dated NFL and ESPN sources." },
};
