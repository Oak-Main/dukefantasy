# Requirements traceability

| Requirement group | Implementation | Evidence | Status |
|---|---|---|---|
| Agent operating system | `AGENTS.md`, `.codex/`, `docs/AGENT_ROSTER.md`, `docs/HANDOFF_PROTOCOL.md` | Repository inspection | Complete |
| Scoreboard and schedule | Catch-all routes, `HubApp`, typed fixtures | Unit, link, rendered HTML, desktop/mobile browser journeys | Complete |
| Portal and volatility | Portal route, filters, comparison states, candid fixture model card | Browser journey + model documentation | Complete (fixture) |
| Playoff simulator | Deterministic simulation, URL scenarios, participant validation, two-sided forcing | Six domain tests + API integration + browser journey | Complete (fixture) |
| Coaching and buyout | Coaching routes, timeline, searchable carousel, buyout calculator | Formula and browser checks | Complete (fixture) |
| DFS projections | Disclosure-gated route with inactive-player zeroing | Domain test + browser journey | Complete (fixture) |
| Team/player/conference/stadium | Dynamic templates with conference slug filtering | Route/link tests + visual QA | Complete (fixture) |
| Provenance and fixture labeling | Synthetic status, visible demo/source/time badges | Contract tests + browser evidence | Complete |
| Clean Mode default | Device-local preference with native disclosure dialog | Keyboard/browser journey | Complete |
| Accessibility | Semantic UI, native modal behavior, focus states, reduced motion | Automated assertions + keyboard browser QA | Complete with manual-screen-reader follow-up |
| SEO | Canonical-domain metadata, structured data, noindex robots, empty sitemap, feeds | SEO and rendered HTML tests | Complete for public fixture beta |
| Ads/CRM/affiliate/social | Inert/provider-neutral fixtures and governance documents | Docs and opt-in journeys | Complete as architecture only |
| Security/operations | Worker headers, request validation/caps, health/readiness, identity/allowlist admin, deployment config/runbooks | Zero high npm audit + integration tests + Wrangler dry run | Complete pending live hostname smoke test |
| Independent release review | Product, data licensing, sports-model audit, then red-team re-review | `docs/BUG_AUDIT.md` and agent handoffs | Complete after final re-review |
| Research-report validation | Primary-source correction and claim quarantine | `docs/RESEARCH_REPORT_AUDIT.md` | Complete for July 31 report |
| Live provider procurement | Common rights/coverage/SLA/pricing questionnaire | `docs/PROVIDER_RFP.md`, `docs/DATA_PROVIDER_MATRIX.md` | Blocked: vendor responses/contracts |
| Live ingestion policy | Canonical transitions, documented correction handling, environment isolation, idempotency material | `lib/live-data.ts`, `tests/live-data.test.ts`, `docs/LIVE_DATA_STRATEGY.md` | Foundation complete; adapters/bindings blocked |
| Public activation controls | Deny-by-default evidence gates and staged runbook | `lib/release-readiness.ts`, `/api/readiness`, `/admin`, `docs/PUBLIC_LAUNCH_RUNBOOK.md` | Complete for pre-deployment gating |
| Replay/shadow pilot | Contracted provider replay and live comparison | Future provider adapters, D1/R2/Queue bindings, pilot artifacts | Blocked: contract/credentials |
| Public fixture URL | CFB Apex branding, Cloudflare Worker config, apex/`www` routes, noindex and live kill switches | `wrangler.deploy.jsonc`, Worker redirect, `docs/DEPLOYMENT_EVIDENCE.md` | Complete |
| Public live-data URL | Licensed, tested, staffed, legal-approved, explicitly authorized release | Public launch runbook and final release evidence | Not authorized |
| NFL snapshot integrity and freshness | Week-keyed ESPN schedule, ET dates/labels, TBD-time handling, fail-closed completeness gate, finals-only scores (`scripts/build-nfl-dataset.mjs`) | `tests/schedule-integrity.test.ts` (40-test suite incl. independent DST oracle), `npm run dataset:verify` (ESPN kickoff text + official standings, 32/32 teams), mutation check against the original defects | Complete |
| NFL week selection | `defaultScoreboardWeek`, `weekGames`, watch-board initial week, Eastern `datasetAsOf`, chronological same-day order | `tests/schedule-integrity.test.ts`; rendered `/`, `/scores`, `/watch` at Week 5 | Complete |
| Editorial staleness labelling | `deskBoardStatus` + fantasy desk "Behind the NFL calendar" caption; injury research stays fail-closed | `tests/domain.test.ts`; rendered `/fantasy` | Complete; weekly research content itself is an owner-supplied input |
| NFL homepage league picture and marquee | `topStandings` and `featuredGame` in `lib/homepage.ts`, `standings` in `lib/cfb-dataset.ts`, `RankingsLane`, `MarqueeGame`, `WeekScoreboard`, Washington's `wsh` key in the dataset builder | `tests/homepage.test.ts`, rendered-HTML and browser check at Week 5 | Complete |
| Live score overlay between deploys | `lib/live-scoreboard.ts`, `lib/live-scoreboard-store.ts`, `useLiveScoreboard`, `LiveScoreAnnouncer`, scoreboard/schedule/game views in `HubApp`, team hub schedule and banner | `tests/live-scoreboard.test.ts`, `tests/live-scoreboard-store.test.ts`; a manual browser run against the built worker on 2026-10-11 with a mocked feed and the real ESPN feed (not part of `npm run verify`) | Complete for scoreboard, schedule, game header, team schedule, ticker, finals strip; watch board, conference hubs, and homepage week cards remain snapshot-only (A-025) |
| Eastern days and NFL weeks in every consumer | `easternDay` (`lib/eastern.ts`) for the snapshot as-of day and the team hub's "today"; `slateFinals` for the homepage finals strip; UTC calendar formatting in `GamedayPlannerCard` | `tests/schedule-integrity.test.ts` (Eastern-day sweep against the DST oracle, team hub at 8:25 PM ET Sunday, kickoff labels vs ESPN's text incl. weekday), `tests/homepage.test.ts` (rail tabs, finals by slate), `tests/rendered-html.test.mjs` (game page under a Los Angeles zone); each fix mutation-checked against the original defect | Complete |


