/**
 * Live NFL scoreboard normalization for ESPN's public scoreboard feed.
 *
 * Pure module: the API route performs the fetches, this file maps the raw
 * provider events onto the compact shape the ticker overlay and the finals
 * strip render. Event ids are ESPN event ids — the same ids the dataset
 * build bakes into `games`, so the client overlay matches games exactly
 * instead of by name heuristics. On any upstream failure the route degrades
 * to an empty event list and the live surfaces hide themselves (no error
 * surface on the landing page).
 */

export type NflGameState =
  | "scheduled"
  | "live"
  | "halftime"
  | "final"
  | "postponed"
  | "canceled"
  | "other";

export interface NflGameEvent {
  id: string;
  /** ISO-8601 UTC instant. */
  utc: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  state: NflGameState;
  /** Raw provider detail for states the widgets do not model exactly ("Q3 - 5:42"). */
  statusLabel: string | null;
  venue: string | null;
}

export interface NflScoreboardPayload {
  events: NflGameEvent[];
  /** When the events were read from their provider. For the TheSportsDB
   * fallback this is the cache copy's own fetch time, not the request time. */
  asOf: string;
  source: "espn" | "thesportsdb" | "none";
  /** True when the upstream feed failed — callers hide. */
  degraded: boolean;
}

/** The subset of the ESPN scoreboard event this module consumes. */
export interface EspnCompetitor {
  homeAway?: string | null;
  score?: string | number | null;
  team?: {
    abbreviation?: string | null;
    shortDisplayName?: string | null;
    displayName?: string | null;
  } | null;
}

export interface EspnRawEvent {
  id?: string | number | null;
  date?: string | null;
  status?: {
    type?: {
      state?: string | null;
      completed?: boolean | null;
      detail?: string | null;
      shortDetail?: string | null;
    } | null;
  } | null;
  competitions?: Array<{
    venue?: { fullName?: string | null } | null;
    competitors?: EspnCompetitor[] | null;
  }> | null;
}

function parseScore(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function teamLabel(competitor: EspnCompetitor | undefined): string | null {
  const team = competitor?.team;
  if (!team) return null;
  return team.shortDisplayName || team.abbreviation || team.displayName || null;
}

export function mapEspnStatus(
  state: string | null | undefined,
  completed: boolean | null | undefined,
  detail: string | null | undefined,
): NflGameState {
  if (state === "pre") return "scheduled";
  if (state === "in") {
    return /halftime/i.test(detail ?? "") ? "halftime" : "live";
  }
  if (state === "post") {
    if (completed) return "final";
    if (/postponed/i.test(detail ?? "")) return "postponed";
    if (/cancel/i.test(detail ?? "")) return "canceled";
    return "final";
  }
  return "other";
}

export function espnEventToNflEvent(event: EspnRawEvent): NflGameEvent | null {
  const id = event.id != null ? String(event.id) : null;
  const competition = event.competitions?.[0];
  const home = competition?.competitors?.find((c) => c.homeAway === "home");
  const away = competition?.competitors?.find((c) => c.homeAway === "away");
  if (!id || !event.date || !home || !away) return null;
  const type = event.status?.type;
  const detail = type?.shortDetail ?? type?.detail ?? null;
  return {
    id,
    utc: event.date,
    home: teamLabel(home) ?? "Home",
    away: teamLabel(away) ?? "Away",
    homeScore: parseScore(home.score),
    awayScore: parseScore(away.score),
    state: mapEspnStatus(type?.state, type?.completed, type?.detail),
    statusLabel: detail,
    venue: competition?.venue?.fullName ?? null,
  };
}

/** Map + dedupe across the fetched days (ESPN can repeat an event on
 * border-of-window days); sorted oldest-first for stable rendering. */
export function mapEspnScoreboard(events: readonly EspnRawEvent[]): NflGameEvent[] {
  const byId = new Map<string, NflGameEvent>();
  for (const event of events) {
    const mapped = espnEventToNflEvent(event);
    if (mapped) byId.set(mapped.id, mapped);
  }
  return [...byId.values()].sort((a, b) => a.utc.localeCompare(b.utc) || a.id.localeCompare(b.id));
}

/** The scoreboard days worth polling, in US Eastern game dates. ESPN indexes
 * a game by its ET calendar day (a 8:15pm ET kickoff is 00:15Z the next day
 * but is served under its ET day), so the window must be ET-local or evening
 * games fall out. Span is two days back through one ahead: NFL weeks run
 * Thursday→Monday, so on a Saturday that covers Thursday/Friday finals,
 * anything in progress, and the Sunday slate. */
export function scoreboardWindowDays(now: Date): string[] {
  const etDay = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date).replaceAll("-", "");
  const today = etDay(now);
  const [y, m, d] = [Number(today.slice(0, 4)), Number(today.slice(4, 6)), Number(today.slice(6, 8))];
  const etNoonThisMonth = Date.UTC(y, m - 1, d, 12);
  return [-2, -1, 0, 1].map((offset) => {
    const shifted = new Date(etNoonThisMonth + offset * 86_400_000);
    return etDay(shifted);
  });
}

