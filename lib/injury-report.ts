/**
 * Weekly Injury Report — data layer (NFL).
 *
 * Two layers, kept separate on purpose:
 *  1. ESPN BASE — injury statuses fetched live by the Worker (/api/injuries)
 *     and snapshotted into the build. Always attributed to ESPN.
 *  2. EDITORIAL RESEARCH — practice participation, likelihood-to-play with
 *     confidence, and sourced sentiment from news + verified social accounts.
 *     Ingested weekly from data/injury-research/current.json via
 *     scripts/ingest-injury-research.mjs. Absent file = nothing published.
 *
 * Long-term ledger = Injured Reserve or expected out MORE than 2 weeks.
 * Everything else that is uncertain lives in the week-to-week watch.
 * Null means not published — never zero, never guessed.
 */

import nfl from "./nfl-generated.ts";
import { teams } from "./cfb-dataset.ts";
import type { Team } from "./types.ts";

/* ------------------------------------------------------------------ types */

export type InjuryStatus = "IR" | "OUT" | "QUESTIONABLE" | "DOUBTFUL" | "SUSPENSION" | "ACTIVE";
export type PracticeStatus = "DNP" | "LP" | "FP";
export type Likelihood = "likely" | "questionable" | "doubtful" | "unlikely";
export type Confidence = "high" | "medium" | "low";
export type GameDesignation = "OUT" | "DOUBTFUL" | "QUESTIONABLE" | "NO_DESIGNATION";

/** One player's injury as ESPN publishes it (live + build snapshot). */
export interface EspnInjuryEntry {
  player: string;
  teamSlug: string;
  position: string | null;
  status: InjuryStatus;
  detail: string | null;
  asOf: string | null;
}

/** Editorial long-term entry — IR or expected out more than 2 weeks. */
export interface InjuryLedgerEntry {
  player: string;
  teamSlug: string;
  position: string | null;
  injury: string | null;
  status: "IR" | "OUT";
  /** Expected weeks remaining out; must be > 2 for a non-IR ledger entry. */
  weeksOut: number | null;
  detail: string | null;
  sources: string[];
  social: string[];
  confidence: Confidence | null;
}

/** Editorial week-to-week watch entry. */
export interface InjuryWatchEntry {
  player: string;
  teamSlug: string;
  position: string | null;
  injury: string | null;
  publishedStatus: GameDesignation | null;
  designationDate: string | null;
  designationPhase: "injury_report" | "in_game" | null;
  practice: { mon?: PracticeStatus | null; tue?: PracticeStatus | null; wed: PracticeStatus | null; thu: PracticeStatus | null; fri: PracticeStatus | null; sat: PracticeStatus | null };
  likelihood: Likelihood | null;
  confidence: Confidence | null;
  note: string | null;
  sources: string[];
  social: string[];
}

export interface InjuryResearchDoc {
  week: number | null;
  asOf: string | null;
  ledger: InjuryLedgerEntry[];
  watch: InjuryWatchEntry[];
}

/* ------------------------------------------------- editorial (vendored doc) */

interface GeneratedInjuryResearch {
  week?: number | null;
  as_of?: string | null;
  ledger?: unknown[];
  watch?: unknown[];
}

const researchDoc = (nfl as { injuryResearch?: GeneratedInjuryResearch }).injuryResearch ?? {};

function mapPractice(row: Record<string, unknown>): InjuryWatchEntry["practice"] {
  const practice = (row.practice ?? {}) as Record<string, unknown>;
  const norm = (value: unknown): PracticeStatus | null =>
    value === "DNP" || value === "LP" || value === "FP" ? value : null;
  return {
    mon: norm(practice.mon ?? row.practice_mon),
    tue: norm(practice.tue ?? row.practice_tue),
    wed: norm(practice.wed ?? row.practice_wed),
    thu: norm(practice.thu ?? row.practice_thu),
    fri: norm(practice.fri ?? row.practice_fri),
    sat: norm(practice.sat ?? row.practice_sat),
  };
}

