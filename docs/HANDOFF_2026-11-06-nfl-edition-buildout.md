# Handoff — NFL weekly edition build-out

**Prepared:** November 6, 2026 (Friday 18:57 PT) · **Repository:** `Oak-Main/dukefantasy` · **Cloudflare project:** `dukefantasy` (account `820e7cee61fccc60d14c8e20bc686942`) · **Domains:** `dukefantasy.com` and `dukedaily.app`, one build

This handoff describes the build-out end to end: where the NFL edition pipeline stood when this work started, what it is now, and the goals the whole system serves. It follows `docs/HANDOFF_PROTOCOL.md`.

---

## 1. Mission and scope

Make the site's NFL week a **recurring, verified publication** instead of a hand-assembled research pass, and move the site off the frozen October snapshot onto a current edition.

Scope covered: the weekly edition engine and its two publishers, a week-agnostic release gate, the dated edition data, the recurring job, the deployment path, the weekly write-up slot, and the release workflow that actually ships the Worker.

Out of scope (unchanged by this work): reader-facing editorial voice, the wider site's product surfaces (scores, teams, injuries, watch, DFS ledger, stats), affiliate and ads policy, and the college-football modules that share the repository.

---

## 2. Beginning state (November 4, 2026)

**The live site was frozen.** `dukefantasy.com` served the title `NFL Week 7 Schedule, Results & Fantasy Watch` with `Latest verified update 2026-10-26` and `Dataset compiled through 2026-10-26`: 107 season finals, Week 7 complete, Week 8's 14 fixtures unpublished for results. `dukedaily.app` served the same build (its `og:url` points at `dukefantasy.com`).

**The repository was ahead of the site.** `origin/main` already carried a `2026-10-28` edition (Week 8 prepared, 121-game schedule, `season.currentWeek: 8`, `editorial.week: 8`) that had never been deployed.

**The weekly job was bounded and had expired.** `docs/WEEK7_AUTOMATIC_UPDATES.md` describes the only recurring mechanism: an agent-driven publication flow with two thread schedules — injury/practice checks at 09:15 and 16:15 Pacific daily through October 27, and game-window checks every 30 minutes Thu/Sun/Mon through October 27 — reading ESPN and NFL game reports, authenticating with the GitHub and Cloudflare credentials already held by that session. The document is explicit that the job was **bounded to Week 7**: *"Stop after the October 27 reconciliation; do not roll into Week 8 automatically"*, and *"then disable both Week 7 schedules or let their bounded schedules expire."* Nothing replaced them.

**Three structural facts kept it that way.**

1. There was **no repository-resident scheduled job** — no cron, no GitHub Actions schedule, nothing that would run without a human starting it.
2. **Cloudflare was a manual Wrangler target with no Git connection** (`docs/DECISION_LOG.md`, October 28 entry: *"Merge and deployment remain gated on independent review and actual browser acceptance"*).
3. **The publication gate required every module to carry the edition's week.** `scripts/verified-snapshot.mjs` asserted `editorial.week === snapshot.season.currentWeek` **and** `injuryResearch.week === snapshot.season.currentWeek`, so a new edition could not publish until a same-week injury review existed — and a same-week injury review cannot exist for a week that has not started.

**The release gate was hard-wired to one week.** `scripts/verify-week8-update.mjs` asserted `currentWeek === 8`, compared the candidate against the pinned October 28 evidence and a pinned base commit, and named Week 8 fixture counts. A new week needed a bespoke verifier, so nothing could run unattended twice.

**One-line cause:** the Week 7 publication automation was hard-bounded to the Week 7 window and expired after the October 27 reconciliation, and nothing took over — no repo-resident job, a week-pinned release gate, a module-week gate that blocked new editions, and a manual-only deployment path.

---

## 3. What was built, end to end

### 3.1 The edition engine

| Path | Purpose |
| --- | --- |
| `scripts/refresh-weekly-edition.mjs` | The engine. Pulls ESPN's week-keyed scoreboard (primary) and NFL.com's per-week page and per-game box score (second publisher), rebuilds the schedule, standings and team records, writes a dated edition, and repoints the manifest. |
| `scripts/nfl-week-source.mjs` | The NFL.com reader. Per-week schedule pages and per-game box scores, parsed from the Next.js payload. |
| `scripts/verify-weekly-edition.mjs` | The release gate, **week-agnostic**: completeness, recomputed standings, two publishers and a retrieval time on every newly published game, real UTC timestamps, and no regression of a fact an earlier edition published. |
| `scripts/verify-pinned-dataset.mjs` | Runs the ESPN cross-check against the current edition's pinned extraction. |
| `scripts/render-title-receipt.mjs` | Renders the built Worker and prints the published titles — the receipt that the edition week is live. |
| `scripts/weekly-facts.mjs`, `scripts/weekly-slate.mjs` | Compare verified facts between a candidate and an existing draft so a rerun can never silently overwrite one. |
| `scripts/check-broadcast-sources.mjs` | Re-captures and re-verifies the three listings behind a broadcast ruling. |
| `scripts/verify-cloudflare-deploy-access.mjs` | Read-only credential gate for production deployment. |

