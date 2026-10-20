/**
 * Fantasy Desk — the four weekly decision rails (research prompts 11-14).
 *
 * Start/Sit tiers and Trade values publish on their cadences; Waiver and
 * Rookie render their honest "not published" shells until their Tuesday
 * slots land. Decision boards carry no projections — that contract is
 * enforced upstream by the ingest validators and the domain tests.
 */

import { DataBoardHero, DataBoardSummary, DataBoardEmpty, formatDataDate } from "./data-board-primitives";
import { EvidenceLinks } from "./evidence-links";
import type { BroadcastTeam } from "@/lib/homepage";
import {
  fantasyDesk,
  currentNflWeek,
  deskBoardStatus,
  TIER_LABELS,
  TIER_ORDER,
  DESK_CADENCE,
  type StartSitBoard,
  type TradeBoard,
  type SitTier,
  type Market,
  type WaiverBoard,
  type WaiverAdd,
  type WaiverDrop,
  type RookieBoard,
} from "@/lib/fantasy-desk";

const MARKET_LABEL: Record<Market, string> = { buy_low: "Buy low", sell_high: "Sell high", fair: "Fair" };

function ConfidencePill({ value }: { value: string | null }) {
  if (!value) return null;
  return <span className={`db-confidence db-confidence--${value}`}>{value} confidence</span>;
}

function MarketPill({ value }: { value: Market }) {
  return <span className={`db-status db-status--${value === "fair" ? "available" : "committed"}`}>{MARKET_LABEL[value]}</span>;
}