export const injuryResearch: InjuryResearchDoc = {
  week: researchDoc.week ?? null,
  asOf: researchDoc.as_of ?? null,
  ledger: ((researchDoc.ledger ?? []) as Array<Record<string, unknown>>).map((row) => ({
    player: String(row.player ?? ""),
    teamSlug: String(row.team_slug ?? ""),
    position: (row.position as string | null) ?? null,
    injury: (row.injury as string | null) ?? null,
    status: row.status === "IR" ? ("IR" as const) : ("OUT" as const),
    weeksOut: typeof row.weeks_out === "number" ? row.weeks_out : null,
    detail: (row.detail as string | null) ?? null,
    sources: (row.sources as string[]) ?? [],
    social: (row.social as string[]) ?? [],
    confidence: (row.confidence as Confidence | null) ?? null,
  })),
  watch: ((researchDoc.watch ?? []) as Array<Record<string, unknown>>).map((row) => ({
    player: String(row.player ?? ""),
    teamSlug: String(row.team_slug ?? ""),
    position: (row.position as string | null) ?? null,
    injury: (row.injury as string | null) ?? null,
    publishedStatus: (row.published_status as GameDesignation | null) ?? null,
    designationDate: (row.designation_date as string | null) ?? null,
    designationPhase: (row.designation_phase as InjuryWatchEntry["designationPhase"]) ?? null,
    practice: mapPractice(row),
    likelihood: (row.likelihood as Likelihood | null) ?? null,
    confidence: (row.confidence as Confidence | null) ?? null,
    note: (row.note as string | null) ?? null,
    sources: (row.sources as string[]) ?? [],
    social: (row.social as string[]) ?? [],
  })),
};

/* ----------------------------------------------------- ESPN base (snapshot) */

interface GeneratedEspnInjuries {
  asOf?: string | null;
  entries?: unknown[];
}

const espnDoc = (nfl as { espnInjuries?: GeneratedEspnInjuries }).espnInjuries ?? { entries: [] };

export const espnInjuries: EspnInjuryEntry[] = ((espnDoc.entries ?? []) as Array<Record<string, unknown>>).map(
  (row) => ({
    player: String(row.player ?? ""),
    teamSlug: String(row.team_slug ?? ""),
    position: (row.position as string | null) ?? null,
    status: row.status as InjuryStatus,
    detail: (row.detail as string | null) ?? null,
    asOf: (row.as_of as string | null) ?? null,
  }),
);

export const espnInjuriesAsOf: string | null = espnDoc.asOf ?? null;

export const ESPN_INJURY_FEED = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries";

/* ------------------------------------------------------------ long-term rule */

export const LONG_TERM_MIN_WEEKS = 3; // "more than 2 weeks"

export function isLongTerm(entry: {
  status: InjuryStatus | "IR" | "OUT";
  weeksOut?: number | null;
}): boolean {
  if (entry.status === "IR") return true;
  if (entry.weeksOut != null && entry.weeksOut >= LONG_TERM_MIN_WEEKS) return true;
  return false;
}

/** ESPN base entries that qualify for the long-term ledger on their own. */
export function espnLedgerEntries(): EspnInjuryEntry[] {
  return espnInjuries.filter((entry) => entry.status === "IR");
}

/** ESPN base entries for the week-to-week board (uncertain statuses only). */
export function espnWatchEntries(): EspnInjuryEntry[] {
  return espnInjuries.filter(
    (entry) => entry.status === "QUESTIONABLE" || entry.status === "DOUBTFUL" || entry.status === "OUT",
  );
}

/* ------------------------------------------------ deterministic likelihood */

/**
 * Fallback likelihood model from the latest published practice status.
 * Editorial research always overrides this — the model exists so every
 * watch row shows an explainable basis when no analyst note exists.
 */
export function likelihoodFromPractice(practice: InjuryWatchEntry["practice"]): {
  likelihood: Likelihood | null;
  confidence: Confidence | null;
  basis: string | null;
} {
  const days: Array<[keyof InjuryWatchEntry["practice"], PracticeStatus]> = [
    ["wed", practice.wed],
    ["thu", practice.thu],
    ["fri", practice.fri],
    ["sat", practice.sat],
  ].filter((pair): pair is [keyof InjuryWatchEntry["practice"], PracticeStatus] => pair[1] != null) as Array<
    [keyof InjuryWatchEntry["practice"], PracticeStatus]
  >;
  if (days.length === 0) return { likelihood: null, confidence: null, basis: null };
  const [latestDay, latest] = days[days.length - 1];
  const basis = `Latest reported status (${latestDay.toUpperCase()}): ${latest}`;
  if (latest === "FP") return { likelihood: "likely", confidence: "high", basis };
  if (latest === "LP") return { likelihood: "questionable", confidence: "medium", basis };
  // DNP — the later in the week, the more telling.
  if (latestDay === "wed") return { likelihood: "questionable", confidence: "low", basis };
  return { likelihood: "doubtful", confidence: latestDay === "sat" ? "high" : "medium", basis };
}

