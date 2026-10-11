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
| Live score overlay between deploys | `lib/live-scoreboard.ts`, `lib/live-scoreboard-store.ts`, `useLiveScoreboard`, `LiveScoreAnnouncer`, scoreboard/schedule/game views in `HubApp`, team hub schedule and banner | `tests/live-scoreboard.test.ts`, `tests/live-scoreboard-store.test.ts`, browser run against the built worker with a mocked feed and the real ESPN feed | Complete for scoreboard, schedule, game header, team schedule, ticker, finals strip; watch board, conference hubs, and homepage week cards remain snapshot-only (A-022) |
