import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { collectFacts, validateEvidence, publisher } from "./week7-evidence.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const evidence = read(process.argv[2] ?? "data/content-refresh/week7-release-evidence.json");
if (!/^[a-f0-9]{40}$/.test(evidence.baseCommit ?? "")) throw new Error("Exact base commit required");
const old = path => JSON.parse(execFileSync("git", ["show", `${evidence.baseCommit}:${path}`], { cwd: root, encoding: "utf8", maxBuffer: 10_000_000 }));
const manifest = read("data/content-refresh/current.json");
const oldManifest = old("data/content-refresh/current.json");
const bundle = (load, selection) => ({ snapshot: load(`data/content-refresh/${selection.snapshot}`), injury: load("data/injury-research/current.json"), editorial: load("data/content-refresh/current-editorial.json") });
const before = bundle(old, oldManifest), after = bundle(read, manifest);
for (const row of [...after.injury.ledger, ...after.injury.watch, ...(after.editorial.reserveStatuses ?? []), ...(after.editorial.practiceReports ?? [])]) {
  if (!Array.isArray(row.sources) || new Set(row.sources.map(publisher)).size < 2) throw new Error("Every published injury/practice record requires two HTTPS publisher families");
}
const gameById = new Map(after.snapshot.schedule.map(game => [game.id, game]));
for (const report of after.editorial.inactives ?? []) {
  const game = gameById.get(report.gameId);
  if (report.week !== 7 || game?.week !== 7 || ![game.homeSlug, game.awaySlug].includes(report.teamSlug)) throw new Error("Inactive report references the wrong week/game/team");
  if (new Set(report.sources.map(publisher)).size < 2) throw new Error("Inactive list needs two publishers");
  if (!report.complete || !Array.isArray(report.players) || new Set(report.players.map(player => player.name)).size !== report.players.length) throw new Error("Inactive lists must be complete and deduplicated");
  if (report.players.some(player => !player.name || !["inactive", "emergency_qb"].includes(player.designation))) throw new Error("Invalid inactive designation");
  if (!Number.isFinite(Date.parse(report.publishedAt)) || Date.parse(report.publishedAt) > Date.now()) throw new Error("Invalid inactive publication time");
  if (Date.parse(report.publishedAt) < Date.parse(game.kickoffUtc) - 2 * 3_600_000) throw new Error("An early injury designation is not a game-day inactive list");
}
const verdict = validateEvidence(evidence, collectFacts(before), collectFacts(after));
// Metadata-only freshness changes require a real, complete review of that module.
for (const [module, source] of Object.entries(after.editorial.moduleSources)) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  if (source.sourceAsOf && (!/^\d{4}-\d{2}-\d{2}$/.test(source.sourceAsOf) || source.sourceAsOf > today)) throw new Error(`${module}: invalid or future source date`);
  if (source.sourceAsOf !== before.editorial.moduleSources?.[module]?.sourceAsOf && !(evidence.moduleReviews ?? []).some(review => review.module === module)) {
    throw new Error(`${module}: source date changed without a complete two-source review`);
  }
  const review = (evidence.moduleReviews ?? []).find(review => review.module === module);
  if (review && (review.sourceAsOf !== source.sourceAsOf || !Number.isFinite(Date.parse(source.fetchedAt)) || Date.parse(source.fetchedAt) > Date.now())) throw new Error(`${module}: review date and actual retrieval timestamp are required`);
}
console.log(`Week 7 evidence gate: PASS (${verdict.changedFacts} changed facts, ${verdict.moduleReviews} complete reviews).`);
