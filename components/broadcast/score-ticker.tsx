"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";
import {
  dateLabel,
  kickoffTime,
  published,
  type BroadcastGame,
  type BroadcastTeam,
} from "@/lib/homepage";
import { patchGames } from "@/lib/live-scoreboard";
import { TeamMark } from "./primitives";
import { useLiveScoreboard } from "./use-live-scoreboard";

export function ScoreTicker({
  games,
  teams,
}: {
  games: readonly BroadcastGame[];
  teams: readonly BroadcastTeam[];
}) {
  const rail = useRef<HTMLElement>(null);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const { patches } = useLiveScoreboard();
  const bySlug = new Map(teams.map((team) => [team.slug, team]));

  // Live overlay: the dataset bakes at deploy time; the shared hook patches
  // in-progress scores and fresh finals in from /api/nfl-scoreboard between
  // deploys, matched by ESPN event id. On any failure the baked dataset keeps
  // rendering untouched.
  const patchedGames = useMemo(() => patchGames(games, patches), [games, patches]);

  useEffect(() => {
    if (
      !playing ||
      hovered ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    let frame: number;
    let last = 0;
    const move = (time: number) => {
      const element = rail.current;
      if (element && last) {
        element.scrollLeft += Math.min(time - last, 50) * 0.025;
        if (element.scrollLeft >= element.scrollWidth - element.clientWidth - 1)
          element.scrollLeft = 0;
      }
      last = time;
      frame = requestAnimationFrame(move);
    };
    frame = requestAnimationFrame(move);
    return () => cancelAnimationFrame(frame);
  }, [playing, hovered]);

  const scroll = (direction: number) => {
    setPlaying(false);
    rail.current?.scrollBy({
      left: direction * 225,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };

  return (
    <section className="apex-ticker" aria-label="NFL score ticker">
      <div className="apex-container apex-ticker-inner">
        <div className="apex-ticker-label">
          <span className="apex-eyebrow">ON THE BOARD</span>
          <a href="/scores" className="font-display">
            NFL SCORES
            <ChevronRight size={16} aria-hidden="true" />
          </a>
          <div>
            <button
              className="apex-ticker-control"
              onClick={() => scroll(-1)}
              type="button"
              aria-label="Previous ticker games"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              className="apex-ticker-control"
              onClick={() => setPlaying((value) => !value)}
              type="button"
              aria-label={playing ? "Pause score ticker" : "Play score ticker"}
              aria-pressed={playing}
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <button
              className="apex-ticker-control"
              onClick={() => scroll(1)}
              type="button"
              aria-label="Next ticker games"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <section
          className="apex-ticker-rail"
          ref={rail}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setPlaying(false)}
          onTouchStart={() => setPlaying(false)}
          tabIndex={0}
          aria-label="Scrollable game results and upcoming games"
        >
          {patchedGames.length === 0 && (
            <div className="apex-ticker-empty">
              <p>Games are not published for this window.</p>
              <a href="/schedule">Open the full schedule</a>
            </div>
          )}
          {patchedGames.map((game) => {
            const away = bySlug.get(game.awayTeamId);
            const home = bySlug.get(game.homeTeamId);
            if (!away || !home) return null;
            const hasScore = game.status === "final" || game.status === "live";
            const statusText =
              game.status === "live"
                ? (game.statusDetail ?? "live")
                : hasScore
                  ? game.status
                  : dateLabel(game.date);
            return (
              <a
                className="apex-ticker-game"
                href={`/games/${game.id}`}
                key={game.id}
                aria-label={`${away.shortName} at ${home.shortName}, ${game.status}, ${hasScore ? `${published(game.awayScore)} to ${published(game.homeScore)}` : kickoffTime(game)}`}
              >
                <div className="apex-ticker-status">
                  <span data-live={game.status === "live"}>
                    {statusText}
                  </span>
                  {game.broadcast && <b>{game.broadcast}</b>}
                </div>
                <div className="apex-ticker-team">
                  <TeamMark team={away} size="xs" />
                  <span>
                    {away.rank != null && <small>{away.rank}</small>}
                    {away.abbreviation}
                  </span>
                  <strong className="font-display">
                    {hasScore ? published(game.awayScore) : ""}
                  </strong>
                </div>
                <div className="apex-ticker-team">
                  <TeamMark team={home} size="xs" />
                  <span>
                    {home.rank != null && <small>{home.rank}</small>}
                    {home.abbreviation}
                  </span>
                  <strong className="font-display">
                    {hasScore ? published(game.homeScore) : ""}
                  </strong>
                </div>
                {!hasScore && (
                  <span className="apex-ticker-time">{kickoffTime(game)}</span>
                )}
              </a>
            );
          })}
        </section>
        <a
          className="apex-ticker-all"
          href="/scores"
          aria-label="View all scores"
        >
          <ArrowRight size={20} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
