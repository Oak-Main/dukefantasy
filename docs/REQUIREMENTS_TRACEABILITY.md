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
