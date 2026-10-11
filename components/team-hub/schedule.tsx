"use client";

import { useState } from "react";
import { ArrowRight, CalendarDays, MapPin, Minus, Tv } from "lucide-react";
import { getTeamBySlug } from "@/lib/cfb-dataset";
import type { LiveScheduleRow } from "@/lib/live-scoreboard";
import type { TeamHubProps } from "@/lib/team-hub";
import { useLiveCheckedLabel } from "@/components/broadcast/live-status";
import {
  GameActionSheet,
  GameActionsButton,
  useGameActionSheet,
} from "@/components/polish/game-actions";
import {
  dateLabel,
  HubEmpty,
  HubHeading,
  HubLink,
  HubMark,
  HubSection,
  published,
} from "./ui";

/** A baked schedule row, plus `live` while the live feed says its game is in progress. */
type ScheduleGame = LiveScheduleRow<NonNullable<TeamHubProps["schedule"]>[number]>;

function ScheduleGameRow({
  game,
  nextGameId,
  referenceDate,
}: {
  game: ScheduleGame;
  nextGameId?: string;
  referenceDate: string;
}) {
  const opponent = game.opponentSlug ? getTeamBySlug(game.opponentSlug) : null;
  const isNext = game.id === nextGameId;
  const actions = useGameActionSheet();
  const gameLabel = `${game.homeAway === "away" ? "At" : "Vs"} ${game.opponent ?? "opponent"}`;

  return (
    <>
      <article
        className="hub-game"
        data-bye={game.isBye}
        data-next={isNext}
        data-live={game.live ? true : undefined}
        {...(!game.isBye ? actions.longPressProps : {})}
      >
        <div className="hub-game-date">
          <span className="hub-eyebrow">
            {game.week != null ? `WEEK ${game.week}` : "WEEK TBD"}
          </span>
          <strong>{dateLabel(game.date, false)}</strong>
        </div>
        {game.isBye ? (
          <div className="hub-game-opponent">
            <span className="hub-bye-mark">
              <Minus size={20} aria-hidden="true" />
            </span>
            <div>
              <h3>Bye week</h3>
              <p>A week to reset.</p>
            </div>
          </div>
        ) : (
          <div className="hub-game-opponent">
            <HubMark
              team={{
                shortName: opponent?.shortName ?? game.opponent ?? "TBD",
                logo: opponent?.logo,
                slug: opponent?.slug,
              }}
            />
            <div>
              <div className="hub-matchup-title">
                <span className="hub-muted">
                  {game.homeAway === "away"
                    ? "at"
                    : game.homeAway === "home"
                      ? "vs"
                      : game.homeAway === "neutral"
                        ? "vs"
                        : ""}
                </span>
                <h3>
                  {opponent?.rank != null ? <small>#{opponent.rank} </small> : null}
                  {opponent ? (
                    <a href={`/teams/${opponent.slug}`}>{opponent.shortName}</a>
                  ) : (
                    published(game.opponent)
                  )}
                </h3>
                {isNext ? <span className="hub-chip hub-chip--gold">UP NEXT</span> : null}
                {game.live ? <span className="hub-chip hub-chip--live">LIVE</span> : null}
              </div>
              <p>
                <MapPin size={14} aria-hidden="true" />
                {game.venue ?? "Venue not published"}
                {game.homeAway === "neutral" ? " · Neutral site" : ""}
              </p>
            </div>
          </div>
        )}
        <div className="hub-game-result">
          {game.isBye ? (
            <span className="hub-muted">OPEN WEEK</span>
          ) : game.live ? (
            <>
              <strong className="font-display" data-live="true">
                <span className="sr-only">Live: </span>
                {game.live.ownScore}–{game.live.opponentScore}
                <small>{game.live.statusLabel ?? "LIVE"}</small>
              </strong>
              <span className="hub-tv">
                <Tv size={14} aria-hidden="true" />
                {game.broadcast ?? "TV not published"}
              </span>
            </>
          ) : game.result ? (
            <strong className="font-display" data-outcome={game.result[0]}>
              {game.result}
              <small>FINAL</small>
            </strong>
          ) : (
            <>
              <strong>
                {game.date && game.date < referenceDate
                  ? "Result not published"
                  : (game.kickoffLabel ?? "Kickoff not published")}
              </strong>
              <span className="hub-tv">
                <Tv size={14} aria-hidden="true" />
                {game.broadcast ?? "TV not published"}
              </span>
            </>
          )}
          {game.href ? (
            <a
              className="hub-game-link"
              href={game.href}
              aria-label={`${game.opponent} game details`}
            >
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          ) : null}
          {!game.isBye ? (
            <GameActionsButton
              className="hub-game-more"
              label={`More actions for ${gameLabel}`}
              onClick={() => actions.setOpen(true)}
            />
          ) : null}
        </div>
      </article>
      {!game.isBye ? (
        <GameActionSheet
          open={actions.open}
          onOpenChange={actions.setOpen}
          gameLabel={gameLabel}
          matchupHref={game.href ?? "/schedule"}
          guideHref="/stadiums"
        />
      ) : null}
    </>
  );
}

export function ScheduleSection({
  schedule,
  season,
  asOf,
  referenceDate,
}: Pick<TeamHubProps, "season" | "asOf" | "referenceDate"> & {
  /** Baked rows with the live overlay already applied (see TeamHub). */
  schedule: ReadonlyArray<ScheduleGame> | null;
}) {
  const liveChecked = useLiveCheckedLabel(
    schedule?.flatMap((game) => (game.eventId ? [game.eventId] : [])),
  );
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const weeks = Array.from({ length: 14 }, (_, index) => index + 1);
  if (schedule?.some((game) => game.week === 0)) weeks.unshift(0);
  const filtered =
    selectedWeek == null
      ? (schedule ?? [])
      : (schedule ?? []).filter((game) => game.week === selectedWeek);
  const visible =
    showAll || selectedWeek != null ? filtered : filtered.slice(0, 5);
  const nextGame = schedule?.find(
    (game) =>
      !game.isBye &&
      !game.result &&
      !game.live &&
      game.date &&
      game.date >= referenceDate,
  );

  return (
    <HubSection id="schedule">
      <HubHeading eyebrow="THE ROAD AHEAD" title={`${season} schedule`}>
        <span className="hub-muted">
          {schedule
            ? `${schedule.filter((game) => !game.isBye).length} games`
            : "Not published"}{" "}
          · Regular season
        </span>
      </HubHeading>
      {schedule?.length ? (
        <>
          <fieldset className="hub-week-strip">
            <legend className="sr-only">Filter schedule by week</legend>
            <button
              type="button"
              className="hub-week"
              aria-pressed={selectedWeek == null}
              onClick={() => setSelectedWeek(null)}
            >
              All
            </button>
            {weeks.map((week) => {
              const rows = schedule.filter((game) => game.week === week);
              const outcome = rows.find((game) => game.result)?.result?.[0];
              const isBye = rows.some((game) => game.isBye);
              const isLive = rows.some((game) => game.live);
              return (
                <button
                  key={week}
                  type="button"
                  className="hub-week"
                  data-outcome={outcome}
                  data-live={isLive ? true : undefined}
                  disabled={!rows.length}
                  aria-label={`Week ${week}${outcome ? `, ${outcome === "W" ? "win" : outcome === "T" ? "tie" : "loss"}` : isLive ? ", live" : isBye ? ", bye" : rows.length ? "" : ", no published game"}`}
                  aria-pressed={selectedWeek === week}
                  onClick={() =>
                    setSelectedWeek(selectedWeek === week ? null : week)
                  }
                >
                  <span>W{week}</span>
                  {outcome ? (
                    <b>{outcome}</b>
                  ) : isBye ? (
                    <Minus size={12} aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </fieldset>
          <div className="hub-card hub-schedule-card">
            <div className="hub-table-labels" aria-hidden="true">
              <span>WEEK / DATE</span>
              <span>MATCHUP</span>
              <span>RESULT / KICKOFF</span>
            </div>
            <div aria-live="polite" className="sr-only">
              {visible.length} schedule entries shown
              {selectedWeek != null ? ` for week ${selectedWeek}` : ""}.
            </div>
            {visible.map((game) => (
              <ScheduleGameRow
                key={game.id}
                game={game}
                nextGameId={nextGame?.id}
                referenceDate={referenceDate}
              />
            ))}
            {selectedWeek == null && filtered.length > 5 ? (
              <button
                className="hub-expand-button"
                type="button"
                aria-expanded={showAll}
                onClick={() => setShowAll(!showAll)}
              >
                <CalendarDays size={16} aria-hidden="true" />
                {showAll
                  ? "Show fewer games"
                  : `View full ${season} schedule (${filtered.length} entries)`}
              </button>
            ) : null}
          </div>
          <div className="hub-section-foot">
            <span>
              Dataset as of {dateLabel(asOf)}. Times shown in Eastern Time.
              {liveChecked
                ? ` Live scores from the ESPN scoreboard feed, checked ${liveChecked}.`
                : ""}
            </span>
            <HubLink href="/watch">Where to watch</HubLink>
          </div>
        </>
      ) : (
        <HubEmpty title="Schedule not published">
          No verified schedule is available for this program. Unlisted weeks are
          not assumed to be byes.
        </HubEmpty>
      )}
    </HubSection>
  );
}
