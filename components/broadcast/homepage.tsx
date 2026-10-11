"use client";

import { featuredGame, weekGames, type HomepageData } from "@/lib/homepage";
import { FinalsStrip } from "./finals-strip";
import { MarqueeGame } from "./marquee-game";
import { WeekScoreboard } from "./week-scoreboard";
import {
  FantasyLane,
  GamedayLane,
  PortalLane,
  PreseasonLane,
  RankingsLane,
} from "./intelligence-lanes";

export function BroadcastHomepage({
  data,
  cleanMode,
  onModeRequest,
}: {
  data: HomepageData;
  cleanMode: boolean;
  onModeRequest: () => void;
}) {
  const slate = weekGames(data.games, data.referenceDate);
  const featured = featuredGame(slate, data.teams);
  const away = data.teams.find((team) => team.slug === featured?.awayTeamId);
  const home = data.teams.find((team) => team.slug === featured?.homeTeamId);
  const stadium =
    data.stadiums.find((venue) => venue.teamId === home?.slug) ??
    data.stadiums[0];
  const stadiumTeam = data.teams.find((team) => team.slug === stadium?.teamId);

  return (
    <div className="apex-home apex-container">
      <div className="apex-home-intro">
        <div>
          <h1 className="font-display text-balance">
            Every team. <span>Every angle.</span>
          </h1>
          <p>Your front-row seat to all {data.teams.length} NFL teams.</p>
        </div>
        <div className="apex-season-label">
          <span aria-hidden="true" />
          {data.referenceDate.slice(0, 4)}
          <span className="apex-season-word"> SEASON</span>
        </div>
      </div>
      {featured && away && home ? (
        <MarqueeGame
          game={featured}
          away={away}
          home={home}
          venue={
            data.stadiums.find((venue) => venue.teamId === home.slug)?.name
          }
        />
      ) : (
        <section className="apex-marquee">
          <p className="apex-empty">
            This week&apos;s marquee matchup is not published.
          </p>
        </section>
      )}
      <WeekScoreboard
        games={slate}
        teams={data.teams}
        referenceDate={data.referenceDate}
      />
      <FinalsStrip referenceDate={data.referenceDate} />
      <div className="apex-intelligence-grid">
        <RankingsLane
          standings={data.standings}
          teams={data.teams}
          datasetAsOf={data.datasetAsOf}
        />
        <PortalLane
          portalCounts={data.portalCounts}
          teams={data.teams}
          portalAsOf={data.portalAsOf}
        />
      </div>
      <FantasyLane
        fantasyNotes={data.fantasyNotes}
        teams={data.teams}
        fantasyAsOf={data.fantasyAsOf}
        cleanMode={cleanMode}
        onModeRequest={onModeRequest}
      />
      <PreseasonLane
        preseasonRatings={data.preseasonRatings}
        teams={data.teams}
      />
      <GamedayLane stadium={stadium} team={stadiumTeam} />
      <p className="apex-data-note">
        Independent NFL intelligence · Dataset compiled through{" "}
        {data.datasetAsOf} ·{" "}
        <a href="/data-sources" className="underline underline-offset-4">
          Sources & data status
        </a>
      </p>
    </div>
  );
}
