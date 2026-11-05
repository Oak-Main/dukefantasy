/**
 * Weekly edition verifier — the release gate for any edition of the schedule.
 *
 * The previous gate was written for a single week, so every new edition needed
 * a bespoke verifier and nothing could run unattended twice. This gate reads
 * the edition from the manifest and checks the invariants that must hold for
 * every week: completeness, recomputed standings, a two-publisher record for
 * each newly published game, real retrieval timestamps, and no regression of a
 * fact that an earlier edition already published.
 *
 * Run: npm run weekly:verify
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { selectSlate, resolveBroadcast } from "./weekly-slate.mjs";
import { publisher } from "./week7-evidence.mjs";
import { isEvidenceTimestamp, validatePublicationDates } from "./week7-publication-dates.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const manifest = read("data/content-refresh/current.json");
const snapshot = read(`data/content-refresh/${manifest.snapshot}`);
const injury = read("data/injury-research/current.json");
const fantasy = read("data/fantasy-desk/current.json");
const editorial = read("data/content-refresh/current-editorial.json");

const editionDate = manifest.sourceAsOf;
const editionDir = manifest.snapshot.replace(/\/snapshot\.json$/, "");
assert.ok(/^\d{4}-\d{2}-\d{2}\/snapshot\.json$/.test(manifest.snapshot), "The manifest must point at a dated snapshot");
assert.ok(existsSync(new URL(`../data/content-refresh/${editionDir}/review.json`, import.meta.url)), "The edition needs a review.json");
assert.ok(existsSync(new URL(`../data/content-refresh/${editionDir}/espn-verification.json`, import.meta.url)), "The edition needs a pinned ESPN extraction");
const review = read(`data/content-refresh/${editionDir}/review.json`);
const espnCaptures = read(`data/content-refresh/${editionDir}/espn-verification.json`).responses;

/* ---- the edition itself ------------------------------------------------- */

const broadcastReviews = read("data/content-refresh/broadcast-reviews.json");
const previousDate = readdirSync(new URL("../data/content-refresh/", import.meta.url))
  .filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day) && day < editionDate && existsSync(new URL(`../data/content-refresh/${day}/snapshot.json`, import.meta.url))).sort().at(-1);
assert.ok(previousDate && review.baseline?.snapshot === `${previousDate}/snapshot.json`, "Baseline must be the preceding dated snapshot");
const previous = read(`data/content-refresh/${review.baseline.snapshot}`);
const priorReviewPath = `data/content-refresh/${previousDate}/review.json`;
const priorReview = existsSync(new URL("../" + priorReviewPath, import.meta.url)) ? read(priorReviewPath) : {};
const priorWeek = priorReview.week ?? previous.season.currentWeek;
assert.equal(review.baseline.week, priorWeek, "Baseline edition week");
const weekInPlay = snapshot.season.currentWeek;
const selected = selectSlate(snapshot.schedule, snapshot.season.weeks, priorWeek, editorial.week);
assert.equal(weekInPlay, selected.weekInPlay, "Week in play must be the first incomplete slate");
assert.equal(review.completedWeek, selected.completedWeek, "Evidence must identify the last fully completed week");
const editionWeek = editorial.week;
assert.ok(Number.isInteger(weekInPlay) && weekInPlay >= 1 && weekInPlay <= snapshot.season.weeks);
assert.ok(Number.isInteger(editionWeek) && editionWeek >= 1 && editionWeek <= snapshot.season.weeks);
// The edition may cover the week in play or the week that starts next; the
// Tuesday job publishes the coming week ahead of time.
assert.ok(
  editionWeek === weekInPlay || editionWeek === weekInPlay + 1,
  `The edition week ${editionWeek} must be the week in play (${weekInPlay}) or the week that starts next`,
);
assert.equal(review.week, editionWeek, "The evidence file must describe the edition week");
assert.equal(snapshot.schedule.length, 272, "Every regular-season game must be present");
assert.equal(new Set(snapshot.schedule.map((game) => game.id)).size, 272, "Game ids must be unique");
assert.equal(snapshot.teams.length, 32, "Every team must be present");
assert.equal(Object.keys(snapshot.standings).length, 32, "Every team needs a standing");
assert.equal(snapshot.season.weeks, 18, "The regular season is 18 weeks");

