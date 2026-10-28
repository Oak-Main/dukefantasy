"use client";

import { byeTeams, fantasyResearchAsOf, refreshWeek, transactions } from "@/lib/content-refresh";
import { featuredGame, weekGames, type HomepageData } from "@/lib/homepage";
import { FinalsStrip } from "./finals-strip";
import { MarqueeGame } from "./marquee-game";
import { WeekScoreboard } from "./week-scoreboard";
import {
  GamedayLane,
  RankingsLane,
} from "./intelligence-lanes";

export function BroadcastHomepage({
  data,
}: {
  data: HomepageData;
  cleanMode: boolean;
  onModeRequest: () => void;
}) {
  const slate = weekGames(data.games, data.referenceDate);
  const slateComplete = slate.length > 0 && slate.every((game) => game.status === "final");
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
          venue={featured.venue}
        />
      ) : (
        <section className="apex-marquee" aria-label={slateComplete ? `Week ${refreshWeek} final results` : "Marquee matchup"}>
          {slateComplete ? (
            <div className="apex-empty">
              <h2>Week {refreshWeek} complete</h2>
              <p>All {slate.length} final results are published.</p>
              <a href={`/scores?week=${refreshWeek}`}>Review Week {refreshWeek} results →</a>
            </div>
          ) : (
            <p className="apex-empty">
              This week&apos;s marquee matchup is not published.
            </p>
          )}
        </section>
      )}
      <WeekScoreboard
        games={slate}
        teams={data.teams}
        referenceDate={data.referenceDate}
      />
      <FinalsStrip games={slate} />
      <div className="apex-intelligence-grid">
        <RankingsLane
          standings={data.standings}
          teams={data.teams}
          datasetAsOf={data.datasetAsOf}
        />
        <section className="apex-lane research-card" aria-labelledby="weekly-desk-title">
          <h2 id="weekly-desk-title">Week {refreshWeek} Fantasy Desk</h2>
          <p>Early half-PPR redraft edition · Researched {fantasyResearchAsOf}. Conditional waiver candidates, lineup tiers, rookie usage and trade notes.</p>
          <a href="/fantasy-desk">Open the decision boards →</a>
          <p>Byes: {byeTeams.map(slug => data.teams.find(team => team.slug === slug)?.name ?? slug).join(", ")}</p>
        </section>
      </div>
      <section className="research-card-grid" aria-label="Verified NFL research">
        <article className="research-card"><h2>NFL results & season leaders</h2><p>{data.games.filter(game => game.status === "final").length} completed games, 32 standings and the published yardage leaders. Each module retains its own source date.</p><a href="/scores">NFL scores →</a> <a href="/stats">Season leaders →</a></article>
        <article className="research-card"><h2>Verified roster moves</h2><p>{transactions.length} corroborated transactions in the October 14–20 window.</p><a href="/transactions">Read the transaction wire →</a></article>
      </section>
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
