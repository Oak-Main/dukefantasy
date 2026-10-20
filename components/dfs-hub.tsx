"use client";

import { CircleOff, ClipboardCheck, LineChart, ShieldCheck, Target } from "lucide-react";
import { DataBoardHero, DataBoardSummary } from "./data-board-primitives";
import { refreshWeek } from "@/lib/content-refresh";
import {
  ACCURACY_METHOD,
  GRADE_DEPTH,
  accuracyByWeek,
  accuracyFor,
  pickResults,
  projections,
} from "@/lib/dfs-ledger";

function accuracyLabel(value: number | null, digits = 1): string {
  return value === null ? "Not published" : `${(value * 100).toFixed(digits)}%`;
}

function pointsLabel(value: number | null, digits = 1): string {
  return value === null ? "Not published" : `${value.toFixed(digits)} pts`;
}

export function DfsHubPage() {
  const season = accuracyFor(pickResults);
  const byWeek = accuracyByWeek(pickResults);
  const hasProjections = projections.length > 0;

  return (
    <div className="db-page dfs-hub-page">
      <DataBoardHero
        eyebrow="DFS · Projections & accountability"
        title="Fantasy picks you can audit."
        description="Weekly projections, past-week results, and a verification guide that grades us on the same ledger the picks were published to. The numbers start at zero — and stay honest from there."
      />
      <DataBoardSummary
        label="DFS ledger summary"
        caption={ACCURACY_METHOD.ledger}
        items={[
          { label: "Published picks", value: projections.length, emphasis: true },
          { label: "Graded picks", value: season.gradedPicks },
          { label: "Season hit rate", value: accuracyLabel(season.hitRate) },
          { label: "Mean absolute error", value: pointsLabel(season.mae) },
          { label: "Grading depth", value: `Top ${GRADE_DEPTH} per position` },
        ]}
      />

      <section className="apex-container db-section" aria-labelledby="dfs-projections-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THIS WEEK · PROJECTIONS</span>
            <h2 id="dfs-projections-title">Weekly projections board</h2>
          </div>
        </div>
        {hasProjections ? (
          <p className="db-empty">The projections table renders here once picks publish.</p>
        ) : (
          <div className="dfs-empty">
            <span className="empty-state__icon" aria-hidden="true">
              <Target />
            </span>
            <h3>Week {refreshWeek} projections are not published</h3>
            <p>
              Numeric projections await verified inputs and a scoring contract. Published picks will
              lock before kickoff. Historical accuracy remains unpublished until real picks can be graded.
              Visit the <a href="/fantasy-desk">Fantasy Desk</a> for sourced early lineup tiers and waiver candidates.
            </p>
          </div>
        )}
      </section>

      <section className="apex-container db-section" aria-labelledby="dfs-results-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">PAST WEEKS · RESULTS</span>
            <h2 id="dfs-results-title">How the picks actually did</h2>
          </div>
        </div>
        {byWeek.length ? (
          <div className="db-table-wrap db-desktop-data-table">
            <table className="db-table">
              <thead>
                <tr>
                  <th scope="col">Week</th>
                  <th scope="col">Graded</th>
                  <th scope="col">Hits</th>
                  <th scope="col">Misses</th>
                  <th scope="col">Hit rate</th>
                  <th scope="col">MAE</th>
                  <th scope="col">Bias</th>
                </tr>
              </thead>
              <tbody>
                {byWeek.map((stat) => (
                  <tr key={stat.week}>
                    <td>Week {stat.week}</td>
                    <td>{stat.gradedPicks}</td>
                    <td>{stat.hits}</td>
                    <td>{stat.misses}</td>
                    <td>{accuracyLabel(stat.hitRate)}</td>
                    <td>{pointsLabel(stat.mae)}</td>
                    <td>{stat.bias ?? "Not published"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dfs-empty">
            <span className="empty-state__icon" aria-hidden="true">
              <LineChart />
            </span>
            <h3>No completed weeks yet</h3>
            <p>
              The results ledger fills as weeks conclude — every graded pick, hit and miss, scored
              straight from the published projections. Until then, this space stays empty rather than
              invented.
            </p>
          </div>
        )}
      </section>

      <section className="apex-container db-section" aria-labelledby="dfs-accuracy-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">VERIFICATION · HOW WE GRADE OURSELVES</span>
            <h2 id="dfs-accuracy-title">The accuracy &amp; verification guide</h2>
          </div>
        </div>
        <div className="xy-primer-grid dfs-method-grid">
          <article className="xy-primer-card">
            <span className="db-position-tag">GRADING</span>
            <h3>
              <ClipboardCheck size={16} aria-hidden="true" /> We grade only what we recommend
            </h3>
            <p>{ACCURACY_METHOD.grading}</p>
          </article>
          <article className="xy-primer-card">
            <span className="db-position-tag">HIT RATE</span>
            <h3>
              <Target size={16} aria-hidden="true" /> Every top-10 pick grades
            </h3>
            <p>{ACCURACY_METHOD.hitRate}</p>
          </article>
          <article className="xy-primer-card">
            <span className="db-position-tag">ERROR</span>
            <h3>
              <LineChart size={16} aria-hidden="true" /> Points error, not just ranks
            </h3>
            <p>{ACCURACY_METHOD.mae}</p>
          </article>
          <article className="xy-primer-card">
            <span className="db-position-tag">BIAS</span>
            <h3>
              <CircleOff size={16} aria-hidden="true" /> Persistent leans get flagged
            </h3>
            <p>{ACCURACY_METHOD.bias}</p>
          </article>
          <article className="xy-primer-card">
            <span className="db-position-tag">LEDGER</span>
            <h3>
              <ShieldCheck size={16} aria-hidden="true" /> One ledger, no rewrites
            </h3>
            <p>{ACCURACY_METHOD.ledger}</p>
          </article>
        </div>
        <p className="apex-data-note">
          Corrections follow the site-wide policy — a materially wrong projection is corrected in
          writing, never silently. See <a href="/corrections">corrections</a> and{" "}
          <a href="/methodology">the methodology</a>.
        </p>
      </section>
    </div>
  );
}