validatePublicationDates({ injury, editorial }, manifest);
assert.ok(isEvidenceTimestamp(manifest.sourceCutoffs.coreDatasetUtc) && Date.parse(manifest.sourceCutoffs.coreDatasetUtc) <= Date.parse(manifest.cutoffUtc));
assert.equal(review.cutoffUtc, manifest.cutoffUtc);
assert.equal(manifest.sourceCutoffs.completeInjuryReviewDate, injury.as_of);
assert.equal(editorial.moduleSources.schedule.sourceAsOf, snapshot.sourceAsOf);
assert.equal(editorial.moduleSources.injuries.sourceAsOf, injury.as_of);
// A module may lag the edition as long as it keeps its own dated record; a
// module dated to a week the edition has not reached is a defect.
assert.ok(injury.week == null || (Number.isInteger(injury.week) && injury.week >= 1 && injury.week <= editionWeek), "The injury module cannot be dated to a future week");

/* ---- standings are recomputed, never asserted --------------------------- */

const tally = Object.fromEntries(
  snapshot.teams.map((team) => [team.slug, { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 }]),
);
for (const game of snapshot.schedule.filter((row) => row.status === "final")) {
  const away = tally[game.awaySlug];
  const home = tally[game.homeSlug];
  assert.ok(away && home, `${game.id}: unknown team`);
  away.pf += game.awayScore;
  away.pa += game.homeScore;
  home.pf += game.homeScore;
  home.pa += game.awayScore;
  if (game.awayScore === game.homeScore) {
    away.ties += 1;
    home.ties += 1;
  } else if (game.awayScore > game.homeScore) {
    away.wins += 1;
    home.losses += 1;
  } else {
    home.wins += 1;
    away.losses += 1;
  }
}
for (const [slug, row] of Object.entries(tally)) {
  for (const key of Object.keys(row)) assert.equal(snapshot.standings[slug][key], row[key], `${slug}:${key}`);
}
for (const team of snapshot.teams) {
  const row = snapshot.standings[team.slug];
  assert.equal(team.record, `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`, `${team.slug}: record`);
}

/* ---- the published week covers all 32 teams ----------------------------- */

const participants = snapshot.schedule.filter((row) => row.week === editionWeek).flatMap((row) => [row.awaySlug, row.homeSlug]);
assert.equal(new Set([...participants, ...editorial.byes]).size, 32, "The published week and the byes must partition 32 teams");
assert.equal(participants.length + editorial.byes.length, 32);

/* ---- a published game carries two publishers and a real retrieval time --- */

const publishedWeeks = review.totals?.publishedWeeks ?? [];
assert.ok(Array.isArray(publishedWeeks) && publishedWeeks.length > 0, "The evidence must name the weeks this edition publishes");
const newlyPublished = snapshot.schedule.filter((game) => publishedWeeks.includes(game.week));
assert.ok(newlyPublished.length > 0, "The edition must publish games");

