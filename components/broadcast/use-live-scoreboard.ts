"use client";

import { useSyncExternalStore } from "react";
import type { LiveScoreboardState } from "@/lib/live-scoreboard";
import { createLiveScoreboardStore } from "@/lib/live-scoreboard-store";

/** One poller for the whole page; see lib/live-scoreboard-store.ts for its lifecycle. */
const store = createLiveScoreboardStore();

/**
 * Live overlay state for the baked NFL snapshot.
 *
 * Returns the id-keyed patch map (`patches`, keyed by ESPN event id), the
 * events of the last good poll (`events`), and when that poll happened
 * (`asOf`). Until a poll succeeds, and on the server, it is empty, so
 * rendering falls through to the baked data. There is no error state: a failed
 * or degraded feed just leaves things as they were.
 *
 * Merge with `patchGames` / `applyLivePatch` / `patchScheduleGames` from
 * `@/lib/live-scoreboard`. Any number of components may call this; they share
 * one request a minute, which starts with the first and stops with the last.
 */
export function useLiveScoreboard(): LiveScoreboardState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
