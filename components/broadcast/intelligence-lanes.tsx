import Image from "next/image";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import {
  conferenceLabel,
  formatPointDifferential,
  formatRecord,
  playerSlug,
  published,
  teamStyle,
  topStandings,
  type BroadcastTeam,
  type HomepageData,
  type StadiumPreview,
} from "@/lib/homepage";
import { BroadcastButton, LaneHeading, TeamMark } from "./primitives";

export function RankingsLane({
  standings,
  teams,
  datasetAsOf,
}: Pick<HomepageData, "standings" | "teams" | "datasetAsOf">) {
  const bySlug = new Map(teams.map((team) => [team.slug, team]));
  const rows = topStandings(
    standings.filter((row) => bySlug.has(row.teamSlug)),
  );
  return (
    <section className="apex-lane" aria-labelledby="rankings-title">
      <LaneHeading
        id="rankings-title"
        eyebrow="THE LEAGUE PICTURE"
        title="Standings"
        href="/conferences"
        linkLabel="Divisions"
      />
      <div className="apex-rank-board">
        <div className="apex-rank-board-top">
          <strong>NFL STANDINGS</strong>
          <span>Record · Point diff</span>
        </div>
        {rows.length === 0 && (
          <p className="apex-empty">
            No games are final yet. Team records by division are on the{" "}
            <a href="/conferences">Divisions</a> page.
          </p>
        )}
        {rows.map((row) => {
          const team = bySlug.get(row.teamSlug);
          if (!team) return null;
          return (
            <a
              className="apex-rank-row"
              href={`/teams/${team.slug}`}
              key={row.teamSlug}
            >
              <span className="apex-rank-number">{row.rank}</span>
              <TeamMark team={team} size="sm" />
              <span className="apex-rank-name">
                <strong>{team.shortName}</strong>
                <small>{row.division || conferenceLabel(team.conference)}</small>
              </span>
              <span className="apex-rank-record">
                <span className="sr-only">Record </span>
                {formatRecord(row)}
              </span>
              <strong className="apex-rank-points">
                <span className="sr-only">Point differential </span>
                {formatPointDifferential(row.pointDifferential)}
              </strong>
            </a>
          );
        })}
      </div>
      <p className="apex-data-note">
        Top 5 by win percentage, then point differential; a tie counts as half
        a win. Records are tallied from final scores in the ESPN NFL schedule
        data · As of {datasetAsOf}. Not official seeding.
      </p>
    </section>
  );
}

export function PortalLane({
  portalCounts,
  teams,
  portalAsOf,
}: Pick<HomepageData, "portalCounts" | "teams" | "portalAsOf">) {
  const bySlug = new Map(teams.map((team) => [team.slug, team]));
  const rows = portalCounts
    .filter((row) => bySlug.has(row.teamSlug))
    .slice(0, 4);
  return (
    <section className="apex-lane" aria-labelledby="portal-title">
      <LaneHeading
        id="portal-title"
        eyebrow="NEW FITS. NEW THREADS."
        title="Transaction wire"
        href="/transfer-portal"
        linkLabel="Roster moves"
      />
      <div className="apex-portal-grid">
        {rows.length === 0 && (
          <p className="apex-empty">Transaction data not published.</p>
        )}
        {rows.map((row) => {
          const team = bySlug.get(row.teamSlug);
          if (!team) return null;
          return (
            <a
              className="apex-portal-card"
              href={`/transfer-portal/${team.slug}`}
              style={teamStyle(team.color)}
              key={team.slug}
            >
              <div className="apex-portal-top">
                <TeamMark team={team} />
                <div>
                  <h3>{team.shortName}</h3>
                  <span>{conferenceLabel(team.conference)}</span>
                </div>
              </div>
              <div className="apex-portal-counts">
                <div>
                  <strong data-published={row.incoming != null}>
                    {published(row.incoming)}
                  </strong>
                  <span>
                    <ArrowDownLeft size={14} aria-hidden="true" />
                    Acquired
                  </span>
                </div>
                <div>
                  <strong data-published={row.outgoing != null}>
                    {published(row.outgoing)}
                  </strong>
                  <span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                    Traded away
                  </span>
                </div>
              </div>
            </a>
          );
        })}
      </div>
      <p className="apex-data-note">
        Recorded moves, not complete team totals · As of{" "}
        {portalAsOf ?? "Not published"}.
      </p>
    </section>
  );
}