for (const game of newlyPublished) {
  assert.ok(Array.isArray(game.sources) && game.sources.length >= 2, `${game.id}: needs two source URLs`);
  assert.ok(new Set(game.sources.map((url) => publisher(url))).size >= 2, `${game.id}: needs two publisher families`);
  assert.ok(isEvidenceTimestamp(game.source_retrieved_at), `${game.id}: needs a real retrieval timestamp`);
  assert.ok(Date.parse(game.source_retrieved_at) <= Date.parse(manifest.cutoffUtc), `${game.id}: retrieval is after the cutoff`);
  assert.equal(game.verification, "two_publishers", `${game.id}: must record two-publisher verification`);
  for (const url of game.sources) assert.ok(url.startsWith("https://"), `${game.id}: sources must be HTTPS`);
  const evidence = review.gameEvidence?.[game.id];
  const families = new Set(game.sources.map(publisher));
  assert.ok(families.has("nfl.com") && families.has("espn.com"), `${game.id}: NFL and ESPN are required`);
  if (game.status === "final") {
    assert.ok([game.awayScore, game.homeScore].every(n => Number.isInteger(n) && n >= 0), `${game.id}: missing final score`);
    assert.ok(game.verified_fields.includes("final_status") && review.sources.some(source => source.name === `game-${game.id}`), `${game.id}: missing NFL box score`);
  } else {
    assert.ok(game.awayScore == null && game.homeScore == null, `${game.id}: scores before final`);
  }
  for (const conflict of game.source_conflicts ?? []) {
    const tv = resolveBroadcast({ ...game, broadcast: conflict.espn }, [conflict.nflCom], broadcastReviews[game.id]);
    assert.equal(game.broadcast, tv.broadcast, `${game.id}: unresolved or unsupported TV assignment`);
    assert.deepEqual(conflict, tv.conflict);
    assert.deepEqual(evidence?.sourceConflicts, game.source_conflicts);
    assert.ok(review.sourceDiscrepancies.some(row => row.eventId === game.id && row.published === tv.broadcast && row.resolution === conflict.resolution));
    if (conflict.review) {
      assert.ok(isEvidenceTimestamp(conflict.review.checkedAt) && Date.parse(conflict.review.checkedAt) <= Date.parse(manifest.cutoffUtc));
      const hosts = { leagueUrl: "www.nfl.com", teamUrl: "www.detroitlions.com", broadcasterUrl: "www.paramountplus.com" };
      const pins = read("data/content-refresh/broadcast-evidence.json");
      for (const [field, hostname] of Object.entries(hosts)) {
        const url = conflict.review[field];
        assert.equal(new URL(url).hostname, hostname);
        const pin = pins.find(row => row.url === url && row.id === game.id);
        assert.ok(pin && pin.status === 200 && pin.bytes > 0 && /^[a-f0-9]{64}$/.test(pin.sha256), url);
        assert.ok(Date.parse(pin.checkedAt) <= Date.parse(conflict.review.checkedAt));
        const receipt = review.sources.find(row => row.url === url);
        assert.ok(receipt && receipt.sha256 === pin.sha256 && receipt.checkedAt === pin.checkedAt, url);
      }
    }
  }
  assert.ok(evidence, `${game.id}: missing evidence`);
  assert.deepEqual(evidence.verifiedFields, game.verified_fields);
  assert.deepEqual(evidence.networks, game.networks);
  const simulcast = broadcastReviews[game.id];
  if (simulcast?.simulcasts?.some(network => game.networks?.includes(network))) {
    const capture = review.sources.find(row => row.url === simulcast.leagueUrl);
    const stored = read("data/content-refresh/broadcast-evidence.json").find(row => row.url === simulcast.leagueUrl);
    assert.ok(capture && stored && capture.sha256 === stored.sha256 && capture.checkedAt === stored.checkedAt, "Missing simulcast source receipt");
  }
  assert.equal(evidence.status, game.status);
  assert.equal(evidence.officialWeek, game.week, `${game.id}: evidence week`);
  assert.equal(evidence.away, game.awaySlug, `${game.id}: evidence away team`);
  assert.equal(evidence.home, game.homeSlug, `${game.id}: evidence home team`);
  assert.equal(evidence.kickoffUtc, game.kickoffUtc, `${game.id}: evidence kickoff`);
  assert.equal(evidence.primaryUSNetwork, game.broadcast, `${game.id}: evidence network`);
  assert.equal(evidence.awayScore, game.awayScore, `${game.id}: evidence away score`);
  assert.equal(evidence.homeScore, game.homeScore, `${game.id}: evidence home score`);
  assert.ok(Array.isArray(evidence.sources) && evidence.sources.length >= 2, `${game.id}: evidence needs two sources`);
  assert.ok(new Set(evidence.sources.map((source) => publisher(source.url))).size >= 2, `${game.id}: evidence needs two publisher families`);
  for (const source of evidence.sources) {
    const receipt = review.sources.find(row => row.url === source.url);
    assert.ok(receipt, `${game.id}: evidence URL is absent from the retrieval ledger`);
    assert.equal(source.rawSha256, receipt.sha256, `${game.id}: missing or mismatched receipt hash`);
    if (publisher(source.url) === "espn.com") {
      const capture = espnCaptures.find(row => row.url === source.url);
      assert.equal(capture?.rawSha256, receipt.sha256, `${game.id}: pinned ESPN source digest`);
    }
    assert.equal(source.checkedAt, receipt.checkedAt, `${game.id}: receipt time mismatch`);
    assert.ok(isEvidenceTimestamp(source.checkedAt), `${game.id}: evidence needs a retrieval timestamp`);
    assert.ok(Date.parse(source.checkedAt) <= Date.parse(manifest.cutoffUtc), `${game.id}: evidence retrieval is after the cutoff`);
  }
}

