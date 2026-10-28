import { contentSourceModules, moduleSources, refreshAsOf, refreshLimitations, statLeaders, transactionCoverage, transactions, verificationPolicy } from "@/lib/content-refresh";
import { teams } from "@/lib/cfb-dataset";
import { DataBoardHero } from "./data-board-primitives";
import { EvidenceLinks } from "./evidence-links";

export function TransactionsPage({ teamSlug }: { teamSlug?: string }) {
  const names = new Map(teams.map(t => [t.slug, t.name]));
  const rows = transactions.filter(row => !teamSlug || row.from_team_slug === teamSlug || row.to_team_slug === teamSlug);
  return <div className="db-page">
    <DataBoardHero eyebrow={`Roster wire · As of ${moduleSources.transactions.sourceAsOf}`} title="NFL transactions, on the record." description={transactionCoverage} />
    <section className="apex-container db-section" aria-label="Verified NFL transactions">
      <p className="apex-data-note">{rows.length} corroborated moves · October 14–28, 2026 (targeted updates; each move retains its date) · <a href="/data-sources">Coverage & source dates</a></p>
      {rows.length ? <div className="research-card-grid">{rows.map(row => <article className="research-card" key={`${row.date}-${row.player}-${row.transaction_type}`}>
        <time dateTime={row.date}>{row.date}</time><h2>{row.player}</h2>
        <p>{names.get(row.to_team_slug ?? row.from_team_slug ?? "") ?? "Team not specified"}</p>
        <strong>{row.detail}</strong><EvidenceLinks urls={row.sources} />
      </article>)}</div> : <p className="db-empty">No corroborated moves for this team in the covered window.</p>}
    </section>
  </div>;
}

export function StatLeadersPage() {
  return <div className="db-page">
    <DataBoardHero eyebrow={`Historical 2026 regular season · As of ${moduleSources.leaders.sourceAsOf}`} title="NFL yardage leaders through Week 6." description="Historical October 20 edition. Week 7 leader proposals remain single-source research and are withheld until corroborated. These season totals are not weekly production or fantasy projections; complete player/team statistics and snap/route coverage are unavailable." />
    <div className="apex-container research-card-grid db-section">{["passing", "rushing", "receiving"].map(category => <section key={category} className="research-card" aria-labelledby={`leader-${category}`}>
      <h2 id={`leader-${category}`}>{category[0].toUpperCase() + category.slice(1)} yards</h2>
      <ol>{statLeaders.filter(row => row.category === category).map(row => <li key={row.player}><strong>{row.player}</strong> · {row.yards.toLocaleString("en-US")} yards</li>)}</ol>
      <EvidenceLinks urls={statLeaders.find(row => row.category === category)?.sources ?? []} />
    </section>)}</div>
  </div>;
}

export function ContentSourcesPage() {
  return <div className="db-page">
    <DataBoardHero eyebrow="Provenance & source freshness" title="No source, no silent claim." description="Source dates and fetch times stay attached to each module. Rebuilding the site never renews an old research date. Live scoreboard updates are attributed separately to ESPN." />
    <section className="apex-container db-section" aria-label="Source freshness">
      <p className="apex-data-note">Latest verified publication: <time dateTime={refreshAsOf}>{refreshAsOf}</time>. Module dates below identify the last complete review; individual dated updates do not renew untouched modules.</p>
      <div className="research-card-grid">{contentSourceModules().map(row => <article className="research-card" key={row.id}>
        <span className={`provider-state provider-state--${row.freshness === "current" ? "on" : "off"}`}>{row.freshness}</span>
        <h2>{row.label}</h2><p>{row.note}</p>
        <p>Source as of {row.sourceAsOf ? <time dateTime={row.sourceAsOf}>{row.sourceAsOf}</time> : "Not published"}<br />{row.fetchedAt ? `Fetched ${row.fetchedAt}` : "Precise fetch time not recorded"}<br />{row.compiledAt ? `Package compiled ${row.compiledAt}` : "No published package"}</p>
      </article>)}</div>
      <h2>Verification standard</h2><p>{verificationPolicy}</p>
      <EvidenceLinks urls={["https://www.nfl.com/schedules/2026/by-week/week-7", "https://www.espn.com/nfl/scoreboard/_/week/7/year/2026/seasontype/2", "https://www.cbssports.com/nfl/injuries/"]} />
      <h2>Coverage limits</h2><ul>{refreshLimitations.map(note => <li key={note}>{note}</li>)}</ul>
      <h2>Prior editions</h2><p><a href="/scores?week=7">Week 7 final scores</a> · <a href="https://github.com/Oak-Main/dukefantasy/blob/main/data/fantasy-desk/archive/2026-10-20.json">October 20 fantasy research archive</a> · <a href="https://github.com/Oak-Main/dukefantasy/blob/main/data/injury-research/archive/week7-through-2026-10-26.json">Week 7 injury research archive</a>. Historical evidence is not current availability advice.</p>
    </section>
  </div>;
}
