"use client";

import { useEffect, useRef, useState } from "react";
import {
  describeLiveTransitions,
  liveTransitions,
  type LivePatchMap,
} from "@/lib/live-scoreboard";
import { useLiveScoreboard } from "./use-live-scoreboard";

const CHECKED_AT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
});

/**
 * When the live feed was last read, e.g. "3:42 PM EDT", but only if it is
 * currently changing something on this page: pass the ESPN event ids the page
 * shows, or none to mean "anything". Null otherwise, so a page the overlay is
 * not touching claims nothing about live data.
 */
export function useLiveCheckedLabel(ids?: readonly string[]): string | null {
  const { patches, asOf } = useLiveScoreboard();
  if (asOf == null) return null;
  const active = ids ? ids.some((id) => patches.has(id)) : patches.size > 0;
  return active ? CHECKED_AT.format(asOf) : null;
}

/** Source label for scores that come from the live feed rather than the dataset. */
export function LiveFreshness({ ids }: { ids?: readonly string[] }) {
  const checked = useLiveCheckedLabel(ids);
  if (!checked) return null;
  return (
    <span className="freshness freshness--live">
      <span aria-hidden="true" />
      Live feed · checked {checked}
    </span>
  );
}

export interface LiveAnnouncerGame {
  id: string;
  /** The BAKED status; the announcer compares it with what the patches say. */
  status: string;
  away: string;
  home: string;
}

/**
 * Polite live region for games that kick off or finish while the page is open.
 *
 * It speaks state changes only, at most once per poll (a minute), never scores
 * or clocks, and never for what was already true when the page loaded: the
 * first data after mount is the baseline. Visible score and clock text updates
 * silently; nothing here announces per second. The region is always mounted,
 * and empty until there is news, so assistive tech has it registered before
 * its text changes.
 */
export function LiveScoreAnnouncer({ games }: { games: readonly LiveAnnouncerGame[] }) {
  const { patches, asOf } = useLiveScoreboard();
  const [message, setMessage] = useState("");
  const watched = useRef(games);
  const lastSeen = useRef<LivePatchMap | null>(null);

  useEffect(() => {
    watched.current = games;
  });

  useEffect(() => {
    if (asOf == null) return;
    const before = lastSeen.current;
    lastSeen.current = patches;
    if (!before) return;
    const text = describeLiveTransitions(
      liveTransitions(watched.current, before, patches).map(({ game, patch }) => ({
        to: patch.state,
        away: game.away,
        home: game.home,
        awayScore: patch.awayScore,
        homeScore: patch.homeScore,
      })),
    );
    if (text) setMessage(text);
  }, [patches, asOf]);

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
