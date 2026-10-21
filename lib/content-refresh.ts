import editorial from "../data/content-refresh/current-editorial.json" with { type: "json" };
import manifest from "../data/content-refresh/current.json" with { type: "json" };
import nfl from "./nfl-generated.ts";

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
export const refreshAsOf = manifest.sourceAsOf;
export const refreshRevision = nfl.publicationId;
export const refreshFetchedAt = editorial.fetchedAt;
export const refreshCompiledAt = editorial.compiledAt;
export interface ReserveStatus { player: string; team_slug: string; status: string; sources: string[]; asOf?: string; checkedAt?: string; note?: string }
export const reserveStatuses: readonly ReserveStatus[] = editorial.reserveStatuses;
export const refreshWeek = editorial.week;
export interface ModuleSource { sourceAsOf: string | null; fetchedAt: string | null; compiledAt: string | null }
export const moduleSources: Record<string, ModuleSource> = editorial.moduleSources;
export const fantasyResearchAsOf = moduleSources.fantasy.sourceAsOf;
export const resultsAsOf = moduleSources.schedule.sourceAsOf;
export interface InactiveReport {
  gameId: string;
  week: number;
  teamSlug: string;
  publishedAt: string;
  checkedAt: string;
  complete: boolean;
  players: Array<{ name: string; designation: "inactive" | "emergency_qb" }>;
  sources: string[];
}
export const inactiveReports: readonly InactiveReport[] = editorial.inactives as InactiveReport[];
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

export function contentSourceModules(now = new Date(), sources = moduleSources) {
  return [
    { id: "schedule", label: "Schedule, results & standings", note: "Published final scores, Week 7's 14 games and 32 standings are checked with NFL + ESPN. Weeks 8–18: single-source planning schedule; subject to flex.", hours: 48 },
    { id: "injuries", label: "Injury research", note: "Corroborated ledger/watch entries. Practice participation, final designations and inactives are distinct. Two publishers can share an upstream feed.", hours: 24 },
    { id: "inactives", label: "Week 7 game-day inactives", note: "Only published, two-source team lists appear. Missing lists do not imply active status. Emergency third quarterbacks remain separately labeled.", hours: 24 },
    { id: "fantasy", label: "Fantasy decision boards", note: "Early Week 7 half-PPR redraft edition. Conditional editorial tiers; targeted coverage. Ownership and numeric projections withheld.", hours: 48 },
    { id: "transactions", label: "Transaction wire", note: transactionCoverage, hours: 48 },
    { id: "leaders", label: "Season yardage leaders", note: "Top five passing, rushing and receiving leaders through Week 6. NFL + ESPN agreement.", hours: 168 },
  ].map(row => { const source = sources[row.id]; return { ...row, ...source, freshness: sourceFreshness(source.sourceAsOf, now, row.hours) }; });
}
