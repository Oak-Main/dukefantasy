import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_POLL_MS,
  LIVE_REQUEST_TIMEOUT_MS,
  LIVE_SCOREBOARD_ENDPOINT,
  createLiveScoreboardStore,
  type LiveScoreboardEnv,
} from "../lib/live-scoreboard-store.ts";
import { EMPTY_LIVE_STATE, LIVE_STALE_MS } from "../lib/live-scoreboard.ts";
import type { NflGameEvent } from "../lib/nfl-scoreboard.ts";

/* A deterministic browser: manual clock, hand-resolved fetches, scriptable visibility. */
function harness() {
  let now = 1_800_000_000_000;
  let nextId = 1;
  let hidden = false;
  const timers = new Map<number, { run: () => void; at: number; every?: number }>();
  const visibility = new Set<() => void>();
  const requests: Array<{
    url: string;
    signal: AbortSignal;
    respond(body: unknown, ok?: boolean): void;
    fail(error?: unknown): void;
    brokenJson(): void;
  }> = [];
  let envCreated = 0;

  const env: LiveScoreboardEnv = {
    fetch: (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
        requests.push({
          url,
          signal: init.signal,
          respond: (body, ok = true) => resolve({ ok, json: async () => body }),
          fail: (error = new Error("network down")) => reject(error),
          brokenJson: () =>
            resolve({ ok: true, json: async () => Promise.reject(new SyntaxError("bad json")) }),
        });
      }),
    now: () => now,
    setInterval: (run, ms) => {
      const id = nextId++;
      timers.set(id, { run, at: now + ms, every: ms });
      return id;
    },
    clearInterval: (id) => void timers.delete(id as number),
    setTimeout: (run, ms) => {
      const id = nextId++;
      timers.set(id, { run, at: now + ms });
      return id;
    },
    clearTimeout: (id) => void timers.delete(id as number),
    isHidden: () => hidden,
    onVisibilityChange: (run) => {
      visibility.add(run);
      return () => void visibility.delete(run);
    },
  };

  return {
    store: createLiveScoreboardStore(() => {
      envCreated += 1;
      return env;
    }),
    requests,
    timers,
    visibility,
    get envCreated() {
      return envCreated;
    },
    get now() {
      return now;
    },
    /** Moves the clock, firing due timers in order. */
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        now = timer.at;
        if (timer.every) timer.at += timer.every;
        else timers.delete(id);
        timer.run();
      }
      now = target;
    },
    setHidden(value: boolean) {
      hidden = value;
      for (const run of [...visibility]) run();
    },
  };
}