/* ------------------------------------------------- TheSportsDB finals fallback
 *
 * When ESPN's unofficial scoreboard answers nothing (it went dark for match-day.live
 * in September 2026), the route falls back to TheSportsDB's NFL league feed read
 * through the portfolio's TrueAPI ingest cache (ingest.oakandmain.dev — no key in
 * this site). That copy refreshes about hourly, so it is never treated as live:
 *
 * - FINALS ONLY. An in-progress row in an hour-old copy ("Q2" with an old score) is
 *   exactly the stale-as-live claim AGENTS.md forbids, so only finished games pass.
 * - EXACT IDENTITY, SERVER-SIDE. A TheSportsDB game becomes an NflGameEvent only if
 *   both team names equal a dataset team's full name, and exactly one dataset game has
 *   that away/home pair within MATCH_WINDOW_MS of the TheSportsDB kickoff. It then
 *   carries that game's ESPN id, so the client overlay's id-only matching rule holds.
 *   Anything ambiguous or unmapped is dropped, never guessed.
 * - Scores must be non-negative integers on both sides.
 */

/** The subset of a TheSportsDB v1 event this module consumes. */
export interface TsdbRawEvent {
  idEvent?: string | null;
  strTimestamp?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  intHomeScore?: string | number | null;
  intAwayScore?: string | number | null;
  strStatus?: string | null;
  strVenue?: string | null;
}

/** Dataset shapes the reconciliation needs (lib/nfl-generated.ts `teams` / `schedule`). */
export interface ReconcileTeam { name: string; shortName: string; slug: string }
export interface ReconcileGame { id: string; awaySlug: string; homeSlug: string; kickoffUtc?: string | null; venue?: string | null }

/** An NFL team plays at most once in this window, so a pair inside it is one game. */
export const MATCH_WINDOW_MS = 36 * 3_600_000;

const TSDB_FINAL = new Set(["FT", "AOT", "AET", "MATCH FINISHED", "FINISHED"]);
const TSDB_OVERTIME = new Set(["AOT", "AET"]);

function tsdbInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function strictScore(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  return Number.parseInt(text, 10);
}

export function reconcileTsdbFinals(
  events: readonly TsdbRawEvent[],
  teams: readonly ReconcileTeam[],
  schedule: readonly ReconcileGame[],
): NflGameEvent[] {
  const byName = new Map(teams.map((team) => [team.name, team]));
  const out = new Map<string, NflGameEvent>();
  for (const event of events) {
    const status = String(event.strStatus ?? "").trim().toUpperCase();
    if (!TSDB_FINAL.has(status)) continue;
    const away = byName.get(String(event.strAwayTeam ?? ""));
    const home = byName.get(String(event.strHomeTeam ?? ""));
    const at = tsdbInstant(event.strTimestamp);
    const awayScore = strictScore(event.intAwayScore);
    const homeScore = strictScore(event.intHomeScore);
    if (!away || !home || at == null || awayScore == null || homeScore == null) continue;
    const matches = schedule.filter((game) => {
      if (game.awaySlug !== away.slug || game.homeSlug !== home.slug) return false;
      const kickoff = tsdbInstant(game.kickoffUtc);
      return kickoff != null && Math.abs(kickoff - at) <= MATCH_WINDOW_MS;
    });
    if (matches.length !== 1) continue;
    const game = matches[0];
    out.set(game.id, {
      id: game.id,
      utc: game.kickoffUtc as string,
      home: home.shortName,
      away: away.shortName,
      homeScore,
      awayScore,
      state: "final",
      statusLabel: TSDB_OVERTIME.has(status) ? "Final/OT" : "Final",
      venue: game.venue ?? event.strVenue ?? null,
    });
  }
  return [...out.values()].sort((a, b) => a.utc.localeCompare(b.utc) || a.id.localeCompare(b.id));
}
