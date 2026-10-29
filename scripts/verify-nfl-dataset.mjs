/**
 * Cross-source verification of the baked NFL snapshot (lib/nfl-generated.ts).
 *
 * The unit tests prove the snapshot is internally consistent and offline;
 * this script proves it still agrees with ESPN itself:
 *   1. kickoff labels vs ESPN's own human-readable kickoff text (date + time)
 *   2. computed standings vs ESPN's OFFICIAL standings (W-L-T, PF, PA)
 *   3. a fresh week-keyed pull: same 272 event ids, same kickoff instants
 *
 * Run it after `npm run dataset:build` (or any deploy build), before kickoff:
 *   npm run dataset:verify
 *
 * Exit codes: 0 = verified, 1 = the snapshot disagrees with ESPN,
 * 2 = the snapshot is merely behind (games went final after it was compiled) -- rebuild.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { isEvidenceTimestamp } from "./week7-publication-dates.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const STANDINGS = "https://site.web.api.espn.com/apis/v2/sports/football/nfl/standings?season=2026&level=3";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const source = readFileSync(`${root}lib/nfl-generated.ts`, "utf8");
const snapshot = JSON.parse(source.slice(source.indexOf("export default ") + "export default ".length).replace(/;\s*$/, ""));
const evidenceFlag = process.argv.indexOf("--evidence");
const evidence = evidenceFlag < 0 ? null : JSON.parse(readFileSync(process.argv[evidenceFlag + 1], "utf8"));
const pinned = new Map();
if (evidence) {
  if (evidence.version !== 1 || evidence.cutoffUtc !== snapshot.fetchedAt || !isEvidenceTimestamp(evidence.cutoffUtc) || Date.parse(evidence.cutoffUtc) > Date.now() || evidence.responses?.length !== 19) throw new Error("Pinned evidence requires the exact snapshot cutoff and 19 complete source responses");
  for (const row of evidence.responses) {
    // Only the retained canonical extraction is verifiable; raw capture metadata is not evidence of byte integrity.
    const expectedDigest = createHash("sha256").update(JSON.stringify(row.document)).digest("hex");
    if (pinned.has(row.url) || !/^https:\/\/site\.(api|web\.api)\.espn\.com\//.test(row.url) || expectedDigest !== row.documentSha256 || !isEvidenceTimestamp(row.checkedAt) || Date.parse(row.checkedAt) > Date.parse(evidence.cutoffUtc)) throw new Error("Invalid, duplicate or mismatched pinned ESPN response");
    pinned.set(row.url, row.document);
  }
  console.log(`PINNED ESPN extraction at ${evidence.cutoffUtc}; historical reproducibility only. A fresh live comparison remains mandatory before deployment.`);
}

const failures = [];
const fail = (message) => failures.push(message);
const teamSlug = (name) => name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replaceAll(" ", "-");

async function getJson(url) {
  if (evidence) {
    if (!pinned.has(url)) throw new Error(`Pinned evidence lacks ${url}; no silent network fallback`);
    return pinned.get(url);
  }
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// 1. Kickoff labels against ESPN's own text -------------------------------
let compared = 0;
for (const game of snapshot.schedule) {
  if (game.timeTbd) continue;
  const espn = game.statusDetail.match(/^\w{3}, (\w+) (\d+)(?:st|nd|rd|th) at (\d{1,2}):(\d{2}) (AM|PM) E[SD]T$/);
  if (!espn) continue; // finals read "Final"
  const label = game.kickoffLabel.match(/^\w{3} · \d{4}-(\d{2})-(\d{2}) · (\d{1,2}):(\d{2}) ([AP]M) ET$/);
  if (!label) {
    fail(`${game.id}: malformed kickoff label "${game.kickoffLabel}"`);
    continue;
  }
  compared += 1;
  const [, month, day, hour, minute, period] = label;
  if (MONTHS[Number(month) - 1] !== espn[1] || Number(day) !== Number(espn[2])) fail(`${game.id}: date "${game.kickoffLabel}" vs ESPN "${game.statusDetail}"`);
  if (`${Number(hour)}:${minute} ${period}` !== `${Number(espn[3])}:${espn[4]} ${espn[5]}`) fail(`${game.id}: time "${game.kickoffLabel}" vs ESPN "${game.statusDetail}"`);
}
console.log(`kickoff labels: ${compared} games compared with ESPN's own kickoff text`);

// 2/3. Fresh pull ----------------------------------------------------------
const weeks = Array.from({ length: snapshot.season.weeks }, (_, i) => i + 1);
const docs = await Promise.all(weeks.map((week) => getJson(`${ESPN}/scoreboard?dates=${snapshot.season.year}&seasontype=2&week=${week}&limit=100`)));
const fresh = docs.flatMap((doc) => doc.events ?? []);
const freshById = new Map(fresh.map((ev) => [ev.id, ev]));
const snapshotIds = new Set(snapshot.schedule.map((g) => g.id));
for (const id of freshById.keys()) if (!snapshotIds.has(id)) fail(`ESPN has event ${id} that the snapshot lacks`);
for (const id of snapshotIds) if (!freshById.has(id)) fail(`snapshot has event ${id} that ESPN no longer lists`);
let flexed = 0;
for (const game of snapshot.schedule) {
  const ev = freshById.get(game.id);
  if (ev && ev.date !== game.kickoffUtc) {
    flexed += 1;
    fail(`${game.id}: kickoff changed from ${game.kickoffUtc} to ${ev.date}; refresh before release`);
  }
  if (ev && ev.status?.type?.state === "post" && ev.status?.type?.completed !== false) {
    const competitors = ev.competitions?.[0]?.competitors ?? [];
    const away = competitors.find(c => c.homeAway === "away");
    const home = competitors.find(c => c.homeAway === "home");
    if (game.status !== "final" || Number(away?.score) !== game.awayScore || Number(home?.score) !== game.homeScore) {
      fail(`${game.id}: final score differs from fresh ESPN response`);
    }
  }
}
const isFinal = (ev) => ev.status?.type?.state === "post" && ev.status?.type?.completed !== false;
const finalsNow = fresh.filter(isFinal).length;
const finalsBaked = snapshot.schedule.filter((g) => g.status === "final").length;
const behind = Math.max(0, finalsNow - finalsBaked);
console.log(`schedule: ${fresh.length} ESPN events vs ${snapshot.schedule.length} baked; ${flexed} kickoff instants changed since compile; finals ESPN ${finalsNow} / baked ${finalsBaked}`);

const official = await getJson(STANDINGS);
const collect = (node) => (node.standings?.entries ?? []).concat((node.children ?? []).flatMap(collect));
const stat = (entry, name) => entry.stats.find((s) => s.name === name)?.value;
let teamsCompared = 0;
for (const entry of collect(official)) {
  const slug = teamSlug(entry.team.displayName);
  const baked = snapshot.standings[slug];
  if (!baked) {
    fail(`standings: ESPN team ${slug} missing from snapshot`);
    continue;
  }
  teamsCompared += 1;
  const want = [stat(entry, "wins"), stat(entry, "losses"), stat(entry, "ties") ?? 0, stat(entry, "pointsFor"), stat(entry, "pointsAgainst")];
  const have = [baked.wins, baked.losses, baked.ties, baked.pf, baked.pa];
  if (want.join() !== have.join()) fail(`standings ${slug}: baked W-L-T/PF/PA ${have.join("/")} vs ESPN official ${want.join("/")}`);
}
console.log(`standings: ${teamsCompared}/${snapshot.teams.length} teams compared with ESPN official standings`);
if (teamsCompared !== snapshot.teams.length) fail(`only ${teamsCompared} of ${snapshot.teams.length} teams found in ESPN standings`);

// Verdict --------------------------------------------------------------------
const structural = failures.filter((message) => !message.startsWith("standings "));
if (failures.length === 0) {
  console.log(`\nVERIFIED: snapshot compiled ${snapshot.generatedAt} agrees with ESPN (current week ${snapshot.season.currentWeek}).`);
} else if (structural.length === 0 && behind > 0) {
  console.log(`\nBEHIND: ${behind} game(s) went final after this snapshot was compiled (${failures.length} standing row(s) differ). Rebuild: npm run dataset:build`);
  process.exitCode = 2;
} else {
  console.log(`\nFAILED: ${failures.length} disagreement(s) with ESPN:`);
  for (const message of failures.slice(0, 25)) console.log(`  - ${message}`);
  process.exitCode = 1;
}
