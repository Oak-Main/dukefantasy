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

## D-018 — The live score overlay is client-side, shared, id-only, and fail-quiet

The baked snapshot stays the source of truth for week membership, order, venue, TV, and kickoff text. `/api/nfl-scoreboard` overlays only status, status detail, and scores, and only for games that are in progress or final. Games match by ESPN event id (`Game.id`, and `TeamScheduleGame.eventId` for team schedule rows) and never by team name or time. One ref-counted poller (`lib/live-scoreboard-store.ts`, exposed as `useLiveScoreboard`) serves the ticker, finals strip, scoreboard, schedule, game header, and team hub: 60-second cadence, paused while the tab is hidden, refetch when it becomes visible, request timeout, and abort when the last consumer unmounts. A failed, degraded, or malformed poll is "no information": last-good patches stay, in-progress patches that no poll has confirmed for five minutes revert to the baked row, and finals are terminal. Ids a payload does not mention are carried over, because the route drops a failed scoreboard day without marking the payload degraded. Nothing in the overlay renders an error.

Rejected: per-component polling (N requests per page and a ticker that can disagree with the card beside it); a server-side fetch during render (the snapshot is deliberately build-time and public rendering makes no provider call); replacing the patch map on every poll (one flaky upstream day would blank every live game for a minute).

## D-019 — Live state is announced sparingly and labelled as live

Visible scores and clocks update silently. One polite, atomic live region per page (`LiveScoreAnnouncer`) announces only kickoffs and finals for games on that page, coalesced per poll (at most once a minute; more than three collapse to a count), never scores or clocks, and never state that was already true when the page loaded. The only motion the overlay adds is a pulsing dot, declared only under `prefers-reduced-motion: no-preference`. Scores that come from the live feed carry a "Live feed · checked <time ET>" label beside the dataset label. Team records and standings are not adjusted from live results; that would be inference presented as fact.
