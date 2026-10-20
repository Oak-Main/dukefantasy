import editorial from "../data/content-refresh/current-editorial.json" with { type: "json" };

export interface VerifiedTransaction {
  player: string;
  from_team_slug: string | null;
  to_team_slug: string | null;
  position: string | null;
  transaction_type: string;
  date: string;
  status: string;
  detail: string;
  sources: string[];
}
export interface StatLeader {
  category: string;
  rank: number;
  player: string;
  yards: number;
  sources: string[];
}
export interface PracticeReport {
  date: string;
  week: number;
  player: string;
  team_slug: string;
  participation: string;
  report_type: string;
  injury: string;
  sources: string[];
  note: string;
}
export const refreshAsOf = editorial.asOf;
export const refreshFetchedAt = editorial.fetchedAt;
export const refreshCompiledAt = editorial.compiledAt;
export const reserveStatuses = editorial.reserveStatuses;
export const refreshWeek = editorial.week;
export const byeTeams: readonly string[] = editorial.byes;
export const transactions: readonly VerifiedTransaction[] = editorial.transactions.moves;
export const transactionCoverage = editorial.transactions.coverage_note;
export const statLeaders: readonly StatLeader[] = editorial.statLeaders;
export const practiceReports: readonly PracticeReport[] = editorial.practiceReports;
export const refreshLimitations: readonly string[] = editorial.limitations;
export const verificationPolicy = editorial.verification;

/** Status depends on the age of the source, never the time this build ran. */
export function sourceFreshness(sourceAsOf: string | null, now = new Date(), maxAgeHours = 48): "current" | "stale" | "unavailable" {
  if (!sourceAsOf) return "unavailable";
  const time = Date.parse(sourceAsOf.length === 10 ? `${sourceAsOf}T00:00:00-04:00` : sourceAsOf);
  if (!Number.isFinite(time)) return "unavailable";
  return now.getTime() - time > maxAgeHours * 3_600_000 ? "stale" : "current";
}

export function contentSourceModules(now = new Date()) {
  return [
    { id: "schedule", label: "Schedule, results & standings", note: "93 final scores, Week 7's 14 games and 32 standings corroborated with NFL + ESPN. Weeks 8–18: single-source planning schedule; subject to flex.", hours: 48 },
    { id: "injuries", label: "Injury research", note: "399 corroborated ledger/watch entries. Final Week 7 designations are pending. Two publishers can share an upstream feed.", hours: 24 },
    { id: "fantasy", label: "Fantasy decision boards", note: "Early Week 7 half-PPR redraft edition. Conditional editorial tiers; targeted coverage. Ownership and numeric projections withheld.", hours: 48 },
    { id: "transactions", label: "Transaction wire", note: transactionCoverage, hours: 48 },
    { id: "leaders", label: "Season yardage leaders", note: "Top five passing, rushing and receiving leaders through Week 6. NFL + ESPN agreement.", hours: 168 },
  ].map(row => ({ ...row, sourceAsOf: refreshAsOf, fetchedAt: refreshFetchedAt, compiledAt: refreshCompiledAt, freshness: sourceFreshness(refreshAsOf, now, row.hours) }));
}