function StartSitSection({ board }: { board: StartSitBoard }) {
  return (
    <section className="db-section" aria-label="Start/Sit tier board">
      <div className="db-section-heading">
        <h2 className="font-display">Start/Sit Tier Board — Week {board.week}</h2>
        <p>
          Targeted early Week 7 tiers for half-PPR redraft. Check final availability before lock. Numeric projections stay on the{" "}
          <a className="db-hero-link" href="/dfs">DFS ledger</a>. As of {formatDataDate(board.as_of)}.
        </p>
      </div>
      {board.positions.map((group) => (
        <div key={group.position} className="db-team-ledger-summary">
          <h3 className="font-display">{group.position}</h3>
          <div className="db-ledger-grid">
            {TIER_ORDER.filter((tier) => group.tiers.some((t) => t.tier === tier)).map((tier) => {
              const group_ = group.tiers.find((t) => t.tier === tier as SitTier);
              return (
                <div key={tier} className="db-mover-card">
                  <div className="db-section-heading">
                    <h4>{TIER_LABELS[tier as SitTier]}</h4>
                  </div>
                  <ul className="db-note-row">
                    {group_?.players.map((row) => (
                      <li key={`${group.position}-${row.player}`}>
                        <span className="db-primary-cell">
                          <span className="db-player-link">{row.player}</span>
                          <small className="db-team-link">{row.team_slug}</small>
                        </span>
                        <span className="db-expandable-note">{row.note}<EvidenceLinks urls={row.sources ?? []} /></span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {board.tough_calls?.length ? (
        <div className="db-section-heading">
          <h3 className="font-display">Tough calls</h3>
          <div className="db-ledger-grid">
            {board.tough_calls.map((tc) => (
              <div key={tc.player} className="db-mover-card">
                <span className="db-primary-cell">
                  <span className="db-player-link">{tc.player}</span>
                  <small className="db-team-link">{tc.team_slug}</small>
                </span>
                <p className="db-expandable-note">{tc.verdict}</p>
                <EvidenceLinks urls={tc.sources ?? []} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TradeSection({ board }: { board: TradeBoard }) {
  return (
    <section className="db-section" aria-label="Trade value big board">
      <div className="db-section-heading">
        <h2 className="font-display">Trade Watch — Week {board.week}</h2>
        <p>
          Editorial rest-of-season watch for redraft half-PPR. Tiers and market tags are judgments, not numeric trade values.
          League format and injury news can change the decision. As of {formatDataDate(board.as_of)}.
        </p>
      </div>
      {board.boards.map((group) => (
        <div key={group.position} className="db-table-wrap">
          <h3 className="font-display">{group.position}</h3>
          <table className="db-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Tier</th>
                <th>Basis</th>
                <th>Market</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr key={`${group.position}-${row.player}`}>
                  <td>
                    <span className="db-primary-cell">
                      <span className="db-player-link">{row.player}</span>
                      <small className="db-team-link">{row.team_slug}</small>
                    </span>
                  </td>
                  <td className="font-display">{row.tier}</td>
                  <td>{row.basis}<EvidenceLinks urls={row.sources ?? []} /></td>
                  <td>
                    <MarketPill value={row.market} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {board.swing_trades?.length ? (
        <div className="db-section-heading">
          <h3 className="font-display">Swing trades this week</h3>
          <div className="db-ledger-grid">
            {board.swing_trades.map((sw) => (
              <div key={`${sw.give}-${sw.get}`} className="db-mover-card">
                <p className="db-primary-cell">
                  <strong>Give</strong> {sw.give} · <strong>Get</strong> {sw.get}
                </p>
                <p className="db-expandable-note">{sw.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function FantasyDeskPage({ teams }: { teams: BroadcastTeam[] }) {
  const desk = fantasyDesk;
  const published = [desk.waiver, desk.startSit, desk.rookie, desk.trade].filter(Boolean).length;
  // Staged boards are shown with their own week and date, but a board that has
  // fallen behind the NFL calendar must never read as "live" advice.
  const statuses = DESK_CADENCE.map((cadence) => ({ cadence, status: deskBoardStatus(cadence.key) }));
  const behind = statuses.filter(({ status }) => status?.current === false);
  const currentCount = statuses.filter(({ status }) => status?.current === true).length;
  const sourcingCaption = `Early edition: half-PPR redraft, one QB, typical 10–12 teams; superflex exceptions are labeled. Two publishers per factual entry; they may share upstream feeds. Null means unverified. Coverage is targeted across ${teams.length} teams, not a complete ranking.`;
  const behindCaption = behind.length
    ? `Behind the NFL calendar: ${behind
        .map(({ cadence, status }) => `${cadence.label} is the Week ${status?.covers} edition`)
        .join("; ")}. Treat ${behind.length === 1 ? "it" : "them"} as archive context, not this week's advice, until the next edition publishes. `
    : "";
  return (
    <div className="db-page">
      <DataBoardHero
        eyebrow="FANTASY DESK"
        title="Weekly decision rails — waiver, start/sit, rookies, trades"
        description="Four sourced boards on the fantasy calendar: waiver adds after MNF, start/sit tiers by Thursday, rookie usage Tuesdays, and rest-of-season trade values. Every claim of fact carries its source; tiers are decisions, never projections."
      />
      <DataBoardSummary
        label="Fantasy desk status"
        items={[
          { label: "Boards published", value: `${published} / 4`, emphasis: true },
          {
            label: currentNflWeek === null ? "Current" : `Current for Week ${currentNflWeek}`,
            value: currentNflWeek === null ? "—" : `${currentCount} / 4`,
          },
          { label: "Start/Sit", value: desk.startSit ? `Week ${desk.startSit.week}` : "—" },
          { label: "Trade values", value: desk.trade ? `Week ${desk.trade.week}` : "—" },
          { label: "Waiver watch", value: desk.waiver ? `for Week ${desk.waiver.week_adding_for}` : "—" },
          { label: "Rookie usage", value: desk.rookie ? `Week ${desk.rookie.week}` : "—" },
        ]}
        caption={`${behindCaption}${sourcingCaption}`}
      />

      {desk.startSit ? <StartSitSection board={desk.startSit} /> : (
        <DataBoardEmpty title="Start/Sit tiers not published yet" description={DESK_CADENCE.find((c) => c.key === "startSit")?.slot ?? ""} />
      )}
      {desk.trade ? <TradeSection board={desk.trade} /> : (
        <DataBoardEmpty title="Trade values not published yet" description={DESK_CADENCE.find((c) => c.key === "trade")?.slot ?? ""} />
      )}
      {desk.waiver ? <WaiverSection board={desk.waiver} /> : (
        <DataBoardEmpty title="Waiver Wire Watch opens Tuesday" description="The waiver edition covers the FOLLOWING week's adds — it compiles after Monday night football so every usage claim is grounded in completed games." />
      )}
      {desk.rookie ? <RookieSection board={desk.rookie} /> : (
        <DataBoardEmpty title="Rookie Usage Report opens Tuesday" description="Snap shares and usage trends compile after the week completes — usage only, no projections." />
      )}
    </div>
  );
}

function WaiverSection({ board }: { board: WaiverBoard }) {
  const byPosition = new Map<string, WaiverAdd[]>();
  for (const a of board.adds) {
    if (!byPosition.has(a.position)) byPosition.set(a.position, []);
    byPosition.get(a.position)!.push(a);
  }
  return (
    <section className="db-section" aria-label="Waiver wire watch">
      <div className="db-section-heading">
        <h2 className="font-display">Waiver Wire Watch — adding for Week {board.week_adding_for}</h2>
        <p>
          Adds compiled from completed Week {board.week_adding_for - 1} usage (including Monday night). Ownership
          percentages publish only when a sourced number exists
          {board.adds.every((add) => add.ownership_pct === null)
            ? " — this edition none could be verified, so the board skews to emergent players and confirmed injury replacements"
            : ""}
          . As of {formatDataDate(board.as_of)}.
        </p>
      </div>
      {[...byPosition.entries()].map(([position, adds]) => (
        <div className="db-table-wrap" key={position}>
          <h3 className="font-display">{position} adds</h3>
          <table className="db-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Ownership</th>
                <th>Why</th>
                <th>Hold</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {adds.map((a) => (
                <tr key={a.player}>
                  <td>
                    <span className="db-primary-cell">
                      <span className="db-player-link">{a.player}</span>
                      <small className="db-team-link">{a.team_slug}</small>
                    </span>
                  </td>
                  <td>{a.ownership_pct === null ? "n/p" : `${a.ownership_pct}%`}</td>
                  <td>{a.why}<EvidenceLinks urls={a.sources} /></td>
                  <td>{a.hold === "rest_of_season" ? "Rest of season" : "Stream"}</td>
                  <td><ConfidencePill value={a.confidence} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {board.drops?.length ? (
        <div className="db-section-heading">
          <h3 className="font-display">Drop candidates</h3>
          <div className="db-ledger-grid">
            {board.drops.map((d) => (
              <div key={d.player} className="db-mover-card">
                <span className="db-primary-cell">
                  <span className="db-player-link">{d.player}</span>
                  <small className="db-team-link">{d.team_slug}</small>
                </span>
                <p className="db-expandable-note">{d.why}</p>
                <EvidenceLinks urls={d.sources} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {board.priority_note ? (
        <p className="db-quiet-caption" style={{ marginTop: 12 }}>
          <strong>Priority spend:</strong> {board.priority_note}
        </p>
      ) : null}
    </section>
  );
}

function RookieSection({ board }: { board: RookieBoard }) {
  return (
    <section className="db-section" aria-label="Rookie usage report">
      <div className="db-section-heading">
        <h2 className="font-display">Rookie Usage Report — Week {board.week}</h2>
        <p>
          {board.rookies.length} verified 2026 rookie highlights from completed games. Snap shares are unverified and remain unpublished.
          As of {formatDataDate(board.as_of)}.
        </p>
      </div>
      <div className="db-table-wrap">
        <table className="db-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Pos</th>
              <th>Usage line</th>
              <th>Trend</th>
              <th>Fantasy meaning</th>
            </tr>
          </thead>
          <tbody>
            {board.rookies.map((r) => (
              <tr key={r.player}>
                <td>
                  <span className="db-primary-cell">
                    <span className="db-player-link">{r.player}</span>
                    <small className="db-team-link">{r.team_slug}</small>
                  </span>
                </td>
                <td>{r.position}</td>
                <td>{r.why}<EvidenceLinks urls={r.sources} /></td>
                <td>{r.trend === "rising" ? "▲ Rising" : r.trend === "fading" ? "▼ Fading" : "— Steady"}</td>
                <td>{r.fantasy_meaning === "waiver_relevant" ? "Waiver relevant" : r.fantasy_meaning === "bench_stash" ? "Bench stash" : "Dynasty only"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
