import { moduleSources, refreshAsOf, refreshWeek } from "./content-refresh.ts";

export const routeSearchCopy: Record<string, { title: string; description: string }> = {
  "/": { title: `NFL Week ${refreshWeek} Schedule, Results & Fantasy Watch`, description: `Plan NFL Week ${refreshWeek} with kickoff times, TV networks, results, standings and sourced fantasy guidance. Latest verified update ${refreshAsOf}; module source dates vary.` },
  "/scores": { title: "NFL Scores: Week 7 Finals & Week 8 Games", description: "Final NFL scores through Week 7 and the upcoming Week 8 slate, with dated source checks and Eastern kickoff times." },
  "/schedule": { title: "2026 NFL Schedule & Week 8 TV Networks", description: "The full NFL regular-season planning schedule, with Week 8 kickoff times, venues, byes and TV networks. Future flex windows remain subject to change." },
  "/fantasy-desk": { title: "Week 8 Fantasy Research Status & Archives", description: "Week 8 decision boards and Week 7 rookie usage are not published. See coverage limits, planning assumptions and the prior fantasy research archive." },
  "/injuries": { title: "NFL Week 8 Thursday Injury Watch", description: `Targeted October 28 CAR/GB reporting; complete ledger review ${moduleSources.injuries.sourceAsOf}. Estimated walkthroughs, final designations, reserve status and historical inactives remain distinct.` },
  "/dfs": { title: "NFL Fantasy Projections & Published-Pick Ledger", description: "How Duke Fantasy publishes and grades pregame picks. Accuracy metrics appear only when real published projections can be evaluated." },
  "/data-sources": { title: "NFL Data Sources, Verification & Freshness", description: "Source dates, collection times, corroboration standards and coverage limits for Duke Fantasy's NFL schedule, results, injuries and fantasy research." },
  "/transactions": { title: "NFL Transactions: Dated October 14–28 Coverage", description: "35 corroborated NFL roster announcements with individual dates and sources. Targeted coverage; pending physicals and practice windows remain distinct." },
  "/transfer-portal": { title: "Verified NFL Roster & Transaction Wire", description: "Corroborated NFL roster moves with dates, teams and publisher sources. Research coverage and held claims are disclosed." },
  "/stats": { title: "2026 NFL Yardage Leaders Through Week 6", description: "The top five NFL passing, rushing and receiving yardage leaders, checked against NFL and ESPN as of October 20, 2026." },
  "/rankings": { title: "2026 NFL Season Yardage Leaders", description: "Published NFL passing, rushing and receiving yardage leaders through Week 6, with dated NFL and ESPN sources." },
};