## October 20, 2026 NFL refresh release

- Owner authorized applying the verified package, completing integrations, checking and deploying to dukefantasy.com.
- Scope: Week 7 schedule, 93 final results, 32 standings, 399 corroborated injury ledger/watch rows, four conditional fantasy boards, 30 roster moves, 15 yardage leaders and Monday dated practice.
- Reviewed sources and exceptions: data/content-refresh/2026-10-20/package.json and sources.json. Two publishers may share upstream feeds; future Weeks 8–18 remain ESPN planning data.
- Builds reproduce the selected snapshot and preserve source timestamps. Source age is visible per module; raw provider injury updates do not silently override corroborated editorial publication.
- International games retain neutral-site, venue, city and country. Washington WAS/WSH normalizes to the WSH lookup key. Monday/Tuesday practice has supported fields; estimated walkthroughs retain dates.
- Transactions/stat leaders have native routes. Fantasy navigation reaches /fantasy-desk; unsupported college filters/bracket and homepage preseason ratings are removed. DFS accuracy remains unpublished.
- Redraft half-PPR, one QB, typical 10–12 teams; availability is conditional. No fabricated ownership, weather, numeric forecasts, historic picks or unverified full roster/film/scheme baseline.
- Runtime flags, Clean Mode and commercial kill switches are preserved. Release validation and deployment evidence: docs/RELEASE_2026-10-20.md.
- Production dependency checks: sharp 0.35.5 and source-map-js 1.2.2 overrides address the two verified advisories; npm audit --omit=dev reports zero vulnerabilities.


## Week 7 automatic updates

Owner authorized two-source injury, inactive and results monitoring, with checks before each automatic deployment. Added separate module source dates, a dated complete-team inactive view, serialized writer lock, and a fail-closed recorded-evidence gate. The deployment command requires evidence, full verification, fresh ESPN comparison, production dependency audit, Cloudflare types/dry run, then production smoke verification; rollback uses the captured previous Worker version. Two bounded schedules in the existing chat cover twice-daily reports and half-hour game windows through October 27, 2026, Pacific. No future observations are fabricated and no single-source update publishes. Local host/app and credentials must remain available. See docs/WEEK7_AUTOMATIC_UPDATES.md.

Week 7 timetable follow-up (2026-10-20): public cadence now matches active automatic checks. Deterministic tests cover the Tuesday afternoon review, early Sunday start and expiry; rendered checks accept the completed schedule state.

Official designations (2026-10-20): injury and inactive evidence tests exercise mismatched dates, emergency-quarterback disagreements and unsourced removals alongside final-score gates.

2026-10-21 Week 7 practice run: research-runs/2026-10-21T091337Z records 23 dated practice entries and 11 watch updates with two publisher families per changed fact. Two-source evidence gate and release preflight apply; results/standings and module source dates remain unchanged.

2026-10-21 eligibility run: research-runs/2026-10-21T161749Z contains five changed-fact observations and held claims. Preserve all full-module dates, 272-game results/standings and unrelated editorial data; the release date advances solely for the dated October 21 reserve record.