### 3.2 The dated edition

Each edition is a folder under `data/content-refresh/<date>/`:

- `snapshot.json` — 272 games, 32 teams, standings, stadium facts, and per-game provenance (`sources`, `verified_fields`, `networks`, `city`, `country`, `kickoff_et`, `kickoff_pt`).
- `review.json` — per-game evidence, the source ledger (URL + UTC retrieval time + SHA-256), the baseline digest of the previous edition's finals, and any recorded source disagreement.
- `espn-verification.json` — the pinned ESPN responses, so a reviewer can reproduce what was published.
- `pr-body.md` — the machine-written pull-request body carrying every source URL and retrieval time.

`data/content-refresh/current.json` points at the live edition; `data/content-refresh/current-editorial.json` carries the edition week, the byes, the per-module source dates, and the limits that are disclosed to readers.

**Two different weeks, deliberately.** `season.currentWeek` is the **week in play** — the first week whose games are not all final — and it is what keeps the snapshot from going stale. `editorial.week` is the **published edition week**: the desk, the byes and the television slate. A Tuesday job publishes the week that starts the next day, so the edition may lead the week in play by one.

### 3.3 The gates

`scripts/verified-snapshot.mjs` was changed in one place: a module may now **lag** the edition as long as it keeps its own dated record, while a module dated to a week the edition has not reached is still rejected. That single change removed the structural reason the job could not repeat.

### 3.4 The recurring job — `.github/workflows/weekly-nfl-edition.yml`

- **Schedule:** Tuesday 06:00 America/Los_Angeles = `0 14 * * 2` UTC. The whole Nov 2026 – Feb 2027 window is Pacific standard time; a daylight-time week would need `0 13 * * 2`.
- **Runs on `main` only**, with job-scoped `contents: write` and `pull-requests: write`.
- **Refreshes, verifies, then opens a draft.** It never merges, never pushes to `main`, never deploys.
- **It cannot clobber a human.** If a draft already exists for that date and the verified facts differ, the job fails and preserves the branch. If a maintainer reserved the branch with their own notes, the job refuses to overwrite them. A draft can be reserved in advance — **#77 is already reserved for the November 10 run.**
- **It ends itself.** The refresh refuses to publish after 2027-02-15, covering Week 18 and the playoffs.

### 3.5 The release path — `.github/workflows/release-dukefantasy.yml`

Deployment is now a reviewed, repeatable step rather than a manual Wrangler command:

1. Manual dispatch requiring the **exact reviewed commit SHA**; the job fails unless it matches `main` and `main` still points at it.
2. `npm ci`, CI browser install, a **dry-run refresh** to confirm the NFL and ESPN sources still agree, `cf:types`, the pinned dataset check, then the full `release:preflight`.
3. **Credential gate** — two read-only Cloudflare API reads (issuer token ownership, existing Worker deployments) that fail closed on a missing kind, an inactive or expiry-unproven token, under 90 minutes of remaining life, an account mismatch, a redirect, or a malformed response.
4. Wrangler deploy, then a **live smoke test** of the Worker and both custom domains, with the result uploaded as an artifact.

### 3.6 The write-up slot

The weekly desk write-up is the owner's to word. The template carries a literal slot, `[[COPY: week<N>-desk]]`, derived from the edition week, in both the homepage desk card and the `/fantasy-desk` hero. No agent prose is written into it. **As of this handoff the Week 10 slot is filled** with copy written after the marker was placed.

### 3.7 What changed between the two editions that mattered

