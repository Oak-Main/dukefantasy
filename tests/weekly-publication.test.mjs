import assert from "node:assert/strict";
import test from "node:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
    assert.ok(injuryWeek < snapshotDoc.season.currentWeek, "the published injury module lags the week in play");
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