PR #34 date validation → scripts/week7-publication-dates.mjs, called by scripts/verify-week7-update.mjs; tests/week7-publication-dates.test.mjs is included in npm test. Covers invalid months/days, leap years including 1900/2000/2100, malformed types/strings, Eastern midnight and future limits, release-date bounds, retrieval/status/week guards, immutable historical publication inputs, and the executable two-publisher gate. NFL inputs and active update schedules are unchanged.

2026-10-22 reconciliation → research-runs/2026-10-22T091803Z contains changed-fact observations, the full NFL/ESPN results comparison attestation and held source issues. The injury renderer labels dated report types and filters them by team; rendered HTML checks distinguish a regular Wednesday practice report from a Bears walkthrough estimate. The required evidence, full release preflight and exact production content-hash checks govern publication.

2026-10-22 morning release → research-runs/2026-10-22T161308Z and PR #37 record 27 additional Wednesday practices, 11 existing watch-cell updates and explicit Carson Steele IR placement (39 changed facts). Preserve module dates and all 272 games. Full preflight passed: 141 unit, 8 rendered, accessibility/SEO/link/visual/migration/seed, live dataset comparison, zero production audit findings, Cloudflare types/dry run, and 16 exact-hash public smoke checks. Follow-up research-runs/2026-10-22T163300Z replaces three practice citations and one watch citation with a directly fetched HTTP-200 production Yahoo canonical URL. Fresh complete NFL/ESPN reconciliation re-verifies 107 games without altering results; the full release gate runs again.

2026-10-22 TNF check → research-runs/2026-10-22T223012Z records one changed injury fact: explicit Alijah Vera-Tucker IR placement, confirmed by Patriots/NFL transactions, ESPN current status and CBS. Preserve all 169 dated practice records, the archived prior official OUT designation, module dates and 272-game snapshot. The complete publication preflight and exact-hash public smoke checks govern release.

2026-10-22 TNF release audit remediation → package.json and package-lock.json pin Next.js 16.4.2 instead of 16.3.8 after the production audit newly blocked publication. Keep candidate-preflight.log as the failed gate evidence; require a fresh complete preflight, zero production audit findings, Cloudflare dry run and exact-hash public smoke checks before acceptance.

2026-10-22 TNF mobile correction: the live mobile gate found both injury tables hidden by the shared desktop-only class, with no mobile card replacement. Remove that class only on the two injury table wrappers, retaining their bounded horizontal scrolling. Preserve PR39 player facts, all 169 dated practices and the Next.js security update. A new actual complete NFL/ESPN review re-verifies all 107 games through Week 7; retain module source dates and record the actual review retrieval. Require full preflight, exact-hash public smoke and desktop/mobile checks before release. Prior release recovery is verified in outputs/week7-automation/2026-10-22T223012Z.

2026-10-23 Week 7 reconciliation: publish the NFL/ESPN-confirmed Patriots 24–Bears 30 Thursday final, derive all standings and compare 32 fresh ESPN rows, and retain the complete 272-game schedule/international metadata. Publish 135 corroborated October 22 practices and the two complete Thursday inactive lists, explicitly distinguishing emergency third quarterbacks. Add actual October 22 IR placements for Joseph-Day, Simmons, Rozeboom and Arroyo after club/NFL/ESPN/CBS agreement. Keep all prior practice/designation history and complete injury/fantasy/transaction/leader dates; partial research does not renew them. Exclude a reused 2018 inactive slug and a Sun-Times URL returning unrelated postgame content. Evidence and held claims: data/content-refresh/research-runs/2026-10-23T091221Z/. Full release gates and exact-hash public verification are required.

2026-10-23 Week 7 release recovery: after the homepage returned the candidate while /scores still returned the prior revision, the exact-hash smoke failed and production was rolled back and verified on both domains. Bound stale-header convergence to 16 requests with two-second spacing; never accept another hash, and keep HTTP/network failures immediate. Add five focused tests. Re-review all 107 NFL/ESPN games, both complete inactive lists and 32 ESPN standings rows before repeating every publication check. Archive per-team observed/derived standings for both research runs without changing the original retrieval time. Preserve all player facts, 304 dated practices, unrelated module dates and 272-game metadata. A CBS omission does not activate Anthony Johnson Jr.; retain his last verified IR record. Evidence: data/content-refresh/research-runs/2026-10-23T094000Z/.

2026-10-23 retry-cap follow-up: enforce the documented maximum at the helper boundary by rejecting non-integer or out-of-range attempt counts before any HTTP request. A focused test covers 17, zero, negative, fractional, NaN, infinite and string values. Lower positive test budgets remain supported. No application or publication data changes; verify the current production hash with the corrected CLI and retain the successful Worker deployment.
