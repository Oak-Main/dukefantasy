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

## D-015 — NFL snapshot integrity is enforced at build time (dukefantasy.com)

`lib/nfl-generated.ts` is a build-time ESPN snapshot and every deploy is a data refresh (the Worker only overlays live scores in the ticker and finals strip). The 2026-10-11 pre-kickoff audit found the snapshot 8 days stale, missing 17 of 272 games (the Week 1 Wednesday opener and all of Week 18, dropped by a hand-typed Sep-10..Jan-5 UTC window), and every kickoff label wrong by four hours (UTC hours printed as "ET"; Sunday Night Football dated Monday). Decision: fetch the schedule by ESPN's own regular-season weeks (`seasontype=2&week=N`), use `event.week.number`, derive the date and `kickoffLabel` in `America/New_York`, render unflexed slots (`timeValid: false`, Weeks 16-18) as "Time TBD (ET)", retry upstream fetches, and **fail the build** unless the schedule is exactly 272 games with 17 per team. A stale-but-complete deploy beats a fresh-but-truncated one. Scores are baked for finals only; a game live at compile time keeps ESPN's pre-game detail string so a frozen "Halftime" can never outlive the game. Broadcaster names are normalised to the spellings the watch board orders by (ESPN flips "FOX"/"Fox").

## D-016 — The landing week follows the NFL week

The CFB-era helpers sent visitors to a December week (`/scores` opened on Week 15 because the rule was "next Saturday game") and cut the NFL week in half on the homepage (Mon-Sun window drops Monday Night Football). `defaultScoreboardWeek`, the watch-board initial week, and `weekGames` now resolve to the week of the first game on or after the dataset's Eastern as-of day. `datasetAsOf`/`broadcastAsOf` are the Eastern calendar day of the snapshot (a Sunday-night build is still Sunday). Games order chronologically within a day using the exact `kickoffUtc`.

## D-017 — Stale editorial boards are labelled, never authored or hidden

The weekly research layers (fantasy desk prompts 11-14, injury research) come from a human-run research step; no code or assistant fabricates them to fill a gap. Staged boards keep their own week and as-of date and now carry a cadence-aware freshness check (`deskBoardStatus`): Start/Sit and Trade are current for the week in play, Waiver for the following week, Rookie usage one week behind. A board that has fallen behind is called out on the page ("Behind the NFL calendar...") and the hero no longer says "Boards live". The ESPN injury base stays live per request; the editorial injury layer remains fail-closed and empty until research lands (pinned by `tests/domain.test.ts`).

## D-018 — NFL standings lane is computed, labelled, and not "official"

The homepage Standings lane ranks the league's top five by win percentage (a tie is half a win), then point differential, with points scored and team slug as deterministic tail tiebreaks (`topStandings` in `lib/homepage.ts`). Records come from `nfl.standings`, which the dataset builder tallies from final scores in the ESPN schedule and which `npm run dataset:verify` checks against ESPN's official standings; the adapter exposes them as numeric `standings` rows. The lane says exactly that, carries the dataset date, and does not claim official seeding or division-leader status. Teams that have not played are omitted, and a snapshot with no finals shows "No games are final yet" with a link to the division hubs. The AP poll plumbing (`HomepageData.pollTables`) is removed from the homepage; `/rankings` keeps its own data. The division under each team name comes from the builder's division map, which keyed Washington as `was` while ESPN's abbreviation is `WSH` (no division, a fallback brand colour, and a three-team NFC East hub); it is keyed `wsh` now, and `tests/homepage.test.ts` fails if any team lacks a division.

## D-019 — Game of the Week is picked by combined record, not rank

