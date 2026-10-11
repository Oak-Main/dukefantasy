"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, ShieldCheck } from "lucide-react";
import { getGame, getTeamBySlug } from "@/lib/cfb-dataset";
import { patchScheduleGames } from "@/lib/live-scoreboard";
import type { TeamHubProps } from "@/lib/team-hub";
import { LiveScoreAnnouncer } from "@/components/broadcast/live-status";
import { useLiveScoreboard } from "@/components/broadcast/use-live-scoreboard";
import { FavoriteButton } from "@/components/polish/favorites";
import { ScheduleSection } from "./schedule";
import { RosterSection } from "./roster";
import {
  GamedaySection,
  HistorySection,
  NumbersSection,
  PortalSection,
} from "./sections";
import { dateLabel, decimal, HubMark, published, rank } from "./ui";

const sections = [
  "schedule",
  "portal",
  "roster",
  "gameday",
  "numbers",
  "history",
] as const;
type SectionId = (typeof sections)[number];

export function TeamHub(props: TeamHubProps) {
  const { team, season, preseason, asOf, pollDate } = props;
  const [activeSection, setActiveSection] = useState<SectionId>("schedule");
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const safeColor = /^#[0-9a-f]{3,8}$/i.test(team.color)
    ? team.color
    : "var(--primary)";
  // The schedule bakes at deploy time. Games that started or finished since
  // then are overlaid from the live feed by ESPN event id, once, here, so the
  // banner and the schedule section below can never disagree.
  const { patches } = useLiveScoreboard();
  const schedule = useMemo(
    () => (props.schedule ? patchScheduleGames(props.schedule, patches) : null),
    [props.schedule, patches],
  );
  const liveRow = schedule?.find((game) => game.live);
  const next = schedule?.find(
    (game) =>
      !game.isBye &&
      !game.result &&
      !game.live &&
      game.date &&
      game.date >= props.referenceDate,
  );
  const announcerGames = (props.schedule ?? []).flatMap((game) => {
    if (game.isBye || !game.eventId) return [];
    const opponent =
      (game.opponentSlug ? getTeamBySlug(game.opponentSlug)?.shortName : null) ??
      game.opponent ??
      "Opponent";
    const isHome = game.homeAway === "home";
    return [
      {
        id: game.eventId,
        status: getGame(game.eventId)?.status ?? "scheduled",
        away: isHome ? opponent : team.shortName,
        home: isHome ? team.shortName : opponent,
      },
    ];
  });
  const mascot = team.name.startsWith(`${team.shortName} `)
    ? team.name.slice(team.shortName.length + 1)
    : null;
  const quickStats = [
    {
      label: "SP+ RANK",
      value: rank(preseason?.sp?.rank),
      detail: "Preseason",
    },
    { label: "FPI RANK", value: rank(preseason?.fpi?.rank), detail: "ESPN" },
    {
      label: "WIN TOTAL",
      value: decimal(preseason?.wins?.line),
      detail: "Published line",
    },
    {
      label: "PLAYOFF ODDS",
      value: published(preseason?.playoff?.value),
      detail: preseason?.playoff?.outlet ?? "Outlet not published",
    },
  ];

  // biome-ignore lint/correctness/useExhaustiveDependencies: Changing programs remounts the keyed sections, so observers must reacquire their DOM nodes.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const elements = sections
      .map((id) => root.querySelector<HTMLElement>(`#${id}`))
      .filter((element): element is HTMLElement => Boolean(element));
    const header = document.querySelector<HTMLElement>(".apex-header");
    let frame: number | null = null;
    let hashFrame: number | null = null;
    const update = () => {
      frame = null;
      const headerHeight = header?.getBoundingClientRect().height ?? 0;
      root.style.setProperty("--hub-header-height", `${headerHeight}px`);
      const rail = railRef.current;
      const railTop = rail ? Number.parseFloat(getComputedStyle(rail).top) : Number.NaN;
      const offset =
        (Number.isFinite(railTop) ? railTop : headerHeight) +
        (rail?.getBoundingClientRect().height ?? 0) +
        48;
      const current = elements
        .filter((section) => section.getBoundingClientRect().top <= offset)
        .at(-1);
      const atBottom =
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 4;
      setActiveSection(
        atBottom ? "history" : current ? (current.id as SectionId) : "schedule",
      );
    };
    const onScroll = () => {
      if (frame == null) frame = window.requestAnimationFrame(update);
    };
    const syncHashTarget = () => {
      const hashTarget = window.location.hash.slice(1) as SectionId;
      if (!sections.includes(hashTarget)) return;
      setActiveSection(hashTarget);
      if (hashFrame != null) window.cancelAnimationFrame(hashFrame);
      hashFrame = window.requestAnimationFrame(() => {
        hashFrame = window.requestAnimationFrame(() => {
          hashFrame = null;
          update();
        });
      });
    };
    const resize = new ResizeObserver(onScroll);
    if (header) resize.observe(header);
    if (railRef.current) resize.observe(railRef.current);
    const entrance = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.reveal = "true";
            entrance.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.05 },
    );
    for (const element of elements) entrance.observe(element);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("hashchange", syncHashTarget);
    update();
    syncHashTarget();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("hashchange", syncHashTarget);
      resize.disconnect();
      entrance.disconnect();
      if (frame != null) window.cancelAnimationFrame(frame);
      if (hashFrame != null) window.cancelAnimationFrame(hashFrame);
    };
  }, [team.slug]);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 720px)").matches) return;
    const active = railRef.current?.querySelector<HTMLElement>(
      `.hub-rail-links a[href="#${activeSection}"]`,
    );
    active?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });
  }, [activeSection]);

  return (
    <div
      className="team-hub font-sans"
      ref={rootRef}
      style={{ "--team-color": safeColor } as CSSProperties}
    >
      <div className="hub-breadcrumb hub-container">
        <a href="/teams">
          <ArrowLeft size={14} aria-hidden="true" />
          All teams
        </a>
        <ChevronRight size={14} aria-hidden="true" />
        <span>{team.conference}</span>
        <ChevronRight size={14} aria-hidden="true" />
        <span>{team.shortName}</span>
        <span className="hub-season-label">{season} TEAM HUB</span>
      </div>
      <header className="hub-hero">
        <div className="hub-hero-inner hub-container">
          <div className="hub-hero-mark">
            <HubMark team={team} hero />
          </div>
          <div className="hub-hero-copy">
            <div className="hub-hero-kicker">
              <span className="hub-team-chip">{team.conference}</span>
              <span className="hub-eyebrow">{season} SEASON</span>
              <FavoriteButton teamId={team.slug} teamName={team.shortName} />
              {team.rank != null ? (
                <span
                  className="hub-rank-chip"
                  title={`AP poll${pollDate ? ` · ${dateLabel(pollDate)}` : ""}`}
                >
                  #{team.rank} AP
                </span>
              ) : null}
            </div>
            <h1 className="font-display text-balance">
              {team.shortName}
              <span>{mascot ?? "Football"}</span>
            </h1>
            <div className="hub-hero-record">
              <strong>{team.record || "Record not published"}</strong>
              <span>Overall</span>
              <span className="hub-record-divider" aria-hidden="true" />
              <span>{team.conference}</span>
              <span className="hub-record-divider" aria-hidden="true" />
              <span>
                {team.rank != null
                  ? `AP #${team.rank}${pollDate ? ` · ${dateLabel(pollDate, false)}` : ""}`
                  : "AP rank not published"}
              </span>
            </div>
            <div className="hub-quick-stats">
              {quickStats.map((stat) => (
                <a href="#numbers" className="hub-stat-chip" key={stat.label}>
                  <span>{stat.label}</span>
                  <strong
                    className="font-display"
                    data-unavailable={stat.value === "Not published"}
                  >
                    {stat.value}
                  </strong>
                  <small>{stat.detail}</small>
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="hub-hero-bottom hub-container">
          <span>
            <ShieldCheck size={16} aria-hidden="true" />
            Sourced. Dated. Never guessed.
          </span>
          <a href="/data-sources">
            Dataset as of {dateLabel(asOf)}
            <ArrowRight size={14} aria-hidden="true" />
          </a>
        </div>
      </header>
      <nav
        className="hub-section-rail"
        aria-label="Team hub sections"
        ref={railRef}
      >
        <div className="hub-container hub-rail-inner">
          <div className="hub-rail-team">
            <HubMark team={team} />
            <span className="font-display">{team.shortName}</span>
          </div>
          <div className="hub-rail-links">
            {sections.map((id) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={activeSection === id ? "location" : undefined}
              >
                {id}
              </a>
            ))}
          </div>
          <span className="hub-rail-season">{season}</span>
        </div>
      </nav>
      <div className="hub-container hub-content">
        <LiveScoreAnnouncer games={announcerGames} />
        {liveRow?.live ? (
          <a className="hub-next-banner" href="#schedule" data-live="true">
            <span className="hub-chip hub-chip--live">LIVE</span>
            <strong>
              {liveRow.homeAway === "away" ? "At" : "vs"} {liveRow.opponent}
            </strong>
            <span>
              {liveRow.live.ownScore}–{liveRow.live.opponentScore} ·{" "}
              {liveRow.live.statusLabel ?? "In progress"}
            </span>
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        ) : next ? (
          <a className="hub-next-banner" href="#schedule">
            <span className="hub-chip hub-chip--gold">ON DECK</span>
            <strong>
              {next.homeAway === "away" ? "At" : "vs"} {next.opponent}
            </strong>
            <span>
              {dateLabel(next.date, false)} ·{" "}
              {next.kickoffLabel ?? "Time not published"}
            </span>
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        ) : null}
        <ScheduleSection
          key={`schedule-${team.slug}`}
          schedule={schedule}
          season={season}
          asOf={asOf}
          referenceDate={props.referenceDate}
        />
        <PortalSection portal={props.portal} team={team} />
        <RosterSection
          key={`roster-${team.slug}`}
          roster={props.roster}
          depth={props.depth}
          coach={props.coach}
          injuries={props.injuries}
          injuriesAsOf={props.injuriesAsOf}
          fantasy={props.fantasy}
        />
        <GamedaySection
          stadium={props.stadium}
          radio={props.radio}
          radioAsOf={props.radioAsOf}
        />
        <NumbersSection
          preseason={preseason}
          ratings={props.ratings}
          season={season}
        />
        <HistorySection
          seasons={props.seasons}
          ratings={props.ratings}
          leaders={props.leaders}
        />
        <div className="hub-data-note">
          <ShieldCheck size={20} aria-hidden="true" />
          <p>
            <strong>Good intel starts with honest data.</strong> This hub
            reflects a dated research release, not a live feed. Unpublished
            values stay unpublished.
          </p>
          <a href={`/corrections?record=team-${team.slug}`}>
            Report a correction
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}
