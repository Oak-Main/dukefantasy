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
  let time = Date.parse(sourceAsOf);
  if (sourceAsOf.length === 10) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceAsOf) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== sourceAsOf) return "unavailable";
    // Resolve midnight in Eastern via IANA, including November's EDT/EST
    // transition. Date-only sources retain day precision, never a claimed fetch time.
    const target = time;
    const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    for (let attempt = 0; attempt < 3; attempt++) {
      const p = Object.fromEntries(clock.formatToParts(new Date(time)).map(part => [part.type, part.value]));
      time += target - Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    }
  }
  if (!Number.isFinite(time) || time > now.getTime()) return "unavailable";
  return now.getTime() - time > maxAgeHours * 3_600_000 ? "stale" : "current";
}

export function contentSourceModules(now = new Date(), sources = moduleSources) {
  return [
    { id: "schedule", label: "Schedule, results & standings", note: "107 season finals, Week 7's 14 finals, 32 standings and Week 8's 14 fixtures/four byes checked with NFL + ESPN. Weeks 9–18 remain single-source planning data; subject to flex.", hours: 48 },
    { id: "injuries", label: "Injury research", note: "Full ledger review remains October 20. Week 8 Thursday watch covers CAR/GB only, with October 28 designations and dated practice estimates. McLaurin IR and Newton practice window are partial updates. No all-team recertification. Two publishers can share an upstream feed.", hours: 24 },
    { id: "inactives", label: "Week 7 game-day inactives", note: "Only published, two-source team lists appear. Missing lists do not imply active status. Emergency third quarterbacks remain separately labeled.", hours: 24 },
    { id: "fantasy", label: "Fantasy decision boards", note: "Week 8 waiver/start-sit/trade and Week 7 rookie editions are not published. The October 20 half-PPR redraft edition remains archived; it is not relabeled current. Ownership, usage and numeric projections remain unverified.", hours: 48 },
    { id: "transactions", label: "Transaction wire", note: transactionCoverage, hours: 48 },
    { id: "leaders", label: "Season yardage leaders", note: "Historical October 20 edition through Week 6: NFL + ESPN agreement. Proposed Week 7 leaders remain single-source research and are withheld pending successful corroboration. This is not a comprehensive statistics feed.", hours: 168 },
  ].map(row => { const source = sources[row.id]; return { ...row, ...source, freshness: sourceFreshness(source.sourceAsOf, now, row.hours) }; });
}
