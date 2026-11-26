# Data provider matrix

Technical completion never advances production readiness without approved rights.

Rights classes: `R0_FIXTURE`, `R1_PUBLIC_DOMAIN`, `R2_LINK_ONLY`, `R3_CITED_FACTS`, `R4_LICENSED_DISPLAY`, `R5_LICENSED_DERIVATIVE`, `R6_PARTNER`, `R7_RESTRICTED`.

| Dataset | Preferred production source | Cost / rights | Cadence | Fallback | Readiness |
|---|---|---|---|---|---|
| Scores, schedules, rosters, statistics | Enterprise feed with display/history/derived rights | Enterprise, R4/R5 | Contract-safe; live seconds | Licensed last-good marked stale | Blocked: contract |
| Portal/recruiting | Licensed feed plus direct public announcements | Enterprise/manual, R4/R3 | Hourly in windows | Verified public events only | Blocked: NCAA portal is restricted |
| Rules/rankings | Official season document plus licensed feed if needed | Open/manual, R3 | Event driven | Last verified version with expiry | Conditional |
| Injuries/availability | Official public report or licensed feed | Enterprise/manual | On publication | Unknown, never inferred | Blocked: source/counsel |
| Odds | Licensed commercial display/history feed | Paid, R4/R5 | Provider-safe, about 60s | Stale only if retention permits | Blocked: rights/jurisdiction |
| Weather | NWS for US venues or licensed SLA provider | Open/paid, R1 | 10–15m in game window | Last forecast marked stale | Conditional |
| Broadcast/radio | Licensed metadata and official destinations | Enterprise/manual, R2/R4 | Daily/link checks | Text unavailable state | Conditional |
| Tickets/merchandise/travel | Signed partner registry | Revenue share, R6 | Contract specific | Hide module | Blocked: agreement |
| Coach contracts | Executed public-record document/amendment | Manual, R3 | Event driven | Last terms with as-of date | Conditional: legal review |
| Stadium logistics | Venue/university/municipal/transit page | Manual, R3/R2 | 30d and pregame | Suppress expired advisories | Conditional |
| NIL estimates | Licensed methodology and rights | Enterprise, R5 | Provider specific | Omit | Blocked |
| Marks/photos/headshots | School/conference/CLC/photographer license | Enterprise, R4 | Per license | Text monogram/no image | Blocked |

## NFL live scoreboard: TheSportsDB finals fallback (added 2026-11-26)

`/api/nfl-scoreboard` reads ESPN's public scoreboard first. Only when ESPN returns no events at all does it read TheSportsDB's NFL past-results feed (league 4391) through the portfolio's TrueAPI ingest cache, reconciled to the dataset's ESPN ids and limited to finals. See the November 26, 2026 decision log entry.

| Field | Record |
|---|---|
| Provider / dataset | TheSportsDB v1 `eventspastleague.php?id=4391` (last 15 NFL results), via `https://ingest.oakandmain.dev/data/thesportsdb/…` |
| Use | Fallback finals (scores, final status) for the ticker overlay and finals strip; never in-progress state, never odds, images or marks |
| Quota | No calls from this site to TheSportsDB. The ingest worker polls the feed about hourly under the shared Premium key (100 requests/minute; ingest budget breaker at 30/minute) |
| Rights / contract | TheSportsDB paid Premium tier (shared portfolio subscription, billed to sports-always.com; owner confirmed continuation 2026-11-26). The free key is non-commercial and must not be used. Terms not yet reviewed by counsel: queue for review |
| Permitted uses | Public display of final scores on site pages. No export, SEO feed, social or model-training use recorded |
| Caching / history | Ingest copy TTL 3600s; route isolate cache 60s; browser 30s. No history stored by this site |
| Stale threshold / hard expiry | Finals only, so no live threshold applies. Payload `asOf` is the ingest copy's own `fetchedAt` |
| Attribution | Not displayed today. Add "Scores: TheSportsDB" wherever a fallback source line is surfaced |
| Secret location | None in this repo; the key lives only in the `trueapi-ingest` Worker's secrets |
| Owner / reviewer | Owner: Oak and Main Developers LLC; reviewer: pending |
| Kill switch | `DISABLE_TSDB_FALLBACK=true` (Worker var) restores ESPN-only behaviour |
| Next legal review | With the next provider-rights pass |

Each future provider row must record quota, permitted public/SEO/social/export/model uses, caching/history, territory, attribution, contract version, stale threshold, hard expiry, secret location, owner, reviewer, kill switch, and next legal review.

## 2026 procurement shortlist

| Candidate | Documented capability | Material limitation | Decision |
|---|---|---|---|
| Sportradar NCAAFB v7 | Division I scores; FBS PBP; schedules, rosters, rankings, transfers; Realtime Push add-on | Push is non-stateful, does not carry all status updates, and requires REST recovery; coverage/latency and all downstream rights remain contract-specific | Primary RFP candidate, not selected |
| SportsDataIO NCAA Football | FBS scores, schedules, stats, polls, rosters, injuries, odds, Replay | Published game-state delay is about 30–60s, live stats about 15–20s, and college depth charts are unavailable | Reconciliation RFP candidate, not a promised low-second failover |
| Genius Sports / NCAA LiveStats | Official NCAA collection/distribution relationships | Exact regular-season FBS media coverage and usable downstream rights are not published | Official-channel diligence candidate |
| Stats Perform / Opta | Enterprise live, historical, advanced, and editorial data products | Derivative, AI, archive, data-mixing, and AP rights require careful order-form review | Premium comparison candidate |
| CollegeFootballData | Accessible historical/live development APIs | Public commercial display, redistribution, retention, and derivative rights are not established for this product | Evaluation only pending written permission |
| AP | AP Top 25 and sports content licensing | Direct or expressly sublicensed commercial rights required | Preferred named poll-rights path |
| NWS | U.S. forecasts, observations, and alerts | User-Agent, cache, issuance/valid-time, and rate guidance apply; observations are not instantaneous | Preferred weather source |

No pricing estimate from the supplied research report is approved. Quote-based products remain `QUOTE REQUIRED` until a written proposal is attached to the procurement record.
