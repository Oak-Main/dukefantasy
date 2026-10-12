"use client";

import { useMemo } from "react";
import { slateFinals, type BroadcastGame } from "@/lib/homepage";
import { LaneHeading } from "./primitives";
import { useLiveScoreboard } from "./use-live-scoreboard";

/**
 * Week-so-far finals rail for the homepage. Reads the /api/nfl-scoreboard
 * live feed through the shared hook (one poll a minute for the whole page);
 * degrades to nothing (hidden) until the feed has answered, and keeps the last
 * good answer through a later failure. The homepage never shows an error
 * surface for live data. Port of the CFB Apex finals strip onto the NFL feed.
 *
 * "The week" is the homepage slate, matched by ESPN event id, so the rail, the
 * marquee and this strip always name the same NFL week.
 */
export function FinalsStrip({ games }: { games: readonly BroadcastGame[] }) {
  const { events } = useLiveScoreboard();

  const finals = useMemo(() => slateFinals(events, games), [events, games]);

  if (finals.length === 0) return null;

  const anchor = finals.reduce((best, event) =>
    Math.abs((event.awayScore ?? 0) - (event.homeScore ?? 0)) >
    Math.abs((best.awayScore ?? 0) - (best.homeScore ?? 0))
      ? event
      : best,
  );
  const rest = finals.filter((event) => event.id !== anchor.id).slice(0, 6);
  const anchorAwayWon = (anchor.awayScore ?? 0) > (anchor.homeScore ?? 0);

  return (
    <section className="apex-lane" aria-labelledby="gdc-finals-title">
      <LaneHeading
        id="gdc-finals-title"
        eyebrow="ON THE BOARD"
        title="The week so far"
        href="/scores"
        linkLabel="All scores"
      />
      <div className="apex-gdc-finals">
        <div className="apex-gdc-upset" data-testid="gdc-upset">
          <span className="apex-gdc-upset-tag">BIGGEST MARGIN</span>
          <p className="apex-gdc-upset-matchup">
            <span className={anchorAwayWon ? "apex-gdc-winner" : undefined}>
              {anchor.away}
            </span>
            <strong className="apex-gdc-upset-score">
              {anchor.awayScore}–{anchor.homeScore}
            </strong>
            <span className={!anchorAwayWon ? "apex-gdc-winner" : undefined}>
              {anchor.home}
            </span>
          </p>
        </div>
        {rest.length > 0 && (
          <ul className="apex-gdc-final-rail">
            {rest.map((event) => {
              const awayWon = (event.awayScore ?? 0) > (event.homeScore ?? 0);
              return (
                <li key={event.id}>
                  <span className={awayWon ? "apex-gdc-winner" : undefined}>
                    {event.away} {event.awayScore}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className={!awayWon ? "apex-gdc-winner" : undefined}>
                    {event.home} {event.homeScore}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="apex-data-note">
        Finals feed: live NFL scoreboard via the site scoreboard API · scores as
        reported · refreshes with the live board.
      </p>
    </section>
  );
}
