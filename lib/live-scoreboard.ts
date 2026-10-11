/**
 * Live overlay for the baked NFL snapshot (pure half; no React, DOM, or fetch).
 *
 * `lib/nfl-generated.ts` is a build-time ESPN snapshot and deliberately bakes
 * scores for finals only, so a game that starts or finishes after a deploy
 * still reads "scheduled" until the next deploy. `/api/nfl-scoreboard` carries
 * the fresher state. This module turns that payload into an id-keyed patch map
 * and merges a patch into the shapes the UI renders: dataset games, ticker
 * games, and team-schedule rows. The poller lives in `live-scoreboard-store.ts`.
 *
 * Rules (AGENTS.md: never imply stale or inferred data is live fact):
 * - Games match by ESPN event id only, the id the dataset build bakes into
 *   `Game.id`. No team-name, kickoff-time, or fuzzy matching.
 * - Only in-progress and final events patch. Scheduled, postponed, canceled,
 *   and unknown provider states never touch a baked row.
 * - A degraded, malformed, or empty payload is "no information": the previous
 *   patches stay. It is not evidence that every game reverted.
 * - An in-progress patch that no poll has confirmed for LIVE_STALE_MS reverts
 *   to the baked row. A final is terminal and stays.
 */
import type { NflGameEvent } from "./nfl-scoreboard.ts";
import type { GameStatus } from "./types.ts";

/** An in-progress patch with no confirming poll for this long reverts to the baked row. */
export const LIVE_STALE_MS = 5 * 60_000;

export type LiveGameState = "live" | "final";

export interface LiveGamePatch {
  state: LiveGameState;
  awayScore: number;
  homeScore: number;
  /** Provider detail ("Q3 5:42", "Halftime", "Final/OT"), shown verbatim. */
  statusLabel: string | null;
  /** Epoch ms of the poll that last confirmed this patch; drives stale expiry. */
  seenAt: number;
}

export type LivePatchMap = ReadonlyMap<string, LiveGamePatch>;

export interface LiveScoreboardState {
  patches: LivePatchMap;
  /** Validated events from the last good payload (the finals strip filters these). */
  events: readonly NflGameEvent[];
  /** Epoch ms of the last good poll; null until one succeeds. */
  asOf: number | null;
}

export const EMPTY_LIVE_STATE: LiveScoreboardState = {
  patches: new Map(),
  events: [],
  asOf: null,
};

/* ------------------------------------------------------------ payload → patches */

const isScore = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isLiveOrFinal = (state: unknown) =>
  state === "live" || state === "halftime" || state === "final";

/** Halftime is still a game in progress; the provider label ("Halftime") carries the nuance. */
export function patchFromEvent(
  event: NflGameEvent,
  seenAt: number,
): LiveGamePatch | null {
  const state: LiveGameState | null =
    event.state === "final"
      ? "final"
      : event.state === "live" || event.state === "halftime"
        ? "live"
        : null;
  // Both scores or nothing: one live side next to one baked side is worse than the baked row.
  if (!state || !isScore(event.awayScore) || !isScore(event.homeScore)) return null;
  return {
    state,
    awayScore: event.awayScore,
    homeScore: event.homeScore,
    statusLabel: event.statusLabel || null,
    seenAt,
  };
}

function readEvents(payload: unknown): NflGameEvent[] | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { degraded, events } = payload as { degraded?: unknown; events?: unknown };
  if (degraded === true || !Array.isArray(events)) return null;
  const usable = events.filter(
    (event): event is NflGameEvent =>
      typeof event === "object" &&
      event !== null &&
      typeof (event as NflGameEvent).id === "string" &&
      (event as NflGameEvent).id !== "",
  );
  return usable.length > 0 ? usable : null;
}

const isStale = (patch: LiveGamePatch, now: number) =>
  patch.state === "live" && now - patch.seenAt > LIVE_STALE_MS;

/** Drops in-progress patches nobody has confirmed lately; returns `state` itself when nothing expired. */
export function expireStaleLive(
  state: LiveScoreboardState,
  now: number,
): LiveScoreboardState {
  let expired = false;
  const patches = new Map<string, LiveGamePatch>();
  for (const [id, patch] of state.patches) {
    if (isStale(patch, now)) expired = true;
    else patches.set(id, patch);
  }
  return expired ? { ...state, patches } : state;
}

/**
 * Folds one poll result into the state. `payload` is whatever the poller got
 * (null on any failure); anything that is not a usable, non-degraded payload
 * leaves the patches alone apart from stale expiry.
 *
 * Ids the payload does not speak for are carried over. The route fetches four
 * scoreboard days and drops a day that fails without marking the payload
 * degraded, so a flaky day must not blank that day's live games.
 */
export function reduceLiveScoreboard(
  prev: LiveScoreboardState,
  payload: unknown,
  now: number,
): LiveScoreboardState {
  const events = readEvents(payload);
  if (!events) return expireStaleLive(prev, now);

  const patches = new Map<string, LiveGamePatch>();
  const settled = new Set<string>();
  for (const event of events) {
    const patch = patchFromEvent(event, now);
    if (patch) {
      patches.set(event.id, patch);
      settled.add(event.id);
    } else if (!isLiveOrFinal(event.state)) {
      // An explicit scheduled/postponed/canceled verdict clears any earlier patch.
      settled.add(event.id);
    }
    // A live/final event with unusable scores says nothing reliable: keep what we had.
  }
  for (const [id, patch] of prev.patches) {
    if (!settled.has(id) && !isStale(patch, now)) patches.set(id, patch);
  }
  return { patches, events, asOf: now };
}

