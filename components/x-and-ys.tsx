"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CircleOff, Play } from "lucide-react";
import type { BroadcastTeam } from "@/lib/homepage";
import { filmResearchBriefs } from "@/lib/film-research";
import { DataBoardHero, DataBoardSummary } from "./data-board-primitives";
import {
  CONCEPT_LIBRARY,
  SCHEME_FAMILIES,
  SPOTLIGHT_FORMAT,
  TECHNIQUE_PRIMERS,
  WEEKLY_SPOTLIGHTS,
  publishedSpotlights,
  type ConceptSide,
} from "@/lib/x-and-ys";

function ConceptCard({ concept }: { concept: (typeof CONCEPT_LIBRARY)[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <article
      className={`xy-concept-card${open ? " xy-concept-card--open" : ""}`}
      data-side={concept.side}
    >
      <header>
        <span className="db-position-tag" data-side={concept.side}>
          {concept.side === "pass" ? "PASS" : "RUN"}
        </span>
        <div>
          <h3 className="font-display">{concept.name}</h3>
          <span className="xy-concept-family">{concept.family}</span>
        </div>
      </header>
      <div className="xy-concept-tags">
        {concept.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <div className="xy-concept-body">
        <section>
          <span className="db-eyebrow">MACRO — the scheme idea</span>
          <p>{concept.macro}</p>
        </section>
        {open ? (
          <>
            <section>
              <span className="db-eyebrow">MICRO — the execution</span>
              <p>{concept.micro}</p>
            </section>
            <p className="xy-concept-beats">
              <strong>Beats:</strong> {concept.beats}
            </p>
          </>
        ) : null}
      </div>
      <button type="button" className="xy-concept-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Collapse breakdown" : "Full breakdown"}
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
    </article>
  );
}

function SchemeFamilyCard({
  family,
  teamBySlug,
}: {
  family: (typeof SCHEME_FAMILIES)[number];
  teamBySlug: ReadonlyMap<string, BroadcastTeam>;
}) {
  return (
    <article className="xy-family-card">
      <header>
        <span className="db-eyebrow">{family.lineage}</span>
        <h3 className="font-display">{family.name}</h3>
      </header>
      <p className="xy-family-thesis">{family.thesis}</p>
      <dl className="xy-family-identity">
        <div>
          <dt>Run identity</dt>
          <dd>{family.runIdentity}</dd>
        </div>
        <div>
          <dt>Pass identity</dt>
          <dd>{family.passIdentity}</dd>
        </div>
      </dl>
      <div className="xy-family-teams">
        {family.teamSlugs.map((slug) => {
          const team = teamBySlug.get(slug);
          return (
            <a href={`/teams/${slug}`} key={slug} className="xy-family-team" style={team ? { borderColor: team.color } : undefined}>
              {team?.shortName ?? slug}
            </a>
          );
        })}
      </div>
    </article>
  );
}

export function XAndYsPage({ teams }: { teams: readonly BroadcastTeam[] }) {
  const [side, setSide] = useState<ConceptSide | "all">("all");
  const [query, setQuery] = useState("");
  const teamBySlug = useMemo(() => new Map(teams.map((team) => [team.slug, team])), [teams]);
  const mappedTeamSlugs = useMemo(
    () => new Set(SCHEME_FAMILIES.flatMap((family) => family.teamSlugs)),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CONCEPT_LIBRARY.filter((concept) => {
      if (side !== "all" && concept.side !== side) return false;
      if (!q) return true;
      return `${concept.name} ${concept.family} ${concept.beats} ${concept.tags.join(" ")}`
        .toLowerCase()
        .includes(q);
    });
  }, [side, query]);

  const published = publishedSpotlights();
  const pending = WEEKLY_SPOTLIGHTS.filter((spotlight) => spotlight.videoUrl === null);

  return (
    <div className="db-page xy-page">
      <DataBoardHero
        eyebrow="Film room · Concept library"
        title="X & Ys. The offense, decoded."
        description="An editorial concept library for offensive schemes and technique. Weekly footage reviews are not published. Five Week 7 source briefs remain clip-review assignments; they do not establish observed tactics or current team scheme coverage."
        action={
          <a className="db-hero-link" href="#weekly-spotlight">
            This week in film
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        }
      />
      <DataBoardSummary
        label="Concept library summary"
        caption="The taxonomy is our own editorial framework, written for this site. Highlight footage is referenced from officially licensed sources only."
        items={[
          { label: "Concepts", value: CONCEPT_LIBRARY.length, emphasis: true },
          { label: "Pass concepts", value: CONCEPT_LIBRARY.filter((c) => c.side === "pass").length },
          { label: "Run concepts", value: CONCEPT_LIBRARY.filter((c) => c.side === "run").length },
          { label: "Scheme families", value: SCHEME_FAMILIES.length },
          { label: "2026 teams mapped", value: mappedTeamSlugs.size },
        ]}
      />

      <section className="apex-container db-section" aria-labelledby="concept-library-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">PASS CONCEPTS · RUN CONCEPTS</span>
            <h2 id="concept-library-title">The library</h2>
          </div>
          <div className="db-filters xy-concept-filters">
            <div className="apex-search-field xy-concept-search">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search a concept, family, or coverage it beats…"
                aria-label="Search concepts"
                autoComplete="off"
              />
            </div>
            {(["all", "pass", "run"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={side === option ? "is-active" : undefined}
                aria-pressed={side === option}
                onClick={() => setSide(option)}
              >
                {option === "all" ? "All" : option === "pass" ? "Pass" : "Run"}
              </button>
            ))}
          </div>
        </div>
        {filtered.length ? (
          <div className="xy-concept-grid">
            {filtered.map((concept) => (
              <ConceptCard key={concept.id} concept={concept} />
            ))}
          </div>
        ) : (
          <p className="db-empty">No concepts match “{query}”. Try “flood”, “wide zone”, or “man beater”.</p>
        )}
      </section>

      <section className="apex-container db-section" aria-labelledby="scheme-families-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">MACRO — THE LEAGUE'S OFFENSIVE FAMILIES</span>
            <h2 id="scheme-families-title">How 2026 teams actually play offense</h2>
          </div>
        </div>
        <div className="xy-family-grid">
          {SCHEME_FAMILIES.map((family) => (
            <SchemeFamilyCard key={family.id} family={family} teamBySlug={teamBySlug} />
          ))}
        </div>
        <p className="apex-data-note">
          Families describe offensive identity, not exclusivity — real offenses blend trees, and teams
          appear in every family they genuinely run. Identity framing reflects the 2026 season.
        </p>
      </section>

      <section className="apex-container db-section" aria-labelledby="technique-primers-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">MICRO — TECHNIQUE PRIMERS</span>
            <h2 id="technique-primers-title">The details that decide it</h2>
          </div>
        </div>
        <div className="xy-primer-grid">
          {TECHNIQUE_PRIMERS.map((primer) => (
            <article key={primer.id} className="xy-primer-card">
              <span className="db-position-tag">{primer.unit}</span>
              <h3>{primer.title}</h3>
              <p>{primer.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="apex-container db-section xy-spotlight"
        id="weekly-spotlight"
        aria-labelledby="weekly-spotlight-title"
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE WEEK IN FILM · WEEKLY SPOTLIGHT</span>
            <h2 id="weekly-spotlight-title">{SPOTLIGHT_FORMAT.countPerWeek} cut-ups, every week</h2>
          </div>
        </div>
        <p className="xy-spotlight-format">
          {SPOTLIGHT_FORMAT.focus} {SPOTLIGHT_FORMAT.countNote} {SPOTLIGHT_FORMAT.sourcing}
        </p>
        <p className="apex-data-note">Cadence: {SPOTLIGHT_FORMAT.cadence}.</p>

        {published.length ? (
          <div className="xy-spotlight-grid">
            {published.map((spotlight) => (
              <a
                key={`${spotlight.week}-${spotlight.order}`}
                className="xy-spotlight-card"
                href={spotlight.videoUrl ?? "#weekly-spotlight"}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="xy-spotlight-play" aria-hidden="true">
                  <Play size={22} />
                </span>
                <div>
                  <span className="db-eyebrow">WEEK {spotlight.week} · No. {spotlight.order}</span>
                  <h3>{spotlight.title}</h3>
                  {spotlight.playmaker ? <strong>{spotlight.playmaker}</strong> : null}
                  {spotlight.description ? <p>{spotlight.description}</p> : null}
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="xy-spotlight-pending">
            <span className="empty-state__icon" aria-hidden="true">
              <CircleOff />
            </span>
            <h3>Weekly film reviews are not published</h3>
            <p>
              {pending.length} unpublished placeholder remains. No footage has been watched or accepted for weekly tactical analysis. The concept library is background instruction, not an observed Week 7 breakdown.
            </p>
          </div>
        )}
      </section>
      <section className="apex-container db-section" aria-labelledby="film-research-title">
        <h2 id="film-research-title">Week 7 film research queue — five briefs, zero accepted reviews</h2>
        <p>October 28 research handoff. These source descriptions are clip-review assignments, not film observations. Each needs a licensed clip, timecode, concept verification and reviewer.</p>
        <div className="research-card-grid">{filmResearchBriefs.map(brief => <article key={brief.player} className="research-card"><h3>{brief.player}</h3><p>{brief.question}</p><a href={brief.source} target="_blank" rel="noopener noreferrer">Official source for review</a></article>)}</div>
      </section>
    </div>
  );
}
