export type VerificationStatus =
  | "official"
  | "corroborated"
  | "single_source"
  | "unverified"
  | "disputed"
  | "corrected"
  | "synthetic"
  | "expired";

export type FreshnessState = "current" | "stale" | "expired" | "unavailable";

export interface Provenance {
  provider: string;
  providerRecordId: string;
  sourceUrl?: string;
  sourceDocumentId?: string;
  sourceAsOf: string;
  fetchedAt: string;
  verifiedAt: string;
  verificationStatus: VerificationStatus;
  licenseClass:
    | "R0_FIXTURE"
    | "R1_PUBLIC_DOMAIN"
    | "R2_LINK_ONLY"
    | "R3_CITED_FACTS"
    | "R4_LICENSED_DISPLAY"
    | "R5_LICENSED_DERIVATIVE"
    | "R6_PARTNER"
    | "R7_RESTRICTED";
  confidence: number;
  dataEnvironment: "fixture" | "sandbox" | "production";
  recordOrigin: "fixture" | "provider" | "official_document" | "editorial" | "model";
  freshness: FreshnessState;
  modelVersion?: string;
}

export interface Team {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  abbreviation: string;
  monogram: string;
  conference: string;
  subdivision: "P4" | "G5" | "FCS";
  logo?: string;
  rank?: number;
  record: string;
  color: string;
  strength: number;
  returningProduction: number;
  portalImpact: number;
  playoffProbability: number;
  provenance: Provenance;
}

/** One team's tally from the final scores in the schedule snapshot. */
export interface TeamStanding {
  teamSlug: string;
  division: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

/** "live" is never baked into the snapshot; only the live overlay (lib/live-scoreboard.ts) sets it. */
export type GameStatus = "scheduled" | "live" | "final" | "delayed" | "postponed" | "canceled";

export interface Game {
  id: string;
  week: number;
  /** ET calendar day anchored at 17:00Z -- group and compare by `date.slice(0, 10)`. */
  date: string;
  /** Exact kickoff instant (UTC, ISO-8601) when the provider publishes one; orders games within a day. */
  kickoffUtc?: string;
  kickoffLabel: string;
  status: GameStatus;
  statusDetail: string;
  awayTeamId: string;
  homeTeamId: string;
  awayScore?: number;
  homeScore?: number;
  venueSlug: string;
  venue: string;
  city: string;
  broadcast: string | null;
  weather: { temperature: number; summary: string; windMph: number } | null;
  neutralSite: boolean;
  modelHomeWinProbability: number;
  modelUncertainty: number;
  line?: { home: number; movement: number[]; asOf: string };
  provenance: Provenance;
}

export interface PortalEvent {
  id: string;
  playerSlug: string;
  player: string;
  position: string;
  fromTeamId: string;
  toTeamId: string | null;
  status: "committed" | "enrolled" | "available" | "withdrawn";
  eventDate: string;
  snaps: number | null;
  usage: number | null;
  impact: number | null;
  confidence: "high" | "medium" | "low";
  notes?: string | null;
  sources?: string[];
  provenance: Provenance;
}

export interface ScenarioGame {
  id: string;
  awayTeamId: string;
  homeTeamId: string;
  week: number;
}

export interface SeasonRules {
  id: string;
  season: number;
  label: string;
  playoffTeams: number;
  byes: number;
  membershipVersion: string;
  seedingVersion: string;
  sourceStatus: "fixture" | "verified";
  asOf: string;
}

export interface SimulationTeamResult {
  teamId: string;
  playoff: number;
  bye: number;
  title: number;
  averageSeed: number;
}

export interface SimulationResult {
  seed: string;
  iterations: number;
  converged: boolean;
  maxHalfWidth: number;
  results: SimulationTeamResult[];
  modelVersion: string;
}

export interface Coach {
  id: string;
  slug: string;
  name: string;
  teamId: string;
  title: string;
  contractStart: string;
  contractEnd: string;
  annualSalary: number;
  guaranteedRemaining: number;
  offsetEstimate: number;
  mitigationApplies: boolean;
  hotSeatIndex: number;
  hotSeatCoverage: number;
  record: string;
  timeline: { date: string; label: string; kind: "verified" | "context" }[];
  buyoutSummary?: string | null;
  totalValue?: number | null;
  contractAsOf?: string | null;
  contractNote?: string | null;
  contractSources?: string[];
  provenance: Provenance;
}

export interface DfsPlayer {
  id: string;
  slug: string;
  name: string;
  teamId: string;
  position: "QB" | "RB" | "WR" | "TE";
  slate: "Main" | "Late";
  salary: number;
  floor: number;
  median: number;
  ceiling: number;
  projectedVolume: string;
  matchup: string;
  availability: "active" | "questionable" | "inactive";
  modelVersion: string;
  provenance: Provenance;
}

export interface Stadium {
  slug: string;
  name: string;
  teamId: string;
  city: string;
  address: string;
  capacity: number;
  parking: string;
  transit: string;
  clearBag: string;
  tailgating: string;
  visitorSection: string;
  accessibility: string;
  notes?: string | null;
  sources?: string[];
  lastVerified: string;
  provenance: Provenance;
}

export interface ProviderHealth {
  id: string;
  label: string;
  mode: "fixture" | "production";
  status: "operational" | "not_configured" | "degraded";
  lastSuccess: string | null;
  cadence: string;
  note: string;
}
