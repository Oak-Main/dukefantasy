import Image from "next/image";
import { ArrowUpRight, CalendarDays, MapPin, Radio, Tv } from "lucide-react";
import {
  conferenceLabel,
  dateLabel,
  kickoffTime,
  published,
  type BroadcastGame,
  type BroadcastTeam,
} from "@/lib/homepage";
import { BroadcastBadge, BroadcastButton, TeamMark } from "./primitives";

export function MarqueeGame({
  game,
  away,
  home,
  venue,
}: {
  game: BroadcastGame;
  away: BroadcastTeam;
  home: BroadcastTeam;
  venue?: string;
}) {
  return (
    <section
      className="apex-marquee apex-enter"
      aria-labelledby="marquee-title"
    >
      <Image
        className="apex-marquee-image"
        src="/images/saturday-lights.png"
        alt=""
        fill
        sizes="(max-width: 600px) 100vw, (max-width: 1400px) 92vw, 1320px"
        priority
        unoptimized
      />
      <div className="apex-field-stripes" aria-hidden="true" />
      <div className="apex-marquee-main">
        <div className="apex-marquee-copy">
          <div className="apex-marquee-topline">
            <BroadcastBadge tone="gold">
              <Radio size={13} aria-hidden="true" />
              GAME OF THE WEEK
            </BroadcastBadge>
            <span>{game.neutralSite ? "NEUTRAL SITE" : "MARQUEE MATCHUP"}</span>
          </div>
          <h2 id="marquee-title" className="text-balance">
            <span>{away.shortName} </span>
            <span>
              <em>{game.neutralSite ? "vs" : "at"} </em>
              {home.shortName}
            </span>
          </h2>
          <div className="apex-marquee-meta">
            <span>
              <CalendarDays size={15} aria-hidden="true" />
              {dateLabel(game.date)}
            </span>
            <span>
              <Tv size={15} aria-hidden="true" />
              {published(game.broadcast)}
              <span aria-hidden="true">·</span>
              {kickoffTime(game)}
            </span>
          </div>
          <div className="apex-marquee-actions">
            <BroadcastButton href={`/games/${game.id}`}>
              Matchup center
            </BroadcastButton>
            <BroadcastButton href="/watch" secondary>
              How to watch
            </BroadcastButton>
          </div>
        </div>
        <div className="apex-marquee-matchup">
          {[away, home].map((team, index) => (
            <div key={team.slug} className="contents">
              {index === 1 && (
                <span className="apex-versus" aria-hidden="true">
                  VS
                </span>
              )}
              <div className="apex-marquee-team">
                <a href={`/teams/${team.slug}`}>
                  <TeamMark team={team} size="hero" priority />
                  <span className="apex-marquee-team-name">
                    {team.rank != null && (
                      <small>
                        <span className="sr-only">AP preseason rank </span>
                        {team.rank}
                      </small>
                    )}
                    {team.shortName}
                  </span>
                </a>
                <span>
                  {team.record || "Not published"}
                  <span aria-hidden="true"> · </span>
                  {conferenceLabel(team.conference)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="apex-marquee-bottom">
        <span>
          <MapPin size={16} aria-hidden="true" />
          {venue || game.venue || "Venue not published"}
        </span>
        <a href="/conferences">
          Divisions &amp; records
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