/* ---- every source read is recorded with its URL and UTC time ------------ */

const ledger = review.sources ?? [];
assert.ok(ledger.length > 0, "The edition must record the sources it read");
for (const source of ledger) {
  assert.ok(source.url.startsWith("https://"), `${source.name}: source URL must be HTTPS`);
  assert.ok(isEvidenceTimestamp(source.checkedAt), `${source.name}: source needs a UTC retrieval timestamp`);
  assert.ok(Date.parse(source.checkedAt) <= Date.parse(manifest.cutoffUtc), `${source.name}: retrieval is after the cutoff`);
  assert.ok(/^[a-f0-9]{64}$/.test(source.sha256 ?? ""), `${source.name}: source needs a body digest`);
}

/* ---- a fact published earlier may not regress --------------------------- */

const baseline = review.baseline;
assert.ok(baseline?.snapshot, "The evidence must name the baseline snapshot");
const previousFinals = previous.schedule
  .filter((game) => game.status === "final")
  .map((game) => [game.id, game.week, game.awayScore, game.homeScore, game.status]);
const baselineDigest = createHash("sha256").update(JSON.stringify(previousFinals)).digest("hex");
assert.equal(baselineDigest, baseline.finalsDigest, "The baseline digest does not match the baseline snapshot");
const currentById = new Map(snapshot.schedule.map((game) => [game.id, game]));
for (const [id, gameWeek, awayScore, homeScore, status] of previousFinals) {
  const game = currentById.get(id);
  assert.ok(game, `${id}: a published game disappeared`);
  assert.equal(game.status, status, `${id}: a published result changed status`);
  assert.equal(game.week, gameWeek, `${id}: a published game changed week`);
  assert.equal(game.awayScore, awayScore, `${id}: a published score changed`);
  assert.equal(game.homeScore, homeScore, `${id}: a published score changed`);
}

/* ---- the desk write-up stays the owner's slot ---------------------------- */

for (const key of ["waiver", "start_sit", "rookie", "trade"]) {
  assert.ok(Object.hasOwn(fantasy, key), `Missing decision board status: ${key}`);
  const board = fantasy[key];
  if (board) assert.equal(key === "waiver" ? board.week_adding_for : board.week, key === "rookie" ? selected.completedWeek : editionWeek);
}

console.log(
  `Edition ${editionDate}: Week ${editionWeek}, ${snapshot.schedule.filter((g) => g.status === "final").length} finals, ` +
    `${newlyPublished.length} games published with two publishers, ${ledger.length} sources recorded.`,
);