| | Nov 5 edition | Nov 6 edition (live) |
| --- | --- | --- |
| Season finals | 121 (through Week 8) | **122** (Week 9's Thursday final reconciled) |
| Week in play | 9 | 9 |
| Edition week | 10 | 10 |
| Games published with two publishers | 43 (Weeks 8–10) | 43 (Weeks 8–10) |
| Games carrying per-game provenance | 57 (43 published + 14 carried from Week 7) | 57 |
| Week 10 fixtures with kickoff + TV | 14/14 | 14/14 |

### 3.8 Also landed alongside

- **The broadcast disagreement was ruled on.** For the November 8 Lions–Dolphins game ESPN named Fox and NFL.com named CBS. The ruling is **CBS**, corroborated by three listings (NFL.com's how-to-watch article, the Detroit Lions' own game-day page, Paramount+) and pinned with its retrieval time in `data/content-refresh/broadcast-reviews.json`; `scripts/check-broadcast-sources.mjs` re-captures and re-verifies those bodies. The Bills–Vikings ESPN/ABC simulcast is recorded the same way. The site now publishes CBS.
- **Dependencies and security:** vinext 1.4.3, Vite 8.3.5, React 19.3.1 (React 19.3.0 is refused everywhere), postcss 8.5.32; optional analytics paused and the policy/referral routes reconciled.

---

## 4. The goals this build-out serves

1. **One sourced edition a week, without hand assembly.** The job collects, corroborates, verifies and proposes; a human reviews and releases.
2. **Every published fact is traceable.** Two publisher families, a source URL, a UTC retrieval time and a body digest for each source read — carried in the data, in the evidence file and in the pull-request body.
3. **A release build reproduces reviewed data.** The materializer never replaces reviewed data with a single-provider pull, and never lets an old editorial input wear a new source timestamp.
4. **The site never goes stale quietly.** The week-in-play marker plus the "every earlier week must be complete" invariant, cross-checked live against ESPN's official standings.
5. **Modules keep their own dates.** Schedule, injuries, inactives, fantasy, transactions and leaders each carry their own source date, and the site discloses them separately rather than implying one global freshness.
6. **The owner writes the editorial.** The desk slot stays empty until Kevyn fills it.
7. **Shipping is deliberate.** A release names its commit, proves its credential, and smoke-tests the live site.
8. **The wider site's promises still hold:** the editorial firewall, Clean Mode, responsible-gaming controls, affiliate disclosure, and no unlicensed or unverified claims — unchanged by this work.

---

## 5. Inputs reviewed

`docs/WEEK7_AUTOMATIC_UPDATES.md` (the bounded Week 7 automation) · `docs/DECISION_LOG.md` (Oct 28 entry, and the entries added Nov 5–6) · `docs/HANDOFF_PROTOCOL.md` · `docs/DEPLOYMENT.md` · `docs/releases/2026-10-28-week8.md` · the October 28 edition's `review.json` and `espn-verification.json` · `scripts/verified-snapshot.mjs`, `scripts/verify-week8-update.mjs`, `scripts/verify-nfl-dataset.mjs`, `scripts/week7-evidence.mjs` · the live sites on both domains · **ESPN** week-keyed scoreboard and official standings, **NFL.com** per-week schedule pages and per-game box scores, **nflverse** open data as an independent third read on the calendar.

## 6. Assumptions made

- The official NFL week is ESPN's per-event `week.number`, cross-checked against NFL.com's own per-week pages and nflverse. On that basis the 2026 season opened Wednesday September 9: **Week 9 is November 5–9 and Week 10 is November 12–16** (the brief's "Week 10 begins Thu Nov 5" is off by one week).
- A job that opens a draft but never merges is the correct default for an unattended schedule; merge and deploy remain explicit human steps.
- The recurring job belongs in the repository, not in a local runtime task: two refreshers would race, because their retrieval timestamps always differ and neither run would ever see "no change".

## 7. Decisions and rationale

| Decision | Rationale |
| --- | --- |
| ESPN primary, NFL.com second | Two independent publisher families, both free and stable; the repo already standardises on ESPN. |
| Week numbers from ESPN's event, never a date bucket | The old Sep-10 window silently dropped the Week 1 Wednesday opener and all of Week 18. |
| `season.currentWeek` (week in play) separated from `editorial.week` (edition week) | Conflating them made "publish next week's slate ahead" impossible and broke the staleness invariant. |
| Modules may lag the edition, never lead it | Removed the structural reason the job could not repeat, without weakening the freshness rules. |
| A week-agnostic gate replaces the week-pinned gate | A bespoke verifier per week is what made a second unattended run impossible. |
| Job opens drafts; a separate workflow deploys | Keeps the automated surface read-mostly and the irreversible step explicit. |
| A recorded disagreement publishes the primary value and is disclosed | The house rule is two-publisher corroboration; where it fails, the conflict is recorded, not hidden. |
| The desk is a `[[COPY: week<N>-desk]]` slot | Agent-written weekly prose is not publishable copy. |

## 8. Deliverables — exact paths

- `scripts/refresh-weekly-edition.mjs`, `scripts/nfl-week-source.mjs` — the engine and the NFL.com reader.
- `scripts/verify-weekly-edition.mjs`, `scripts/verify-pinned-dataset.mjs`, `scripts/render-title-receipt.mjs`, `scripts/weekly-facts.mjs`, `scripts/weekly-slate.mjs`, `scripts/check-broadcast-sources.mjs`, `scripts/verify-cloudflare-deploy-access.mjs` — gates and receipts.
- `scripts/verified-snapshot.mjs` — the one-line gate change that unblocked repetition.
- `.github/workflows/weekly-nfl-edition.yml` — the recurring job. `.github/workflows/release-dukefantasy.yml` — the release. `.github/workflows/weekly-acceptance.yml` — the acceptance suite.
- `data/content-refresh/2026-11-05/`, `data/content-refresh/2026-11-06/` — the two editions; `data/content-refresh/current.json`, `current-editorial.json`, `broadcast-reviews.json` — the live pointers and the ruling.
- `lib/nfl-generated.ts`, `lib/content-refresh.ts`, `lib/route-metadata.ts`, `lib/cfb-dataset.ts`, `components/broadcast/homepage.tsx`, `components/fantasy-desk-page.tsx`, `components/HubApp.tsx` — the published surfaces and the copy slot.
- `tests/weekly-publication.test.mjs`, `tests/rendered-html.test.mjs`, `tests/browser/release.spec.ts`, `tests/content-refresh.test.ts` — the gate tests, now written against the edition rather than a fixed week.
- `docs/DECISION_LOG.md`, `docs/ASSUMPTIONS_REGISTER.md`, `docs/DEPLOYMENT.md`, `docs/REQUIREMENTS_TRACEABILITY.md` — the recorded decisions.

## 9. Tests and evidence

- `npm run weekly:verify` — edition gate: *Week 10, 122 finals, games published with two publishers, sources recorded.*
- `npm run dataset:verify` — live cross-check against ESPN: *272 events vs 272 baked, 0 kickoff instants changed, finals ESPN 122 / baked 122, standings 32/32 against ESPN's official standings.*
- `npm run dataset:verify:pinned` — the same check against the pinned extraction.
- `npm run verify` — typecheck, lint, unit tests, build, rendered-HTML tests, a11y, seo, links, visual, database migration and seed.
- `npm run receipt:title` — renders the built Worker: `/` → `NFL Week 10 Schedule, Results & Fantasy Watch`; the desk slot and `Dataset compiled through 2026-11-06` on the page.
- `npm run test:injuries`, `npm run test:release` — Playwright suites; `npm run deploy:dry-run` — the deployment rehearsal. All green on the merged pull requests.
- **Live, verified today:** the title and `Latest verified update 2026-11-06`; `122 completed games`; the Week 9 Sunday slate with national TV; the Week 10 slate with four byes; the Week 10 desk copy present; standings tallied from final scores.

## 10. Known risks and unresolved items

1. **The job proposes; a human releases.** If nobody opens the weekly draft, the site ages again — this is the same failure mode as the original bounded job, one step later in the chain. The reserved draft **#77** covers the November 10 run.
2. **Publisher disagreement is possible.** The November 8 game needed a manual three-listing ruling. The path exists but it is manual; the ruling file and re-check script keep it reproducible.
3. **Weeks beyond the published slate stay single-source planning data**, and the NFL can flex a game. `dataset:verify` fails on a changed kickoff instant, so a stale snapshot cannot ship unnoticed — but a flex discovered after publication needs a refresh.
4. **The playoffs are not yet covered by the edition shape.** The regular season is 18 weeks with a hard end date of 2027-02-15; the playoff bracket is a separate surface and has no recurring job yet.
5. **The injury and fantasy modules still lag deliberately.** They keep their own dated records; the site discloses the lag rather than hiding it.
6. **The injury-ledger review date is still October 20.** A full 32-team recertification is outstanding and is the main content gap on `/injuries`.

## 11. Required next owner

**Kevyn.** Three actions, in order: word or delegate the weekly desk slot each Tuesday; merge the weekly draft and dispatch `release-dukefantasy.yml` with the reviewed SHA; and decide whether the remaining `/injuries` and playoff coverage is in the season plan.

## 12. Acceptance status

**PASS WITH CONDITIONS** — the assigned scope (find the stopped job, fix it, backfill the missing weeks, publish the Week 10 edition, leave the write-up as a slot, set the weekly schedule) is complete and verified on the live site. The conditions are deliberate and bounded: the recurring job stops at a draft by design, the injury and fantasy modules lag on their own disclosed dates, and the playoffs are outside the current edition shape.