`featuredGame` considers every game in the week's slate that is not final, canceled, or postponed and scores it by the win percentage of the two teams' records taken together (an unpublished record adds nothing; no games between them reads as .500). Ties go to a national or primetime window (NBC, ESPN/ABC, Prime Video, Netflix, recognised by network name so flex scheduling cannot move them), then to the later exact kickoff (`kickoffUtc`), then to game id. The later-kickoff rule replaces the old earliest-game fallback: the earliest slot (the 9:30 AM London game on 2026-10-11) is the likeliest to be under way, or finished, before a visitor reads a build-time snapshot. Unflexed "Time TBD" slots carry a placeholder at the start of their day, so they never outrank a game with a real kickoff. When nothing eligible remains (the minutes after Monday Night Football ends, or after the season's last game) the homepage shows its existing "not published" state rather than a final. The marquee's "Rankings: AP preseason" link now points to the division hubs, and the week rail's "Top 25" tab and AP footnote render only when teams actually carry a rank, which the NFL build never does.

## D-020 — The live score overlay is client-side, shared, id-only, and fail-quiet

The baked snapshot stays the source of truth for week membership, order, venue, TV, and kickoff text. `/api/nfl-scoreboard` overlays only status, status detail, and scores, and only for games that are in progress or final. Games match by ESPN event id (`Game.id`, and `TeamScheduleGame.eventId` for team schedule rows) and never by team name or time. One ref-counted poller (`lib/live-scoreboard-store.ts`, exposed as `useLiveScoreboard`) serves the ticker, finals strip, scoreboard, schedule, game header, and team hub: 60-second cadence, paused while the tab is hidden, refetch when it becomes visible, request timeout, and abort when the last consumer unmounts. A failed, degraded, or malformed poll is "no information": last-good patches stay, in-progress patches that no poll has confirmed for five minutes revert to the baked row, and finals are terminal (only another final, a score correction, replaces one). A provider state the route does not model ("other") is unknown, not a verdict. Ids a payload does not mention are carried over, because the route drops a failed scoreboard day without marking the payload degraded. Nothing in the overlay renders an error.

Rejected: per-component polling (N requests per page and a ticker that can disagree with the card beside it); a server-side fetch during render (the snapshot is deliberately build-time and public rendering makes no provider call); replacing the patch map on every poll (one flaky upstream day would blank every live game for a minute).

## D-021 — Live state is announced sparingly and labelled as live

Visible scores and clocks update silently. One polite, atomic live region per page (`LiveScoreAnnouncer`) announces only kickoffs and finals for games on that page, coalesced per poll (at most once a minute; more than three collapse to a count), never live scores or clocks (a final includes its final score), and never state that was already true when the page loaded or that merely returns after an outage. The sentence is cleared after about twenty seconds so browse-mode readers do not find a stale one. The only motion the overlay adds is a pulsing dot, declared only under `prefers-reduced-motion: no-preference`. Scores that come from the live feed carry a "Live feed · as of <time ET>" label (the route's own read time, which stops advancing during an outage) on the scoreboard, schedule, game header, and team schedule; the ticker, which has no dataset label either, is unchanged. Team records and standings are not adjusted from live results; that would be inference presented as fact.

## D-022 — Eastern days and NFL weeks hold in every consumer, not only in the snapshot

Follow-up to D-015 and D-016 from the 2026-10-11 audit of every consumer of `Game.date` and the kickoff label. The builder was already correct (D-015): a fresh ESPN pull agreed with the committed snapshot on every date, week, kickoff instant and label, and `npm run dataset:verify` compared 182 labels with ESPN's own kickoff text with no disagreement. Three consumers still mixed UTC or the viewer's zone with Eastern dates. (1) The homepage finals strip kept live finals whose kickoff instant fell in a Monday-to-Sunday UTC window around the build day. Replayed over Weeks 4 and 5 with every game final, a Sunday build lost Sunday Night and Monday Night Football (00:20Z and 00:15Z the next day) and counted last week's two as this week's, and a Monday or Tuesday build kept only those two and lost the other thirteen. It now keeps the finals of the homepage slate's own games, matched by ESPN event id (D-020), so the rail, the marquee and the strip name the same NFL week, and it stays hidden while the slate has no finals (the Tuesday after Monday Night Football). (2) Team hubs defaulted "today" to the UTC day, so from 8 PM ET (7 PM once daylight time ends) tonight's primetime game read "Result not published" and dropped out of UP NEXT; the default is now the Eastern day (`easternDay` in `lib/eastern.ts`, which also derives the snapshot's as-of day). (3) The game-page planner card formatted a `YYYY-MM-DD` day in the viewer's zone, so Sunday's game read "Sat, Oct 10" for every US viewer and disagreed with the UTC server render; it now formats the calendar day in UTC like every other date label. Rule: a `date` is a calendar day, parsed at noon UTC and formatted with `timeZone: "UTC"`; an instant is only ever formatted with `America/New_York`; "this week" is a set of event ids, never a UTC window. `tests/schedule-integrity.test.ts` also compares the weekday with ESPN's kickoff text now, and fails if ESPN rewording leaves nothing to compare. `components/broadcast/scoreboard-page.tsx` is referenced by no route and was left alone.

## D-023 — The unreferenced fantasy notes board is removed, with the CSS only it used

`components/fantasy-notes-board.tsx` (`FantasyNotesBoard`) is deleted. It came with the bootstrap commit (a476056) and nothing imported it: on `main` at 1866182 no file or doc named it, and a build without it matches one with it apart from random per-build IDs. The live fantasy page is `/fantasy-desk` (`FantasyDeskPage`, rendered by `components/HubApp.tsx`). The selectors only the board used are gone from `app/data-boards.css`: the `.db-availability` family, `.db-clean-gate`, `.db-inline-expand`, `.db-projection`, `.db-responsible-note` and `.db-unpublished`, with their media-query and `forced-colors` entries. In rules shared with live boards (such as `.db-status`, `.db-confidence`, `.db-expandable-note` and `.db-primary-cell`) only the dead selector left the list. Every other `db-*` class the board used either never had a rule (`db-page--fantasy`, `db-table--fantasy`) or is shared with a live board and stays, as do the `FantasyNote` type and the `fantasyNotes` data.

Left in place: the eight `lib/scoreboard.ts` exports (`ScoreboardFilter`, `scoreboardFilters`, `filterScoreboardGames`, `groupGamesByDate`, `appointmentGames`, `scoreboardDateLabel`, `kickoffTimeLabel`, `broadcastLabel`) that only `components/broadcast/scoreboard-page.tsx`, `game-detail-page.tsx` and `game-card.tsx` use. Those components still exist on `main`, so the exports have users until they are removed; `continuousWeeks`, `defaultScoreboardWeek` and `gamesForWeek` stay regardless (`HubApp`, `tests/schedule-integrity.test.ts`).

## D-024 — Dead broadcast page components removed; HubApp renders the pages

`components/broadcast/scoreboard-page.tsx` (`ScoreboardPage`), `game-detail-page.tsx` (`GameDetailPage`) and `game-card.tsx` (`BroadcastGameCard`) are deleted. They came with the bootstrap commit (a476056) and were never wired in: on `main` at 4a18546 nothing imported them except `scoreboard-page.tsx` importing `./game-card`, and a build without them is byte-identical to one with them apart from random per-build IDs. `/scores`, `/schedule` and `/games/:id` are rendered by `components/HubApp.tsx` (`ScoresPage`, `SchedulePage`, `GamePage`, `GameCard`) through `app/[...slug]/page.tsx`, so that is where those pages change; leaving the dead files in place had already misdirected a change request. No stylesheet ever defined their classes, so no CSS went with them.

Rejected: swapping `HubApp`'s views for them (no redesign was requested, and they carry no styles). The `lib/scoreboard.ts` helpers only they used stay for a separate prune.
