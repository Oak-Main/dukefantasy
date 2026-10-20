import { refreshAsOf, refreshWeek } from "./content-refresh.ts";

export const routeSearchCopy: Record<string, { title: string; description: string }> = {
  "/": { title: `NFL Week ${refreshWeek} Schedule, Results & Fantasy Watch`, description: `Plan NFL Week ${refreshWeek} with kickoff times, TV networks, Week 6 results, standings and sourced fantasy guidance. Researched ${refreshAsOf}.` },
  "/scores": { title: "NFL Scores: Week 6 Results & Week 7 Games", description: "Final NFL scores through Week 6 and the upcoming Week 7 slate, with dated source checks and Eastern kickoff times." },
  "/schedule": { title: "2026 NFL Schedule & Week 7 TV Networks", description: "The full NFL regular-season planning schedule, with Week 7 kickoff times, venues, byes and TV networks. Future flex windows remain subject to change." },
  "/fantasy-desk": { title: "Week 7 Waiver Wire & Early Start/Sit Watch", description: "Sourced Week 7 waiver candidates, conditional lineup tiers, rookie highlights and trade watch notes for redraft half-PPR." },
  "/injuries": { title: `NFL Week 7 Injury Watch: ${refreshAsOf}`, description: "Corroborated injury listings, unresolved availability and return-to-play questions. Estimated walkthroughs retain their actual report dates." },
  "/dfs": { title: "NFL Fantasy Projections & Published-Pick Ledger", description: "How Duke Fantasy publishes and grades pregame picks. Accuracy metrics appear only when real published projections can be evaluated." },
  "/data-sources": { title: "NFL Data Sources, Verification & Freshness", description: "Source dates, collection times, corroboration standards and coverage limits for Duke Fantasy's NFL schedule, results, injuries and fantasy research." },
  "/transactions": { title: "Verified NFL Transactions: October 14–20, 2026", description: "30 corroborated NFL roster moves, with dates, teams, transaction details and links to NFL and ESPN sources. Coverage is a verified subset of the wire." },
  "/transfer-portal": { title: "Verified NFL Roster & Transaction Wire", description: "Corroborated NFL roster moves with dates, teams and publisher sources. Research coverage and held claims are disclosed." },
  "/stats": { title: "2026 NFL Yardage Leaders Through Week 6", description: "The top five NFL passing, rushing and receiving yardage leaders, checked against NFL and ESPN as of October 20, 2026." },
  "/rankings": { title: "2026 NFL Season Yardage Leaders", description: "Published NFL passing, rushing and receiving yardage leaders through Week 6, with dated NFL and ESPN sources." },
};
