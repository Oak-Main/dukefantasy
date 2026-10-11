# Operations runbook

Daily fixture-beta checks: `https://cfbapex.com/api/health`, `/api/readiness`, apex and `www` TLS/redirect behavior, provider status, error rate, route smoke tests, source age, correction queue, and feature kill switches.

Production activation adds provider quota/circuit health, cache age, ingestion checkpoints, queue lag, cron/job result, simulation saturation, email confirmation/suppression, partner link expiry, ad layout impact, privacy requests, and cost alerts.

Live-game operations additionally watch provider sequence regressions, expected-versus-measured latency, Push heartbeat/reconnect, REST catch-up completeness, unmatched entities, illegal game-state transitions, undocumented score reversals, candidate quarantine rate, publication-version pointer updates, DLQ depth, and source/rights expiry. Provider failover never converts a slower reconciliation feed into an implied equal-latency source.

Kill switches separately freeze ingestion, publication, provider, scoreboard, PBP/stats, polls, portal, coaching, models, odds, ads, affiliates, email send, social output, indexing, and expensive simulation. Freezing publication preserves evidence collection. Health responses never expose secrets. Every consequential edit creates an audit event and retains source/version lineage.

## Game-day data refresh (NFL, dukefantasy.com)

The deployed site is a build-time ESPN snapshot plus a live overlay for the ticker and finals strip, so a deploy is the refresh. Before a kickoff window:

1. `npm run dataset:build` regenerates `lib/nfl-generated.ts` (about 3 seconds). It throws if the schedule is not exactly 272 games with 17 per team, so a failure here means keep serving the previous deploy and investigate; do not bypass it.
2. `npm run dataset:verify` cross-checks the snapshot against ESPN itself: kickoff labels versus ESPN's own kickoff text, the 272 event ids and kickoff instants, and computed standings versus ESPN's official standings. Exit 0 = verified, 2 = snapshot is behind (games went final after it was compiled; rebuild), 1 = disagreement (stop).
3. `npm run verify`, then deploy per `docs/DEPLOYMENT.md`.
4. After the deploy, spot-check `/scores` (lands on the current week), `/watch`, and a team page against the live ESPN scoreboard.

Editorial layers are separate inputs: weekly research JSON goes through `scripts/ingest-fantasy-desk.mjs` and `scripts/ingest-injury-research.mjs`. When a board is behind the NFL calendar the fantasy desk says so; never backfill it from model output.
