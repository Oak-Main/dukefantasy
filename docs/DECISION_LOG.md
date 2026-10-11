# Decision log

## D-001 — Preserve the Sites Vinext foundation

The empty workspace was initialized with the bundled Cloudflare-compatible Vinext/Next.js starter. This satisfies the preview-hosting constraint without introducing a second framework.

## D-002 — Fixture-first vertical slices

Priority 1–5 experiences will be functional against deterministic typed fixtures before any credentialed adapter is enabled. Live adapters remain typed external dependencies.

## D-003 — Single application with modular domain boundaries

The MVP remains one deployable web app with `lib` and component boundaries rather than a monorepo. This minimizes operational overhead while preserving clean provider, simulation, analytics, and configuration interfaces.

## D-004 — Fictional neutral programs in demo mode

The preview uses clearly invented teams, coaches, players, and destinations. This avoids representing stale synthetic values as facts and avoids unlicensed marks.

## D-005 — Runtime-aligned agent concurrency

Agent concurrency is capped at four because the current environment exposes four slots. Parallel discovery and audit work is read-heavy; write-heavy ownership is sequenced.

## D-006 — Synthetic provenance is a first-class status

Demonstration records use `synthetic`, not `official` or implied-live language. Model cards state exactly which deterministic transforms exist and which validation work does not.

## D-007 — Native disclosure dialog

Odds and DFS remain opt-in. The disclosure uses the browser's native modal semantics for focus containment, Escape handling, and focus restoration while keeping Clean Mode as the default.

## D-008 — Private preview boundary

The release is deployed only through authenticated private Sites hosting. Public launch is a separate decision that requires licensed providers, distributed rate limiting, production load testing, tighter CSP, and legal approval.

## D-009 — Supported dependency baseline

The release uses patched Next/React/Vite/Cloudflare dependencies and Biome for the lint gate. Overrides pin audited transitive packages where upstream ranges otherwise resolve vulnerable versions.

## D-010 — Research report requires primary-source audit

The supplied Gemini report is retained as discovery input only. Material CFP, membership, SportsDataIO, Cloudflare streaming, authentication, cost, and model claims are corrected or quarantined in `docs/RESEARCH_REPORT_AUDIT.md` before they can influence code or public content.

## D-011 — Provider procurement remains competitive

Sportradar is the leading core-feed RFP candidate and SportsDataIO the leading reconciliation candidate, but neither is selected until a signed rights matrix, SLA, coverage response, quote, and replay/live pilot are compared. AP polling rights and NWS weather are separate source decisions.

## D-012 — Cloudflare-first stream pilot

Do not precommit to AWS, Fly.io, or another relay. Test the contracted streaming feed in an isolated Cloudflare Worker or Durable Object, always reconcile through REST, and add a minimal external relay only if measured lifecycle or vendor networking requirements demand it.

## D-013 — Deny-by-default public activation

Production readiness is represented by explicit evidence gates in `lib/release-readiness.ts`, `/api/readiness`, and the protected admin console. Flags record approvals but do not substitute for contracts or tests. Worker-level noindex remains hard-coded until an explicitly authorized public release changes it.

## D-014 — Public fixture beta on CFB Apex

Deploy the verified fixture application to the Cloudflare Worker custom domains `cfbapex.com` and `www.cfbapex.com`, with the latter returning a permanent redirect to the apex. The public URL authorization changes hosting scope only: fixture labels, global noindex, live-provider and commercial kill switches, and the live-launch evidence gates remain enforced. Wrangler deployment uses the reproducible `wrangler.deploy.jsonc` artifact configuration; Cloudflare creates the custom-domain DNS records and certificates.

## D-015 — NFL standings lane is computed, labelled, and not "official"

The homepage Standings lane ranks the league's top five by win percentage (a tie is half a win), then point differential, with points scored and team slug as deterministic tail tiebreaks (`topStandings` in `lib/homepage.ts`). Records come from `nfl.standings`, which the dataset builder tallies from final scores in the ESPN schedule it fetches and the adapter exposes as numeric `standings` rows. The lane says exactly that, carries the dataset date, and does not claim official seeding or division-leader status. Teams that have not played are omitted, and a fresh season falls back to "Standings publish after Week 1." The AP poll plumbing (`HomepageData.pollTables`) is removed from the homepage; `/rankings` keeps its own data.

## D-016 — Game of the Week is picked by combined record, not rank

`featuredGame` considers every game that is not final, canceled, or postponed and scores it by the win percentage of the two teams' records taken together (unpublished records add nothing; no games between them reads as .500). Ties go to a national or primetime window (NBC, ESPN/ABC, Prime Video, Netflix, recognised by network name and never by clock), then to the later kickoff, then to game id. The later-kickoff rule replaces the old earliest-game fallback: the earliest slot (the 9:30 AM London game on 2026-10-11) is the likeliest to be under way, or finished, before a visitor reads a build-time snapshot. When nothing eligible remains the homepage shows its existing "not published" state rather than a final. The marquee's "Rankings: AP preseason" link now points to the division hubs, and the week rail's "Top 25" tab and AP footnote render only when teams actually carry a rank, which the NFL build never does.

## D-017 — Dataset completeness is checked against ESPN, not assumed

No `dataset:verify` script existed, so the baked standings had never been cross-checked. Comparing them with ESPN's official standings found the builder dropped the Wed Sep 9 kickoff game (its fetch loop began on Sep 10), leaving Seattle and New England one game off, and keyed Washington by `was` instead of ESPN's `WSH`, which left it with no division, a fallback brand colour, and a three-team NFC East hub. The builder now fetches from Sep 9 (week numbering still anchors on Sep 10) and keys Washington correctly. `npm run dataset:verify` (`scripts/verify-nfl-standings.mjs`) compares the baked standings with ESPN's official feed and exits non-zero on any difference. It is deliberately not part of `npm run verify`: ESPN's standings feed can trail a just-finished game, and a live-network check must not block a deploy. Run it right after `npm run dataset:build`.

## D-018 — Kickoff dates and clocks are UTC labelled as ET (open, not fixed here)

The builder writes each game's date, weekday, and clock from the UTC instant but labels the clock "ET", so a 4:25 PM ET kickoff reads "8:25 PM ET" and Sunday- and Monday-night games are dated a day late, which files them under the following Monday-to-Sunday homepage week. Until it is fixed, Sunday Night Football cannot be that week's marquee and the national-window tiebreak only sees Thursday and special-window games. Because every schedule surface shares the defect, this change leaves it alone rather than patching one card; the marquee ranks by relative order, which the shared labelling preserves. Fixing it is a cross-cutting change to date semantics (about fifteen consumers of `Game.date`) and needs its own review.
