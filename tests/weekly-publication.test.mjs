import assert from "node:assert/strict";
import test from "node:test";
import { cpSync, existsSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { publicationWindow, resolveBroadcast, selectSlate } from "../scripts/weekly-slate.mjs";

import { materializeVerifiedSnapshot } from "../scripts/verified-snapshot.mjs";

const manifest = JSON.parse(readFileSync(new URL("../data/content-refresh/current.json", import.meta.url), "utf8"));
const editorial = JSON.parse(readFileSync(new URL("../data/content-refresh/current-editorial.json", import.meta.url), "utf8"));
const injuryDoc = JSON.parse(readFileSync(new URL("../data/injury-research/current.json", import.meta.url), "utf8"));
const snapshot = JSON.parse(
  readFileSync(new URL(`../data/content-refresh/${manifest.snapshot}`, import.meta.url), "utf8"),
);

// Every case below is written against the edition that is published now, so
// the gate can be exercised again next week without rewriting the tests.
const editionWeek = editorial.week;
const weekInPlay = snapshot.season.currentWeek;
const injuryWeek = injuryDoc.week;
const inactiveWeek = editorial.inactives[0].week;
const practiceWeek = editorial.practiceReports[0].week;
const observation = injuryDoc.watch[0].observed_at;
const afterCutoff = new Date(Date.parse(manifest.cutoffUtc) + 3_600_000).toISOString();
const beforeObservation = new Date(Date.parse(observation) - 60_000).toISOString();

function withCandidate(change) {
  const root = mkdtempSync(join(tmpdir(), "duke-weekly-negative-"));
  try {
    for (const path of ["data/content-refresh/current.json", `data/content-refresh/${manifest.snapshot}`, "data/content-refresh/current-editorial.json", "data/injury-research/current.json", "data/fantasy-desk/current.json"]) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      copyFileSync(new URL(`../${path}`, import.meta.url), join(root, path));
    }
    mkdirSync(join(root, "lib"));
    writeFileSync(join(root, "lib/nfl-generated.ts"), "previous-good-output");
    const edit = (path, mutate) => { const value = JSON.parse(readFileSync(join(root, path), "utf8")); mutate(value); writeFileSync(join(root, path), JSON.stringify(value)); };
    change(edit);
    assert.throws(() => materializeVerifiedSnapshot(root));
    assert.equal(readFileSync(join(root, "lib/nfl-generated.ts"), "utf8"), "previous-good-output");
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("the materializer fails atomically for a missing source or a future report week", () => {
  withCandidate(edit => edit("data/injury-research/current.json", doc => { doc.watch[0].sources = []; }));
  withCandidate(edit => edit("data/injury-research/current.json", doc => { doc.week = weekInPlay + 1; }));
});

test("an injury module that lags the week in play keeps its own dated record", () => {
  const root = mkdtempSync(join(tmpdir(), "duke-weekly-lagging-"));
  try {
    for (const path of ["data/content-refresh/current.json", `data/content-refresh/${manifest.snapshot}`, "data/content-refresh/current-editorial.json", "data/injury-research/current.json", "data/fantasy-desk/current.json"]) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      copyFileSync(new URL(`../${path}`, import.meta.url), join(root, path));
    }
    mkdirSync(join(root, "lib"));
    const snapshotDoc = JSON.parse(readFileSync(join(root, `data/content-refresh/${manifest.snapshot}`), "utf8"));
    const editorialDoc = JSON.parse(readFileSync(join(root, "data/content-refresh/current-editorial.json"), "utf8"));
    // Exercise a lagging report even if the real desk has since caught up.
    snapshotDoc.season.currentWeek = Math.max(snapshotDoc.season.currentWeek, injuryWeek + 1);
    editorialDoc.week = Math.max(editorialDoc.week, snapshotDoc.season.currentWeek);
    writeFileSync(join(root, `data/content-refresh/${manifest.snapshot}`), JSON.stringify(snapshotDoc));
    writeFileSync(join(root, "data/content-refresh/current-editorial.json"), JSON.stringify(editorialDoc));
    materializeVerifiedSnapshot(root);
    const written = readFileSync(join(root, "lib/nfl-generated.ts"), "utf8");
    assert.ok(written.includes(`"currentWeek":${snapshotDoc.season.currentWeek}`), "the week in play must not move");
    assert.ok(written.includes(`"week":${editorialDoc.week}`), "the published edition week must not move");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an ACTIVE guess or impossible designation date cannot publish", () => {
  for (const patch of [{ published_status: "ACTIVE" }, { designation_date: "2026-02-30" }, { designation_week: injuryWeek - 1 }]) {
    withCandidate(edit => edit("data/injury-research/current.json", doc => Object.assign(doc.watch[0], patch)));
  }
});

test("last week's fantasy board cannot become a current edition", () => {
  withCandidate(edit => edit("data/fantasy-desk/current.json", doc => { doc.start_sit = { as_of: "2026-10-20", week: editionWeek - 1, positions: [], tough_calls: [] }; }));
});

test("partial or duplicate schedule inputs preserve the prior generated output", () => {
  withCandidate(edit => edit(`data/content-refresh/${manifest.snapshot}`, doc => { doc.schedule.pop(); }));
  withCandidate(edit => edit(`data/content-refresh/${manifest.snapshot}`, doc => { doc.schedule[1] = doc.schedule[0]; }));
});

test("incomplete or misidentified inactive lists cannot publish", () => {
  for (const patch of [{ complete: false }, { week: inactiveWeek + 1 }, { sources: [] }, { publishedAt: "2026-10-23T00:16:00Z", checkedAt: "2026-10-23T00:16:01Z" }]) {
    withCandidate(edit => edit("data/content-refresh/current-editorial.json", doc => Object.assign(doc.inactives[0], patch)));
  }
});

test("future, impossible, wrong-team or wrong-week practices fail atomically", () => {
  for (const patch of [{ date: "2099-01-01" }, { date: "2026-02-30" }, { week: practiceWeek + 1 }, { week: editionWeek + 1 }, { team_slug: "not-an-nfl-team" }, { checkedAt: "2099-01-01T00:00:00Z" }, { checkedAt: "2026-10-18T00:00:00Z" }, { checkedAt: "2026-02-30T00:00:00Z" }]) withCandidate(edit => edit("data/content-refresh/current-editorial.json", doc => Object.assign(doc.practiceReports[0], patch)));
  withCandidate(edit => edit("data/content-refresh/current.json", doc => { doc.cutoffUtc = "2000-01-01T00:00:00Z"; }));
});

test("transaction and observation timestamps cannot escape the recorded edition", () => {
  const tomorrow = new Date(Date.parse(`${manifest.sourceAsOf}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  for (const date of ["2099-01-01", "2026-02-30", tomorrow]) withCandidate(edit => edit("data/content-refresh/current-editorial.json", doc => Object.assign(doc.transactions.moves[0], { date })));
  withCandidate(edit => edit("data/content-refresh/current.json", doc => { doc.cutoffUtc = "2099-01-01T00:00:00Z"; }));
  withCandidate(edit => edit("data/content-refresh/current.json", doc => { doc.cutoffUtc = "2026-02-30T00:00:00Z"; }));
  withCandidate(edit => edit("data/injury-research/current.json", doc => { doc.watch[0].observed_at = "2099-01-01T00:00:00Z"; }));
  withCandidate(edit => edit("data/content-refresh/current-editorial.json", doc => { doc.reserveStatuses.at(-1).checkedAt = afterCutoff; }));
});

test("timezone-less and impossible evidence timestamps fail consistently", () => {
  for (const timestamp of ["2026-10-28T20:00:00", "2026-02-30T20:00:00Z", "2026-10-28", "2026-10-28T24:00:00Z"]) {
    withCandidate(edit => edit("data/injury-research/current.json", doc => { doc.watch[0].observed_at = timestamp; }));
    withCandidate(edit => edit("data/content-refresh/current-editorial.json", doc => { doc.inactives[0].checkedAt = timestamp; }));
    withCandidate(edit => edit("data/content-refresh/current.json", doc => { doc.cutoffUtc = timestamp; }));
  }
});

test("inactive retrieval and injury metadata cannot exceed their advertised cutoffs", () => {
  withCandidate(edit => edit("data/content-refresh/current-editorial.json", doc => { doc.inactives[0].checkedAt = afterCutoff; }));
  withCandidate(edit => edit("data/content-refresh/current.json", doc => { doc.sourceCutoffs.targetedInjuryUtc = "2099-01-01T00:00:00Z"; }));
  withCandidate(edit => edit("data/content-refresh/current.json", doc => { doc.sourceCutoffs.targetedInjuryUtc = beforeObservation; }));
});

test("the published edition keeps 272 games and separates the week in play from the edition week", () => {
  assert.equal(snapshot.schedule.length, 272);
  assert.equal(new Set(snapshot.schedule.map((game) => game.id)).size, 272);
  assert.equal(snapshot.season.currentWeek, weekInPlay);
  assert.ok(editionWeek === weekInPlay || editionWeek === weekInPlay + 1);
  // Every week before the week in play must be complete.
  for (const game of snapshot.schedule) {
    if (game.week >= weekInPlay || game.status === "final") continue;
    assert.match(game.statusDetail, /postpone|cancel|delay|suspend/i, `${game.id}: week ${game.week} is not final`);
  }
});


test("Tuesday selects Week 10 only after all Week 9 games finish; a preview may stay one week ahead", () => {
  const source = JSON.parse(readFileSync(new URL("../data/content-refresh/2026-11-05/snapshot.json", import.meta.url)));
  const games = source.schedule;
  games.find(g => g.week === 9).status = "final";
  assert.deepEqual(selectSlate(games, 18, 10, null), { weekInPlay: 9, completedWeek: 8, editionWeek: 10 });
  for (const game of games.filter(g => g.week === 9)) game.status = "final";
  assert.deepEqual(selectSlate(games, 18, 10, null), { weekInPlay: 10, completedWeek: 9, editionWeek: 10 });
  assert.throws(() => selectSlate(games, 18, 10, 12));
  assert.throws(() => selectSlate(games, 18, 10, 9));
  assert.deepEqual(publicationWindow(null, new Date("2026-11-10T07:59:00Z")), { day: "2026-11-09", ended: false });
  assert.equal(publicationWindow(null, new Date("2027-02-16T07:59:59Z")).ended, false);
  assert.equal(publicationWindow(null, new Date("2027-02-16T08:00:00Z")).ended, true);
  assert.throws(() => publicationWindow("2026-02-30"));
});

test("the network ruling must match the game and the current league primary", () => {
  const rule = JSON.parse(readFileSync(new URL("../data/content-refresh/broadcast-reviews.json", import.meta.url)))["401873042"];
  const game = { broadcast: "FOX", networks: ["FOX", "ESPN2"], awaySlug: rule.away, homeSlug: rule.home, date: rule.date };
  assert.equal(resolveBroadcast(game, ["CBS", "ESPN2"], rule).broadcast, "CBS");
  assert.equal(resolveBroadcast(game, ["NBC", "ESPN2"], rule).broadcast, null);
  assert.equal(resolveBroadcast({ ...game, date: "2026-11-15" }, ["CBS"], rule).broadcast, null);
});

test("November 10 replay writes a verifiable draft, rejects conflicting finals, and preserves a dated injury module", () => {
  const root = mkdtempSync(join(tmpdir(), "duke-weekly-replay-"));
  const source = fileURLToPath(new URL("..", import.meta.url));
  const write = (path, value) => { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), JSON.stringify(value)); };
  const read = path => JSON.parse(readFileSync(join(root, path), "utf8"));
  const run = (script, args = [], env = {}) => spawnSync(process.execPath,
    ["--import", join(source, "tests/fixtures/weekly-feeds.mjs"), "scripts/" + script, ...args],
    { cwd: root, env: { ...process.env, ...env }, encoding: "utf8", timeout: 20_000 });
  try {
    cpSync(join(source, "scripts"), join(root, "scripts"), { recursive: true });
    mkdirSync(join(root, "lib"));
    mkdirSync(join(root, "data/content-refresh/2026-11-05"), { recursive: true });
    for (const file of ["2026-11-05/snapshot.json", "broadcast-reviews.json"]) copyFileSync(join(source, "data/content-refresh", file), join(root, "data/content-refresh", file));
    write("data/content-refresh/current.json", { sourceAsOf: "2026-11-05", snapshot: "2026-11-05/snapshot.json", sourceCutoffs: { targetedInjuryUtc: "2026-10-28T20:34:19Z" } });
    write("data/content-refresh/current-editorial.json", { week: 10, moduleSources: { injuries: { sourceAsOf: "2026-10-20" } } });
    write("data/injury-research/current.json", { week: 8, as_of: "2026-10-20", watch: [], ledger: [] });
    write("data/fantasy-desk/current.json", { waiver:null, start_sit:null, rookie:null, trade:null });
    const invalid = run("refresh-weekly-edition.mjs", ["--week="], { FIXTURE_MISMATCH: "true" });
    assert.equal(invalid.status, 1); assert.match(invalid.stderr, /final score disagrees/);
    assert.equal(existsSync(join(root, "data/content-refresh/2026-11-10")), false);
    const ok = run("refresh-weekly-edition.mjs", ["--week="]);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    const dir = "data/content-refresh/2026-11-10";
    const review = read(dir + "/review.json");
    assert.equal(review.week, 10); assert.equal(review.completedWeek, 9);
    assert.equal(review.totals.finals, 136); assert.equal(review.totals.weekFinals, 15);
    assert.equal(review.gameEvidence["401873042"].primaryUSNetwork, "CBS");
    assert.equal(read("data/content-refresh/current.json").sourceCutoffs.completeInjuryReviewDate, "2026-10-20");
    assert.match(readFileSync(join(root, dir, "pr-body.md"), "utf8"), /Week 9 finals backfilled: 15/);
    for (const script of ["verify-weekly-edition.mjs", "verify-nfl-dataset.mjs"]) {
      const args = script === "verify-nfl-dataset.mjs" ? ["--evidence", dir + "/espn-verification.json"] : [];
      const gate = run(script, args); assert.equal(gate.status, 0, gate.stdout + gate.stderr);
    }
    const retry = run("refresh-weekly-edition.mjs"); assert.equal(retry.status, 0); assert.match(retry.stdout, /already has an edition/);
    const stop = run("refresh-weekly-edition.mjs", [], { FIXTURE_CLOCK: "2027-02-16T14:00:00Z" });
    assert.equal(stop.status, 0); assert.match(stop.stdout, /window closed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
