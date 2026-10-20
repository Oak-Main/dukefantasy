# Duke Fantasy

NFL schedules, scores, standings and sourced fantasy decision boards at [dukefantasy.com](https://dukefantasy.com). Built with Vinext, Next.js App Router, React, TypeScript and a Cloudflare Worker.

## Develop and verify

```sh
npm ci
npm run dev
npm run verify
```

Release builds reproduce the reviewed snapshot selected by `data/content-refresh/current.json`. The October 20, 2026 edition covers 93 final scores through Week 6, Week 7's schedule, 32 standings, 399 injury ledger/watch entries, four fantasy boards, 30 transactions and 15 season yardage leaders. Every module shows its source date; a new build does not renew it.

`npm run dataset:verify` compares the snapshot with fresh ESPN schedules, final scores and standings. `node scripts/build-nfl-dataset.mjs --live` is an explicit single-provider research pull, not a substitute for the two-publisher review. Review changes and coverage before selecting a new release snapshot.

The package and source register are in `data/content-refresh/2026-10-20/`. Native editorial inputs are `data/fantasy-desk/current.json` and `data/injury-research/current.json`. Imports preserve Monday–Saturday participation; dated estimated walkthroughs are separate from final designations.

## Product routes

- `/scores`, `/schedule`, `/teams`, `/conferences`, `/watch`: NFL utility.
- `/fantasy-desk`: conditional half-PPR redraft waivers, early lineup tiers, rookie highlights and trade watch.
- `/injuries`: corroborated ledger/watch and dated practice reports.
- `/transactions` (also `/transfer-portal`): sourced NFL roster moves.
- `/stats` (also `/rankings`): passing, rushing and receiving yardage leaders.
- `/data-sources`: source age, fetch times, verification and coverage limits.
- `/dfs`: published-pick ledger; projections and accuracy remain unpublished until actual picks exist.

Complete roster/depth, film and scheme datasets are not established by this refresh. Missing values remain unpublished. Weeks 8–18 are a single-provider planning schedule subject to flex changes. Do not substitute college datasets into NFL pages.

See [deployment instructions](docs/DEPLOYMENT.md) and [operations](docs/OPERATIONS_RUNBOOK.md). Secrets stay outside Git and browser code. Production retains the existing commercial kill switches.
