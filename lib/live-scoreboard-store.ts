/**
 * Shared poller for `/api/nfl-scoreboard` (framework-free; the React binding is
 * `components/broadcast/use-live-scoreboard.ts`).
 *
 * One store serves every consumer on the page (ticker, scoreboard, game header,
 * team schedule), so a page makes one request a minute no matter how many
 * components overlay live scores, and they all show the same snapshot.
 *
 * - Polls every LIVE_POLL_MS, but not while the tab is hidden.
 * - Refetches as soon as the tab becomes visible again.
 * - Starts with the first subscriber; the last unsubscribe aborts the request
 *   in flight, stops the timer, and removes the listener.
 * - Never throws and never exposes an error: a failed, hung, non-OK, or
 *   unparseable poll is "no information" and the baked data keeps rendering
 *   (see `reduceLiveScoreboard`).
 * - The server snapshot is always empty, so server and first client render
 *   agree and hydration never mismatches.
 *
 * The browser is only touched through `LiveScoreboardEnv`, created when the
 * first subscriber arrives, so importing this module during SSR is inert.
 */
import {
  EMPTY_LIVE_STATE,
  expireStaleLive,
  reduceLiveScoreboard,
  type LiveScoreboardState,
} from "./live-scoreboard.ts";

export const LIVE_SCOREBOARD_ENDPOINT = "/api/nfl-scoreboard";
export const LIVE_POLL_MS = 60_000;
/** A hung connection must not block every later poll. */
export const LIVE_REQUEST_TIMEOUT_MS = 15_000;

/** Everything the poller touches outside itself, so tests can drive it deterministically. */
export interface LiveScoreboardEnv {
  fetch(
    url: string,
    init: { signal: AbortSignal },
  ): Promise<{ ok: boolean; json(): Promise<unknown> }>;
  now(): number;
  setInterval(run: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  isHidden(): boolean;
  /** Registers a visibility listener and returns its remover. */
  onVisibilityChange(run: () => void): () => void;
}

export function browserEnv(): LiveScoreboardEnv {
  return {
    fetch: (url, init) => fetch(url, init),
    now: () => Date.now(),
    setInterval: (run, ms) => setInterval(run, ms),
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    setTimeout: (run, ms) => setTimeout(run, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    isHidden: () => document.visibilityState === "hidden",
    onVisibilityChange: (run) => {
      document.addEventListener("visibilitychange", run);
      return () => document.removeEventListener("visibilitychange", run);
    },
  };
}

export interface LiveScoreboardStore {
  /** `useSyncExternalStore`-compatible. */
  subscribe(listener: () => void): () => void;
  getSnapshot(): LiveScoreboardState;
  getServerSnapshot(): LiveScoreboardState;
}

export function createLiveScoreboardStore(
  makeEnv: () => LiveScoreboardEnv = browserEnv,
): LiveScoreboardStore {
  let state = EMPTY_LIVE_STATE;
  const listeners = new Set<() => void>();
  let env: LiveScoreboardEnv | undefined;
  let inFlight: AbortController | undefined;
  let requestTimer: unknown;
  let interval: unknown;
  let stopVisibility: (() => void) | undefined;

  const publish = (next: LiveScoreboardState) => {
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener();
  };

  const poll = async () => {
    const current = env;
    if (!current || inFlight) return;
    const request = new AbortController();
    inFlight = request;
    const timeout = current.setTimeout(() => request.abort(), LIVE_REQUEST_TIMEOUT_MS);
    requestTimer = timeout;
    let body: unknown = null;
    try {
      const response = await current.fetch(LIVE_SCOREBOARD_ENDPOINT, {
        signal: request.signal,
      });
      body = response.ok ? await response.json() : null;
    } catch {
      body = null;
    } finally {
      current.clearTimeout(timeout);
      if (requestTimer === timeout) requestTimer = undefined;
    }
    // Unsubscribed (and maybe resubscribed) while in flight: this result is not ours to publish.
    if (inFlight !== request) return;
    inFlight = undefined;
    publish(reduceLiveScoreboard(state, body, current.now()));
  };

  const start = () => {
    const current = makeEnv();
    env = current;
    // Data kept from an earlier subscription may have aged out while nobody listened.
    publish(expireStaleLive(state, current.now()));
    // A tab opened in the background waits for its first visibilitychange.
    if (!current.isHidden()) void poll();
    interval = current.setInterval(() => {
      if (!current.isHidden()) void poll();
    }, LIVE_POLL_MS);
    stopVisibility = current.onVisibilityChange(() => {
      if (!current.isHidden()) void poll();
    });
  };

  const stop = () => {
    const current = env;
    if (!current) return;
    current.clearInterval(interval);
    current.clearTimeout(requestTimer);
    stopVisibility?.();
    inFlight?.abort();
    inFlight = undefined;
    requestTimer = undefined;
    interval = undefined;
    stopVisibility = undefined;
    env = undefined;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        if (!listeners.delete(listener)) return;
        if (listeners.size === 0) stop();
      };
    },
    getSnapshot: () => state,
    getServerSnapshot: () => EMPTY_LIVE_STATE,
  };
}
