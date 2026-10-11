/**
 * Fantasy Desk — weekly decision boards (research prompts 11-14).
 *
 * Four rails, each fail-closed exactly like the injury layer: absent research
 * ships an honest "not published" shell, never a placeholder row. Boards are
 * DECISION layers — no projections live here (those belong to the DFS ledger),
 * and every claim of fact must arrive with its sources from the ingest step.
 * Null means not published; nothing is ever backfilled silently.
 *
 * Cadence (2026 season):
 *   Waiver Wire Watch  — Tuesday after MNF  (edition for the FOLLOWING week)
 *   Start/Sit Tiers    — Thursday (Saturday edition carries final injury news)
 *   Rookie Usage       — Tuesday (after the week completes)
 *   Trade Values       — Wednesday (rest-of-season; meaningful from Week 2)
 */

import nfl from "./nfl-generated.ts";

/* ------------------------------------------------------------------- types */

export type DeskPosition = "QB" | "RB" | "WR" | "TE" | "FLEX" | "DST" | "K";
export type Hold = "stream" | "rest_of_season";
export type Confidence = "high" | "medium" | "low";
export type SitTier = "start_confidence" | "start_if_needed" | "fringe" | "sit";
export type Trend = "rising" | "steady" | "fading";
export type FantasyMeaning = "waiver_relevant" | "bench_stash" | "dynasty_only";
export type Market = "buy_low" | "sell_high" | "fair";

/** Prompt 11 — Waiver Wire Watch (adds under 55% ESPN rostered + drops). */
export interface WaiverAdd {
  player: string;
  team_slug: string;
  position: DeskPosition;
  ownership_pct: number | null; // ESPN/FantasyPros as published; never estimated
  why: string;
  hold: Hold;
  confidence: Confidence;
  sources: string[];
}
export interface WaiverDrop {
  player: string;
  team_slug: string;
  why: string;
  sources: string[];
}
export interface WaiverBoard {
  as_of: string;
  week_adding_for: number;
  adds: WaiverAdd[];
  drops: WaiverDrop[];
  priority_note: string;
}

/** Prompt 12 — Start/Sit Tier Board (decisions, not projections). */
export interface TierRow {
  player: string;
  team_slug: string;
  note: string;
}
export interface TierGroup {
  tier: SitTier;
  players: TierRow[];
}
export interface StartSitPosition {
  position: string;
  tiers: TierGroup[];
}
export interface ToughCall {
  player: string;
  team_slug: string;
  verdict: string;
}
export interface StartSitBoard {
  as_of: string;
  week: number;
  positions: StartSitPosition[];
  tough_calls: ToughCall[];
}

/** Prompt 13 — Rookie Usage Report (usage only, no projections). */
export interface RookieRow {
  player: string;
  team_slug: string;
  position: string;
  draft_round: number | null;
  snaps: number | null;
  team_snaps: number | null;
  snap_share_pct: number | null;
  targets_or_carries: number | null;
  trend: Trend;
  why: string;
  fantasy_meaning: FantasyMeaning;
  sources: string[];
}
export interface RookieBoard {
  as_of: string;
  week: number;
  rookies: RookieRow[];
}

/** Prompt 14 — Trade Value Big Board (internally consistent tiers + swings). */
export interface TradeRow {
  player: string;
  team_slug: string;
  tier: number; // 1 (elite) .. 5 (depth)
  basis: string;
  market: Market;
}
export interface TradeBoardGroup {
  position: string;
  rows: TradeRow[];
}
export interface SwingTrade {
  give: string;
  get: string;
  rationale: string;
}
export interface TradeBoard {
  as_of: string;
  week: number;
  boards: TradeBoardGroup[];
  swing_trades: SwingTrade[];
}

export interface FantasyDeskDoc {
  waiver: WaiverBoard | null;
  startSit: StartSitBoard | null;
  rookie: RookieBoard | null;
  trade: TradeBoard | null;
}

/* ------------------------------------------------------- generated binding */

type GeneratedFantasyDesk = {
  waiver?: WaiverBoard | null;
  start_sit?: StartSitBoard | null;
  rookie?: RookieBoard | null;
  trade?: TradeBoard | null;
};

const doc = (nfl as { fantasyDesk?: GeneratedFantasyDesk }).fantasyDesk ?? {};

export const fantasyDesk: FantasyDeskDoc = {
  waiver: doc.waiver && Array.isArray(doc.waiver.adds) ? doc.waiver : null,
  startSit: doc.start_sit && Array.isArray(doc.start_sit.positions) ? doc.start_sit : null,
  rookie: doc.rookie && Array.isArray(doc.rookie.rookies) ? doc.rookie : null,
  trade: doc.trade && Array.isArray(doc.trade.boards) ? doc.trade : null,
};

export const TIER_LABELS: Record<SitTier, string> = {
  start_confidence: "Start with confidence",
  start_if_needed: "Start if you need it",
  fringe: "Fringe — size of the target",
  sit: "Sit",
};

export const TIER_ORDER: SitTier[] = ["start_confidence", "start_if_needed", "fringe", "sit"];

/* --------------------------------------------------------------- freshness */

const season = (nfl as { season?: { currentWeek?: number | null } }).season;

/** ESPN's NFL week in play when the snapshot was compiled (null = unknown). */
export const currentNflWeek: number | null =
  typeof season?.currentWeek === "number" ? season.currentWeek : null;

export type DeskBoardKey = "waiver" | "startSit" | "rookie" | "trade";

/**
 * Which week a staged board speaks to, and whether that is current for the
 * cadence. Start/Sit and Trade cover the week in play; the Waiver edition is
 * published Tuesday for the FOLLOWING week; Rookie usage is published Tuesday
 * for the week just completed (so it is current one week behind). A board that
 * is behind is still shown -- with its week and date -- but never as "live".
 */
export function deskBoardStatus(
  key: DeskBoardKey,
  doc: FantasyDeskDoc = fantasyDesk,
  weekInPlay: number | null = currentNflWeek,
): { covers: number; current: boolean | null } | null {
  const board = doc[key];
  if (!board) return null;
  const covers = key === "waiver" ? (board as WaiverBoard).week_adding_for : (board as StartSitBoard | RookieBoard | TradeBoard).week;
  if (weekInPlay === null) return { covers, current: null };
  const required = key === "rookie" ? weekInPlay - 1 : weekInPlay;
  return { covers, current: covers >= required };
}

/** Honest shell copy while a rail awaits its cadence slot. */
export const DESK_CADENCE = [
  { key: "waiver", label: "Waiver Wire Watch", slot: "Tuesday after MNF (edition covers the following week)" },
  { key: "startSit", label: "Start/Sit Tier Board", slot: "Thursday — Saturday edition carries final injury news" },
  { key: "rookie", label: "Rookie Usage Report", slot: "Tuesday after the week completes" },
  { key: "trade", label: "Trade Value Big Board", slot: "Wednesday (rest-of-season values)" },
] as const;