export function FantasyLane({
  fantasyNotes,
  teams,
  fantasyAsOf,
  cleanMode,
  onModeRequest,
}: Pick<HomepageData, "fantasyNotes" | "teams" | "fantasyAsOf"> & {
  cleanMode: boolean;
  onModeRequest: () => void;
}) {
  const bySlug = new Map(teams.map((team) => [team.slug, team]));
  const notes = [...fantasyNotes]
    .filter((note) => bySlug.has(note.team))
    .slice(0, 6);
  return (
    <section className="apex-lane" aria-labelledby="fantasy-title">
      <LaneHeading
        id="fantasy-title"
        eyebrow="YOUR LINEUP. YOUR EDGE."
        title="Fantasy starts"
        href="/dfs"
        linkLabel="Fantasy hub"
      />
      <div className="apex-fantasy-grid">
        {notes.length === 0 && (
          <p className="apex-empty">Player notes not published.</p>
        )}
        {notes.map((note) => {
          const team = bySlug.get(note.team);
          if (!team) return null;
          return (
            <a
              className="apex-player-card"
              href={cleanMode ? "/dfs" : `/players/${playerSlug(note.player)}`}
              key={note.id}
            >
              <TeamMark team={team} size="md" />
              <span className="apex-player-info">
                <strong>{note.player}</strong>
                <span>
                  <b>{published(note.position)}</b> · {team.shortName}
                </span>
                <small>
                  {cleanMode
                    ? "Analyst rank hidden in Clean Mode"
                    : (note.projection?.value ?? "Not published")}
                </small>
                {!cleanMode && note.projection?.outlet && (
                  <small>{note.projection.outlet}</small>
                )}
              </span>
            </a>
          );
        })}
      </div>
      <div className="apex-fantasy-notice">
        <span>
          Published Week 1 notes · As of {fantasyAsOf ?? "Not published"}. Not a
          current-week recommendation.
        </span>
        {cleanMode && (
          <button type="button" onClick={onModeRequest}>
            <ShieldCheck size={14} aria-hidden="true" />
            Review fantasy disclosure
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}

export function PreseasonLane({
  preseasonRatings,
  teams,
}: Pick<HomepageData, "preseasonRatings" | "teams">) {
  const rows = teams
    .map((team) => ({ team, rating: preseasonRatings[team.slug] }))
    .filter((row) => row.rating?.sp != null)
    .sort(
      (a, b) =>
        (a.rating.sp?.rank ?? Infinity) - (b.rating.sp?.rank ?? Infinity),
    )
    .slice(0, 5);
  return (
    <section className="apex-lane" aria-labelledby="preseason-title">
      <LaneHeading
        id="preseason-title"
        eyebrow="BEYOND THE POLL"
        title="Preseason numbers"
        href="/rankings"
        linkLabel="All ratings"
      />
      <div className="apex-rating-strip">
        {rows.length === 0 && (
          <p className="apex-empty">SP+ ratings not published.</p>
        )}
        {rows.map(({ team, rating }) => (
          <a
            className="apex-rating-item"
            href={`/teams/${team.slug}`}
            key={team.slug}
          >
            <span>{published(rating.sp?.rank)}</span>
            <TeamMark team={team} size="sm" />
            <div>
              <span>{team.shortName}</span>
              <strong>
                {rating.sp?.overall == null
                  ? "Not published"
                  : `${rating.sp.overall > 0 ? "+" : ""}${rating.sp.overall.toFixed(1)}`}
              </strong>
              <small>SP+ rating</small>
            </div>
          </a>
        ))}
      </div>
      <p className="apex-data-note">
        Published preseason SP+ · Bill Connelly / ESPN · Not an in-season
        forecast.
      </p>
    </section>
  );
}

export function GamedayLane({
  stadium,
  team,
}: {
  stadium?: StadiumPreview;
  team?: BroadcastTeam;
}) {
  return (
    <section className="apex-lane" aria-labelledby="gameday-title">
      <LaneHeading
        id="gameday-title"
        eyebrow="THE GAME IS ONLY HALF THE TRIP"
        title="Gameday"
        href="/stadiums"
        linkLabel="All stadium guides"
      />
      {stadium ? (
        <article
          className="apex-gameday-card"
          style={teamStyle(team?.color ?? "var(--primary)")}
        >
          <div className="apex-gameday-image">
            {stadium.image && (
              <Image
                sizes="(max-width: 600px) 100vw, 50vw"
                src={stadium.image}
                alt={
                  stadium.imageIsIllustration
                    ? "Illustrative pro football stadium atmosphere, not a photograph of this venue"
                    : stadium.name
                }
                width={1024}
                height={1024}
                loading="lazy"
                unoptimized
                decoding="async"
              />
            )}
            {stadium.imageIsIllustration && (
              <span>Stadium atmosphere · Illustration</span>
            )}
          </div>
          <div className="apex-gameday-copy">
            <div className="apex-gameday-location">
              <MapPin size={16} aria-hidden="true" />
              {published(stadium.city)}
            </div>
            <h3 className="text-balance">{stadium.name}</h3>
            <p>
              <strong>
                {stadium.capacity > 0
                  ? stadium.capacity.toLocaleString("en-US")
                  : "Not published"}
              </strong>{" "}
              capacity {team ? `· Home of ${team.name}` : ""}
            </p>
            <p>Parking. Tailgating. The way to your seat.</p>
            <BroadcastButton href={`/stadiums/${stadium.slug}`}>
              Explore the stadium guide
            </BroadcastButton>
          </div>
        </article>
      ) : (
        <p className="apex-empty">Stadium guide not published.</p>
      )}
    </section>
  );
}