/* ------------------------------------------------------------------ merging */

/** The slice of a game the overlay may rewrite. `Game` and `BroadcastGame` both satisfy it. */
export interface LivePatchableGame {
  id: string;
  status: GameStatus;
  statusDetail: string;
  awayScore?: number;
  homeScore?: number;
}

export function applyLivePatch<G extends LivePatchableGame>(
  game: G,
  patch: LiveGamePatch | undefined,
): G {
  if (!patch) return game;
  return {
    ...game,
    status: patch.state,
    // Never fall back to the baked detail: for a scheduled row that is the kickoff text.
    statusDetail: patch.statusLabel ?? (patch.state === "final" ? "Final" : "Live"),
    awayScore: patch.awayScore,
    homeScore: patch.homeScore,
  };
}

/** Returns `games` itself when there is nothing to patch; unpatched rows keep their identity. */
export function patchGames<G extends LivePatchableGame>(
  games: readonly G[],
  patches: LivePatchMap,
): readonly G[] {
  if (patches.size === 0) return games;
  return games.map((game) => applyLivePatch(game, patches.get(game.id)));
}

/* ------------------------------------------------------- team schedule rows */

/** The slice of a team-schedule row the overlay reads. `eventId` is the ESPN event id. */
export interface LiveSchedulable {
  eventId: string | null;
  homeAway: string | null;
  result: string | null;
}

/** Present on a schedule row only while its game is in progress (team's score first). */
export interface LiveScheduleState {
  statusLabel: string | null;
  ownScore: number;
  opponentScore: number;
}

export type LiveScheduleRow<G> = G & { live?: LiveScheduleState };

/** "W 24–17" from the team's side; the same string the dataset bakes for finals. */
export function formatGameResult(own: number, opponent: number): string {
  return `${own > opponent ? "W" : own < opponent ? "L" : "T"} ${own}–${opponent}`;
}

export function applyLiveToScheduleGame<G extends LiveSchedulable>(
  game: G,
  patch: LiveGamePatch | undefined,
): LiveScheduleRow<G> {
  if (!patch || !game.eventId) return game;
  const isHome = game.homeAway === "home";
  // Patch scores are keyed by away/home. A neutral or unknown side cannot be
  // oriented to "our" team, so such a row keeps its baked state.
  if (!isHome && game.homeAway !== "away") return game;
  const own = isHome ? patch.homeScore : patch.awayScore;
  const opponent = isHome ? patch.awayScore : patch.homeScore;
  if (patch.state === "final") {
    return { ...game, result: formatGameResult(own, opponent) };
  }
  // A game in progress has no result yet, whatever the baked row says.
  return {
    ...game,
    result: null,
    live: { statusLabel: patch.statusLabel, ownScore: own, opponentScore: opponent },
  };
}

export function patchScheduleGames<G extends LiveSchedulable>(
  rows: readonly G[],
  patches: LivePatchMap,
): ReadonlyArray<LiveScheduleRow<G>> {
  if (patches.size === 0) return rows;
  return rows.map((row) =>
    applyLiveToScheduleGame(row, row.eventId ? patches.get(row.eventId) : undefined),
  );
}

/* ----------------------------------------------------------- announcements */

export interface LiveTransition<G> {
  game: G;
  patch: LiveGamePatch;
}

/**
 * Games whose effective state moved to live or final between two patch maps.
 * `games` must carry the BAKED status: a baked final that a patch re-confirms
 * as final is not news.
 */
export function liveTransitions<G extends { id: string; status: string }>(
  games: readonly G[],
  before: LivePatchMap,
  after: LivePatchMap,
): Array<LiveTransition<G>> {
  const moved: Array<LiveTransition<G>> = [];
  for (const game of games) {
    const next = after.get(game.id);
    if (!next) continue;
    const was = before.get(game.id)?.state ?? (game.status === "final" ? "final" : "scheduled");
    if (next.state !== was) moved.push({ game, patch: next });
  }
  return moved;
}

export interface LiveAnnouncement {
  to: LiveGameState;
  away: string;
  home: string;
  awayScore: number;
  homeScore: number;
}

/**
 * One short sentence per game that kicked off or finished; never scores or
 * clocks. More than three at once collapses to a count so a full Sunday slate
 * does not queue a paragraph on a screen reader.
 */
export function describeLiveTransitions(items: readonly LiveAnnouncement[]): string {
  if (items.length === 0) return "";
  if (items.length > 3) {
    const live = items.filter((item) => item.to === "live").length;
    const final = items.length - live;
    const parts = [live ? `${live} now live` : "", final ? `${final} final` : ""];
    return `${items.length} games updated: ${parts.filter(Boolean).join(", ")}.`;
  }
  return items
    .map((item) =>
      item.to === "final"
        ? `Final: ${item.away} ${item.awayScore}, ${item.home} ${item.homeScore}.`
        : `${item.away} at ${item.home} is now live.`,
    )
    .join(" ");
}