/* --------------------------------------------------------- publishing slots */

export interface InjurySlot {
  id: string;
  label: string;
  /** 0=Sunday … 6=Saturday, in America/Los_Angeles. */
  weekdays: number[];
  /** Minutes after midnight, Pacific Time. */
  minuteOfDay: number;
  endMinuteOfDay?: number;
  intervalMinutes?: number;
  daysLabel: string;
  scope: string;
}

export const INJURY_CADENCE: InjurySlot[] = [
  { id: "daily-morning", label: "Injury and results review", weekdays: [0, 1, 2, 3, 4, 5, 6], daysLabel: "Daily, October 28–November 3", minuteOfDay: 9 * 60 + 15, scope: "Planned editorial review of practice reports, official designations and completed results" },
  { id: "daily-afternoon", label: "Afternoon reconciliation", weekdays: [0, 1, 2, 3, 4, 5, 6], daysLabel: "Daily, October 28–November 3", minuteOfDay: 16 * 60 + 15, scope: "Planned reconciliation of new reports, score corrections and standings" },
  { id: "game-windows", label: "Checks every 30 minutes", weekdays: [0, 1, 4], daysLabel: "Thursday, Sunday and Monday", minuteOfDay: 4 * 60, endMinuteOfDay: 22 * 60 + 30, intervalMinutes: 30, scope: "Around actual game windows, including the early Sunday game. Inactive checks begin 90 minutes before kickoff; results publish after corroboration." },
];

export function nextInjurySlot(now: Date = new Date()): { slot: InjurySlot; at: Date } | null {
  // A bounded editorial plan, not an external job. Enumerate actual instants
  // through the IANA zone: November 1 changes PDT to PST. UTC scanning also
  // handles repeated/skipped local clock times without a fixed offset.
  let best: { slot: InjurySlot; at: Date } | null = null;
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const start = Math.max(Date.parse("2026-10-28T07:00:00Z"), Math.floor(now.getTime() / 60_000) * 60_000 + 60_000);
  for (let instant = start; instant < Date.parse("2026-11-04T08:00:00Z"); instant += 60_000) {
    const p = Object.fromEntries(clock.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
    const minute = Number(p.hour) * 60 + Number(p.minute);
    for (const slot of INJURY_CADENCE) {
      if (!slot.weekdays.includes(weekday) || minute < slot.minuteOfDay || minute > (slot.endMinuteOfDay ?? slot.minuteOfDay)) continue;
      if ((minute - slot.minuteOfDay) % (slot.intervalMinutes ?? 1) !== 0) continue;
      best = { slot, at: new Date(instant) };
      return best;
    }
  }
  return best;
}

/* -------------------------------------------------------------- page helpers */

export function teamBySlugForInjuries(): Map<string, Team> {
  return new Map(teams.map((team) => [team.slug, team]));
}

export function injuryCounts() {
  return {
    espnLedger: espnLedgerEntries().length,
    espnWatch: espnWatchEntries().length,
    researchLedger: injuryResearch.ledger.length,
    researchWatch: injuryResearch.watch.length,
    researchAsOf: injuryResearch.asOf,
  };
}

export const INJURY_METHOD = {
  ledger: "The long-term ledger lists players on Injured Reserve or expected out more than 2 weeks — week-to-week game-time decisions never belong here.",
  watch: "The watch carries verified practice participation (DNP/LP/FP) plus likelihood to play, graded with a stated confidence and sourced from beat reporting, team releases, and verified player social accounts (X, Instagram).",
  sentiment: "Sentiment is evidence, not vibes: a likelihood call must cite a beat report, team release, or verified-account post. Unverified aggregators and speculation accounts are never sources.",
  schedule: "The corroborated board retains its published research date. Practice reports carry their actual date and week. Planned editorial slots are not proof an update was published.",
} as const;