/** Lets pending promise continuations run. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function event(overrides: Partial<NflGameEvent> = {}): NflGameEvent {
  return {
    id: "401000001",
    utc: "2026-10-11T17:00Z",
    home: "Washington",
    away: "Indianapolis",
    homeScore: 20,
    awayScore: 17,
    state: "live",
    statusLabel: "Q3 5:42",
    venue: null,
    ...overrides,
  };
}

const feed = (events: NflGameEvent[], degraded = false) => ({
  events,
  asOf: "2026-10-11T17:05:00.000Z",
  source: degraded ? "none" : "espn",
  degraded,
});

test("nothing happens until the first subscriber; the server snapshot is always empty", async () => {
  const h = harness();
  assert.equal(h.envCreated, 0, "importing and creating the store is inert");
  assert.equal(h.requests.length, 0);
  assert.equal(h.store.getSnapshot(), EMPTY_LIVE_STATE);
  const unsubscribe = h.store.subscribe(() => {});
  assert.equal(h.envCreated, 1);
  h.requests[0].respond(feed([event()]));
  await flush();
  assert.equal(h.store.getSnapshot().patches.size, 1);
  assert.equal(h.store.getServerSnapshot(), EMPTY_LIVE_STATE, "hydration must match the server render");
  unsubscribe();
});

test("the first subscriber fetches immediately; later subscribers share the same poller", () => {
  const h = harness();
  const first = h.store.subscribe(() => {});
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, LIVE_SCOREBOARD_ENDPOINT);
  const second = h.store.subscribe(() => {});
  assert.equal(h.requests.length, 1, "no second request for a second consumer");
  assert.equal(h.envCreated, 1);
  assert.equal(h.visibility.size, 1, "one visibility listener, not one per consumer");
  first();
  assert.equal(h.requests[0].signal.aborted, false, "still has a subscriber");
  assert.equal(h.visibility.size, 1);
  second();
});

test("polls every 60s while visible", async () => {
  const h = harness();
  const unsubscribe = h.store.subscribe(() => {});
  h.requests[0].respond(feed([event()]));
  await flush();
  h.advance(LIVE_POLL_MS - 1);
  assert.equal(h.requests.length, 1);
  h.advance(1);
  assert.equal(h.requests.length, 2);
  h.requests[1].respond(feed([event({ awayScore: 24 })]));
  await flush();
  assert.equal(h.store.getSnapshot().patches.get("401000001")?.awayScore, 24);
  h.advance(LIVE_POLL_MS);
  assert.equal(h.requests.length, 3);
  unsubscribe();
});

test("a hidden tab does not poll, and becoming visible refetches immediately", async () => {
  const h = harness();
  const unsubscribe = h.store.subscribe(() => {});
  h.requests[0].respond(feed([event()]));
  await flush();

  h.setHidden(true);
  assert.equal(h.requests.length, 1, "hiding the tab fetches nothing");
  h.advance(LIVE_POLL_MS * 5);
  assert.equal(h.requests.length, 1, "timer ticks are skipped while hidden");

  h.setHidden(false);
  assert.equal(h.requests.length, 2, "visibilitychange to visible refetches at once");
  h.requests[1].respond(feed([event({ awayScore: 31 })]));
  await flush();
  assert.equal(h.store.getSnapshot().patches.get("401000001")?.awayScore, 31);
  unsubscribe();
});

test("never has two requests in flight", async () => {
  const h = harness();
  const unsubscribe = h.store.subscribe(() => {});
  h.advance(LIVE_POLL_MS); // first request still pending
  assert.equal(h.requests.length, 1);
  h.setHidden(true);
  h.setHidden(false); // visibility refetch while pending is also skipped
  assert.equal(h.requests.length, 1);
  h.requests[0].respond(feed([event()]));
  await flush();
  h.advance(LIVE_POLL_MS);
  assert.equal(h.requests.length, 2);
  unsubscribe();
});

test("the last unsubscribe aborts the request in flight and stops everything", async () => {
  const h = harness();
  const notified: string[] = [];
  const unsubscribe = h.store.subscribe(() => notified.push("tick"));
  assert.equal(h.requests.length, 1);
  unsubscribe();
  assert.equal(h.requests[0].signal.aborted, true, "aborted on unmount");
  assert.equal(h.timers.size, 0, "interval and request timeout are cleared");
  assert.equal(h.visibility.size, 0, "visibility listener removed");
  await flush();
  assert.deepEqual(notified, [], "an aborted poll publishes nothing");
  assert.equal(h.store.getSnapshot(), EMPTY_LIVE_STATE);
  h.advance(LIVE_POLL_MS * 10);
  h.setHidden(false);
  assert.equal(h.requests.length, 1, "no polling after unmount");
  unsubscribe(); // idempotent
});

test("resubscribing (React strict-mode style) restarts cleanly and ignores the aborted poll", async () => {
  const h = harness();
  const first = h.store.subscribe(() => {});
  first();
  const second = h.store.subscribe(() => {});
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal(h.requests[1].signal.aborted, false);
  // A late answer from the aborted request must not be applied.
  h.requests[0].respond(feed([event({ id: "STALE" })]));
  h.requests[1].respond(feed([event({ id: "FRESH" })]));
  await flush();
  assert.deepEqual([...h.store.getSnapshot().patches.keys()], ["FRESH"]);
  second();
});

test("every failure mode leaves the baked rendering alone and tells nobody", async () => {
  const h = harness();
  let notified = 0;
  const unsubscribe = h.store.subscribe(() => {
    notified += 1;
  });
  h.requests[0].fail();
  await flush();
  h.advance(LIVE_POLL_MS);
  h.requests[1].respond({ error: "boom" }, false); // HTTP 500
  await flush();
  h.advance(LIVE_POLL_MS);
  h.requests[2].brokenJson();
  await flush();
  h.advance(LIVE_POLL_MS);
  h.requests[3].respond(feed([], true)); // degraded 200
  await flush();
  h.advance(LIVE_POLL_MS);
  h.requests[4].respond("<html>gateway timeout</html>");
  await flush();
  assert.equal(h.requests.length, 5, "keeps polling through failures");
  assert.equal(notified, 0, "no state change, no re-render");
  assert.equal(h.store.getSnapshot(), EMPTY_LIVE_STATE);
  unsubscribe();
});

test("a good poll publishes; later failures keep it until it goes stale; finals outlive the outage", async () => {
  const h = harness();
  let notified = 0;
  const unsubscribe = h.store.subscribe(() => {
    notified += 1;
  });
  h.requests[0].respond(
    feed([
      event({ id: "LIVE" }),
      event({ id: "DONE", state: "final", statusLabel: "Final", awayScore: 24, homeScore: 17 }),
    ]),
  );
  await flush();
  assert.equal(notified, 1);
  assert.deepEqual([...h.store.getSnapshot().patches.keys()].sort(), ["DONE", "LIVE"]);
  const confirmedAt = h.now;

  // Outage: the baked-plus-last-good rendering holds, silently.
  h.advance(LIVE_POLL_MS);
  h.requests[1].fail();
  await flush();
  assert.equal(notified, 1);
  assert.deepEqual([...h.store.getSnapshot().patches.keys()].sort(), ["DONE", "LIVE"]);

  // Long outage: the in-progress score is no longer vouched for and reverts; the final stays.
  for (let i = 2; h.now - confirmedAt <= LIVE_STALE_MS; i += 1) {
    h.advance(LIVE_POLL_MS);
    h.requests[i].fail();
    await flush();
  }
  assert.deepEqual([...h.store.getSnapshot().patches.keys()], ["DONE"]);
  assert.equal(notified, 2, "exactly one more notification, when the live score expired");
  unsubscribe();
});

test("a hung request is abandoned after the timeout so polling continues", async () => {
  const h = harness();
  const unsubscribe = h.store.subscribe(() => {});
  assert.equal(h.requests[0].signal.aborted, false);
  h.advance(LIVE_REQUEST_TIMEOUT_MS);
  assert.equal(h.requests[0].signal.aborted, true, "timed out");
  await flush();
  h.advance(LIVE_POLL_MS - LIVE_REQUEST_TIMEOUT_MS);
  assert.equal(h.requests.length, 2, "the next tick is not blocked by the hung one");
  unsubscribe();
});

test("resubscribing after a long gap drops live scores that aged out meanwhile", async () => {
  const h = harness();
  let off = h.store.subscribe(() => {});
  h.requests[0].respond(feed([event({ id: "LIVE" })]));
  await flush();
  off();
  assert.equal(h.store.getSnapshot().patches.size, 1, "kept for a quick remount");
  h.advance(LIVE_STALE_MS + 1);
  off = h.store.subscribe(() => {});
  assert.equal(h.store.getSnapshot().patches.size, 0, "expired before anything renders it");
  off();
});

test("a tab that opens hidden makes no request until it is first shown", () => {
  const h = harness();
  h.setHidden(true); // before anyone subscribes
  const unsubscribe = h.store.subscribe(() => {});
  assert.equal(h.requests.length, 0, "no request for a background tab");
  h.advance(LIVE_POLL_MS * 3);
  assert.equal(h.requests.length, 0, "and no polling while it stays hidden");
  h.setHidden(false);
  assert.equal(h.requests.length, 1, "first request when it becomes visible");
  unsubscribe();
});
