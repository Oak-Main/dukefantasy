"use client";

import { type ReactNode, useMemo, useState } from "react";
import { CalendarClock, RefreshCw, ShieldCheck } from "lucide-react";
import type { BroadcastTeam } from "@/lib/homepage";
import { inactiveReports, practiceReports, reserveStatuses } from "@/lib/content-refresh";
import { EvidenceLinks } from "./evidence-links";
import { DataBoardHero, DataBoardSummary } from "./data-board-primitives";
import {
  INJURY_CADENCE,
  INJURY_METHOD,
  type EspnInjuryEntry,
  type InjuryStatus,
  type InjuryWatchEntry,
  espnInjuriesAsOf,
  espnLedgerEntries,
  espnWatchEntries,
  injuryResearch,
  likelihoodFromPractice,
  nextInjurySlot,
} from "@/lib/injury-report";

function formatSlotTime(minuteOfDay: number): string {
  const hours24 = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  const ampm = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${ampm} PT`;
}

function StatusPill({ status }: { status: InjuryStatus }) {
  const cls =
    status === "IR" ? "inj-pill--ir" : status === "OUT" ? "inj-pill--out" : status === "SUSPENSION" ? "inj-pill--susp" : "inj-pill--q";
  return <span className={`inj-pill ${cls}`}>{status === "IR" ? "IR" : status === "OUT" ? "OUT" : status === "SUSPENSION" ? "SUSP" : status === "DOUBTFUL" ? "DOUBTFUL" : "Q"}</span>;
}

function LikelihoodPill({ likelihood, confidence }: { likelihood: string | null; confidence: string | null }) {
  if (!likelihood) return <span className="inj-pill inj-pill--none">Not graded</span>;
  const cls =
    likelihood === "likely" ? "inj-pill--likely" : likelihood === "questionable" ? "inj-pill--q" : "inj-pill--out";
  return (
    <span className={`inj-pill ${cls}`}>
      {likelihood.toUpperCase()}
      {confidence ? <small> · {confidence} conf</small> : null}
    </span>
  );
}

function PracticeCell({ status }: { status: string | null }) {
  if (!status) return <span className="inj-practice inj-practice--none">—</span>;
  const cls = status === "FP" ? "inj-practice--fp" : status === "LP" ? "inj-practice--lp" : "inj-practice--dnp";
  return <span className={`inj-practice ${cls}`}>{status}</span>;
}

function InjuryTableCell({ label, headers, className, children }: {
  label: string;
  headers: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <td data-label={label} headers={headers} className={className}>
      <div className="inj-cell-value">{children}</div>
    </td>
  );
}

export function InjuryReportPage({ teams }: { teams: readonly BroadcastTeam[] }) {
  const teamBySlug = useMemo(() => new Map(teams.map((team) => [team.slug, team])), [teams]);
  const [teamFilter, setTeamFilter] = useState<string>("");
  const baseLedger = useMemo<EspnInjuryEntry[]>(() => injuryResearch.asOf ? [] : espnLedgerEntries(), []);
  const baseWatch = useMemo<EspnInjuryEntry[]>(() => injuryResearch.asOf ? [] : espnWatchEntries(), []);

  const ledgerRows = useMemo(() => {
    const rows: Array<{
      kind: "espn" | "research";
      player: string;
      teamSlug: string | null;
      position: string | null;
      injury: string | null;
      status: InjuryStatus;
      weeksOut: number | null;
      detail: string | null;
      sources: string[];
      social: string[];
      confidence: string | null;
    }> = baseLedger.map((entry) => ({
      kind: "espn" as const,
      player: entry.player,
      teamSlug: entry.teamSlug,
      position: entry.position,
      injury: null as string | null,
      status: entry.status,
      weeksOut: null as number | null,
      detail: entry.detail,
      sources: [] as string[],
      social: [] as string[],
      confidence: null as string | null,
    }));
    const seen = new Set(rows.map((row) => `${row.player}:${row.teamSlug}`));
    for (const entry of injuryResearch.ledger) {
      const key = `${entry.player}:${entry.teamSlug}`;
      if (seen.has(key)) continue; // research detail joins the ESPN row below
      seen.add(key);
      rows.push({
        kind: "research",
        player: entry.player,
        teamSlug: entry.teamSlug,
        position: entry.position,
        injury: entry.injury,
        status: entry.status as InjuryStatus,
        weeksOut: entry.weeksOut,
        detail: entry.detail,
        sources: entry.sources,
        social: entry.social,
        confidence: entry.confidence,
      });
    }
    const filtered = teamFilter ? rows.filter((row) => row.teamSlug === teamFilter) : rows;
    return filtered.sort(
      (a, b) => (a.teamSlug ?? "").localeCompare(b.teamSlug ?? "") || a.player.localeCompare(b.player),
    );
  }, [baseLedger, teamFilter]);

  const watchRows = useMemo(() => {
    const espnRows = baseWatch.map((entry) => ({
      kind: "espn" as const,
      player: entry.player,
      teamSlug: entry.teamSlug,
      position: entry.position,
      injury: null as string | null,
      practice: null as InjuryWatchEntry["practice"] | null,
      publishedStatus: null as InjuryWatchEntry["publishedStatus"],
      designationDate: null as string | null,
      designationPhase: null as InjuryWatchEntry["designationPhase"],
      likelihood: entry.status === "OUT" ? ("unlikely" as const) : entry.status === "DOUBTFUL" ? ("doubtful" as const) : null,
      confidence: null as string | null,
      note: entry.detail,
      sources: [] as string[],
      social: [] as string[],
    }));
    const researchRows = injuryResearch.watch.map((entry) => {
      const model = likelihoodFromPractice(entry.practice);
      const ungraded = entry.publishedStatus === "NO_DESIGNATION";
      return {
        kind: "research" as const,
        player: entry.player,
        teamSlug: entry.teamSlug,
        position: entry.position,
        injury: entry.injury,
        practice: entry.practice,
        publishedStatus: entry.publishedStatus,
        designationDate: entry.designationDate,
        designationPhase: entry.designationPhase,
        likelihood: ungraded ? null : entry.likelihood ?? model.likelihood,
        confidence: ungraded ? null : entry.confidence ?? model.confidence,
        note: entry.note ?? model.basis,
        sources: entry.sources,
        social: entry.social,
      };
    });
    // Research rows outrank their ESPN twin; ESPN-only rows fill the board.
    const researchKeys = new Set(researchRows.map((row) => `${row.player}:${row.teamSlug}`));
    const rows = [...researchRows, ...espnRows.filter((row) => !researchKeys.has(`${row.player}:${row.teamSlug}`))];
    const filtered = teamFilter ? rows.filter((row) => row.teamSlug === teamFilter) : rows;
    return filtered.sort(
      (a, b) => (a.teamSlug ?? "").localeCompare(b.teamSlug ?? "") || a.player.localeCompare(b.player),
    );
  }, [baseWatch, teamFilter]);

  const latestObservationDate = [...practiceReports.map((row) => row.date), ...injuryResearch.watch.map((row) => row.designationDate).filter((date): date is string => Boolean(date)), ...reserveStatuses.map((row) => row.asOf).filter((date): date is string => Boolean(date))].sort().at(-1) ?? null;
  const next = nextInjurySlot();
  const researchLive = injuryResearch.watch.length > 0 || injuryResearch.ledger.length > 0;

  return (
    <div className="db-page inj-page">
      <DataBoardHero
        eyebrow="Injury desk · Verified weekly"
        title="The injury report, on the record."
        description="Week 8 Thursday watch: Carolina and Green Bay only. The carried long-term ledger retains its October 20 full-review date; other teams are not recertified. Blank practice cells mean no verified report."
        action={
          <a className="db-hero-link" href="#inj-cadence">
            Publishing schedule
            <CalendarClock size={16} aria-hidden="true" />
          </a>
        }
      />
      <DataBoardSummary
        label="Injury desk summary"
        caption={`${INJURY_METHOD.schedule} Full review as of ${injuryResearch.asOf ?? espnInjuriesAsOf ?? "not published"}. Latest dated observation ${latestObservationDate ?? "not published"}; individual records retain their own source dates.`}
        items={[
          { label: "Long-term ledger", value: ledgerRows.length, emphasis: true },
          { label: "Week-to-week watch", value: watchRows.length },
          { label: "Research entries", value: injuryResearch.ledger.length + injuryResearch.watch.length },
          { label: "Full review as of", value: injuryResearch.asOf ?? "Not published" },
          { label: "Latest dated observation", value: latestObservationDate ?? "Not published" },
          { label: "Teams covered", value: new Set([...ledgerRows, ...watchRows].map((row) => row.teamSlug)).size },
        ]}
      />

      <section className="apex-container db-section inj-cadence" id="inj-cadence" aria-labelledby="inj-cadence-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">PUBLISHING CADENCE</span>
            <h2 id="inj-cadence-title">When this board updates</h2>
          </div>
        </div>
        <div className="inj-cadence-next">
          <CalendarClock size={18} aria-hidden="true" />
          <div>
            <strong>{next ? `Next scheduled check: ${next.slot.label}` : "Week 8 editorial review plan ended November 3, 2026"}</strong>
            {next && <span>
              {next.at.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" })} ·{" "}
              {next.at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })} PT — {next.slot.scope}
            </span>}
          </div>
        </div>
        <div className="inj-cadence-grid">
          {INJURY_CADENCE.map((slot) => (
            <article key={slot.id} className={slot.id === next?.slot.id ? "inj-cadence-slot is-next" : "inj-cadence-slot"}>
              <span className="db-eyebrow">{slot.daysLabel}</span>
              <strong>{formatSlotTime(slot.minuteOfDay)}{slot.endMinuteOfDay !== undefined ? `–${formatSlotTime(slot.endMinuteOfDay)}` : ""}</strong>
              <span>{slot.label}</span>
              <p>{slot.scope}</p>
            </article>
          ))}
        </div>
        <p className="apex-data-note">
          <RefreshCw size={12} aria-hidden="true" /> Planned editorial checks: October 28–November 3 in America/Los_Angeles, including the November 1 daylight-saving transition. This plan does not run automatically or establish that a check occurred. Publication requires two agreeing sources and passing checks.
        </p>
      </section>

      <section className="apex-container db-section" id="inactives" aria-labelledby="inactives-title">
        <h2 id="inactives-title">Verified Week 7 game-day inactives</h2>
        <p>Historical Week 7 lists remain available. Week 8 inactives are not published yet. Only team lists confirmed through two sources appear; a player missing from a list is not automatically confirmed active.</p>
        {inactiveReports.length ? <div className="research-card-grid">{inactiveReports.filter(report => !teamFilter || report.teamSlug === teamFilter).map(report => <article className="research-card" key={report.gameId + report.teamSlug}>
          <h3>{teamBySlug.get(report.teamSlug)?.name ?? report.teamSlug}</h3>
          <p>Week {report.week} · Published <time dateTime={report.publishedAt}>{report.publishedAt}</time> · {report.complete ? "Complete team list" : "Partial list"}</p>
          <ul>{report.players.map(player => <li key={player.name}>{player.name}{player.designation === "emergency_qb" ? " — emergency third QB (conditional eligibility)" : " — inactive"}</li>)}</ul>
          <EvidenceLinks urls={report.sources} /><a href={`/games/${report.gameId}`}>Game details</a>
        </article>)}</div> : <p className="db-empty">Verified Week 7 inactive lists are not published yet. They will appear after official game-day reports are corroborated.</p>}
      </section>
      <section className="apex-container db-section" aria-labelledby="dated-practice-title">
        <h2 id="dated-practice-title">Dated practice reports — historical weeks retained</h2>
        {practiceReports.filter(report => !teamFilter || report.team_slug === teamFilter).map(report => <article className="research-card" key={report.team_slug + report.player + report.date}>
          <h3>{report.player} · {report.participation}</h3>
          <p><time dateTime={report.date}>{report.date}</time> · Week {report.week} · {teamBySlug.get(report.team_slug)?.name ?? report.team_slug} · {report.report_type === "estimated_walkthrough" ? "Estimated walkthrough" : "Practice report"} · {report.injury}</p>
          <p>{report.note}</p><EvidenceLinks urls={report.sources} />
        </article>)}
      </section>
      <section className="apex-container db-section" aria-labelledby="reserve-status-title">
        <h2 id="reserve-status-title">Reserve and eligibility updates</h2>
        <p>Activation, PUP, NFI and suspension updates are dated separately from the injury watch and game-day inactive lists.</p>
        <div className="research-card-grid">{reserveStatuses.filter(row => !teamFilter || row.team_slug === teamFilter).map(row => <article className="research-card" key={row.player + row.team_slug}>
          <h3>{row.player}</h3><p>{teamBySlug.get(row.team_slug)?.name ?? row.team_slug} · {row.status}</p>
          {row.asOf ? <p>Status checked <time dateTime={row.asOf}>{row.asOf}</time></p> : null}
          {row.note ? <p>{row.note}</p> : null}<EvidenceLinks urls={row.sources} />
        </article>)}</div>
      </section>
      <section className="apex-container db-section" aria-labelledby="inj-ledger-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LONG-TERM LEDGER · IR OR 3+ WEEKS OUT</span>
            <h2 id="inj-ledger-title">Out for the long haul</h2>
          </div>
          <div className="db-filters">
            <label className="sr-only" htmlFor="inj-team-filter">
              Filter by team
            </label>
            <select
              id="inj-team-filter"
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
              className="inj-team-select"
            >
              <option value="">All teams</option>
              {teams.map((team) => (
                <option key={team.slug} value={team.slug}>
                  {team.shortName}
                </option>
              ))}
            </select>
          </div>
        </div>
        {ledgerRows.length ? (
          <section className="db-table-wrap" aria-label="Long-term injury table scroll area" tabIndex={0}>
            {/* biome-ignore lint/a11y/noRedundantRoles: retain table semantics when mobile CSS changes display. */}
            <table className="db-table inj-table" role="table" aria-labelledby="inj-ledger-title">
              <thead>
                <tr>
                  <th id="inj-ledger-player" scope="col">Player</th>
                  <th id="inj-ledger-team" scope="col">Team</th>
                  <th id="inj-ledger-position" scope="col">Pos</th>
                  <th id="inj-ledger-status" scope="col">Status</th>
                  <th id="inj-ledger-weeks" scope="col">Weeks out</th>
                  <th id="inj-ledger-detail" scope="col">Detail</th>
                  <th id="inj-ledger-sources" scope="col">Sources</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.slice(0, 400).map((row) => {
                  const team = row.teamSlug ? teamBySlug.get(row.teamSlug) : undefined;
                  return (
                    <tr className="db-data-row" key={`${row.player}-${row.teamSlug}-${row.status}`}>
                      <InjuryTableCell label="Player" headers="inj-ledger-player">
                        <strong>{row.player}</strong>
                        {row.confidence ? <small className="inj-conf"> · {row.confidence} confidence</small> : null}
                      </InjuryTableCell>
                      <InjuryTableCell label="Team" headers="inj-ledger-team">{team?.shortName ?? row.teamSlug ?? "—"}</InjuryTableCell>
                      <InjuryTableCell label="Pos" headers="inj-ledger-position">{row.position ?? "—"}</InjuryTableCell>
                      <InjuryTableCell label="Status" headers="inj-ledger-status">
                        <StatusPill status={row.status} />
                      </InjuryTableCell>
                      <InjuryTableCell label="Weeks out" headers="inj-ledger-weeks">{row.weeksOut != null ? `${row.weeksOut}+` : row.status === "IR" ? "Indefinite" : "—"}</InjuryTableCell>
                      <InjuryTableCell label="Detail" headers="inj-ledger-detail" className="inj-detail">{row.injury ?? row.detail ?? "Not published"}</InjuryTableCell>
                      <InjuryTableCell label="Sources" headers="inj-ledger-sources">
                        {row.sources.length ? (
                          <EvidenceLinks urls={row.sources} />
                        ) : (
                          <span className="inj-src-espn">ESPN</span>
                        )}
                      </InjuryTableCell>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : (
          <p className="db-empty">No long-term injuries published{teamFilter ? " for this team" : ""}.</p>
        )}
      </section>

      <section className="apex-container db-section" aria-labelledby="inj-watch-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">WEEK-TO-WEEK WATCH · PRACTICE STATUS & LIKELIHOOD</span>
            <h2 id="inj-watch-title">Game-time decisions, graded</h2>
          </div>
        </div>
        {researchLive ? (
          <p className="inj-watch-note">Official game designations are labeled separately from likelihood and carry their report date. No designation does not confirm game-day active status. {INJURY_METHOD.sentiment}</p>
        ) : (
          <p className="inj-watch-note">
            Editorial watch calls (practice participation, likelihood with confidence, sentiment from beat reports
            and verified accounts) publish with the weekly research — until then this board shows the ESPN base
            only, clearly labeled. Nothing is invented to fill the gap.
          </p>
        )}
        {watchRows.length ? (
          <section className="db-table-wrap" aria-label="Weekly injury table scroll area" tabIndex={0}>
            {/* biome-ignore lint/a11y/noRedundantRoles: retain table semantics when mobile CSS changes display. */}
            <table className="db-table inj-table inj-table--watch" role="table" aria-labelledby="inj-watch-title">
              <thead>
                <tr>
                  <th id="inj-watch-player" scope="col">Player</th>
                  <th id="inj-watch-team" scope="col">Team</th>
                  <th id="inj-watch-position" scope="col">Pos</th>
                  <th id="inj-watch-mon" scope="col">Mon</th>
                  <th id="inj-watch-tue" scope="col">Tue</th>
                  <th id="inj-watch-wed" scope="col">Wed</th>
                  <th id="inj-watch-thu" scope="col">Thu</th>
                  <th id="inj-watch-fri" scope="col">Fri</th>
                  <th id="inj-watch-sat" scope="col">Sat</th>
                  <th id="inj-watch-likelihood" scope="col">Likelihood</th>
                  <th id="inj-watch-note" scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {watchRows.slice(0, 300).map((row) => {
                  const team = row.teamSlug ? teamBySlug.get(row.teamSlug) : undefined;
                  const practice = row.practice;
                  return (
                    <tr className="db-data-row" key={`${row.player}-${row.teamSlug}-watch`}>
                      <InjuryTableCell label="Player" headers="inj-watch-player">
                        <strong>{row.player}</strong>
                        {row.injury ? <small className="inj-conf"> · {row.injury}</small> : null}
                      </InjuryTableCell>
                      <InjuryTableCell label="Team" headers="inj-watch-team">{team?.shortName ?? row.teamSlug ?? "—"}</InjuryTableCell>
                      <InjuryTableCell label="Pos" headers="inj-watch-position">{row.position ?? "—"}</InjuryTableCell>
                      <InjuryTableCell label="Mon" headers="inj-watch-mon"><PracticeCell status={practice?.mon ?? null} /></InjuryTableCell>
                      <InjuryTableCell label="Tue" headers="inj-watch-tue"><PracticeCell status={practice?.tue ?? null} /></InjuryTableCell>
                      <InjuryTableCell label="Wed" headers="inj-watch-wed"><PracticeCell status={practice ? practice.wed : null} /></InjuryTableCell>
                      <InjuryTableCell label="Thu" headers="inj-watch-thu"><PracticeCell status={practice ? practice.thu : null} /></InjuryTableCell>
                      <InjuryTableCell label="Fri" headers="inj-watch-fri"><PracticeCell status={practice ? practice.fri : null} /></InjuryTableCell>
                      <InjuryTableCell label="Sat" headers="inj-watch-sat"><PracticeCell status={practice ? practice.sat : null} /></InjuryTableCell>
                      <InjuryTableCell label="Likelihood" headers="inj-watch-likelihood">
                        <LikelihoodPill likelihood={row.likelihood} confidence={row.confidence} />
                      </InjuryTableCell>
                      <InjuryTableCell label="Note" headers="inj-watch-note" className="inj-detail">
                        {row.publishedStatus ? <p><strong>{`Official Week ${injuryResearch.week} ${row.designationPhase === "in_game" ? "in-game status" : "designation"}: ${row.publishedStatus.replaceAll("_", " ")}${row.designationPhase === "in_game" ? " (remainder of this game)" : ""}`}</strong> · <time dateTime={row.designationDate ?? undefined}>{row.designationDate}</time></p> : null}
                        {row.note ?? "Not published"}
                        {row.sources.length || row.social.length ? (
                          <EvidenceLinks urls={[...row.sources, ...row.social]} />
                        ) : row.kind === "espn" ? (
                          <>
                            {" "}
                            <span className="inj-src-espn">ESPN</span>
                          </>
                        ) : null}
                      </InjuryTableCell>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : (
          <p className="db-empty">No week-to-week entries published{teamFilter ? " for this team" : ""}.</p>
        )}
      </section>

      <section className="apex-container db-section" aria-labelledby="inj-method-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">METHOD</span>
            <h2 id="inj-method-title">
              <ShieldCheck size={16} aria-hidden="true" /> How this desk works
            </h2>
          </div>
        </div>
        <div className="xy-primer-grid">
          <article className="xy-primer-card">
            <span className="db-position-tag">LEDGER</span>
            <h3>Long-term means long-term</h3>
            <p>{INJURY_METHOD.ledger}</p>
          </article>
          <article className="xy-primer-card">
            <span className="db-position-tag">WATCH</span>
            <h3>Participation first</h3>
            <p>{INJURY_METHOD.watch}</p>
          </article>
          <article className="xy-primer-card">
            <span className="db-position-tag">SOURCES</span>
            <h3>Sentiment is evidence</h3>
            <p>{INJURY_METHOD.sentiment}</p>
          </article>
        </div>
        <p className="apex-data-note">
          Public, published information only — no medical speculation beyond what teams and reporters have stated.
          Corrections follow the <a href="/corrections">site-wide policy</a>.
        </p>
      </section>
    </div>
  );
}
