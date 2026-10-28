import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { validatePublicationDates } from "./week7-publication-dates.mjs";
import { publisher } from "./week7-evidence.mjs";

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const manifest = read("data/content-refresh/current.json");
const snapshot = read(`data/content-refresh/${manifest.snapshot}`);
const injury = read("data/injury-research/current.json");
const fantasy = read("data/fantasy-desk/current.json");
const editorial = read("data/content-refresh/current-editorial.json");
const evidence = read("data/content-refresh/2026-10-28/review.json");
const old = path => JSON.parse(execFileSync("git", ["show", `${evidence.baseCommit}:${path}`], { encoding: "utf8", maxBuffer: 12_000_000 }));
const baseline = old(`data/content-refresh/${old("data/content-refresh/current.json").snapshot}`);

validatePublicationDates({ injury, editorial }, manifest);
assert.equal(snapshot.season.currentWeek, 8);
assert.equal(editorial.week, 8);
assert.equal(injury.week, 8);
assert.equal(snapshot.schedule.length, 272);
assert.equal(new Set(snapshot.schedule.map(game => game.id)).size, 272);
assert.equal(snapshot.teams.length, 32);
assert.equal(Object.keys(snapshot.standings).length, 32);
assert.deepEqual(snapshot.schedule, baseline.schedule, "No verified prior score, fixture, broadcast or official week can be overwritten by the older report");
assert.deepEqual(snapshot.standings, baseline.standings);
assert.deepEqual(snapshot.schedule.filter(game => [7, 8].includes(game.week)), evidence.schedule);
assert.deepEqual(snapshot.standings, evidence.standings);
assert.equal(snapshot.schedule.filter(game => game.status === "final").length, 107);
assert.equal(snapshot.schedule.filter(game => game.week === 7 && game.status === "final").length, 14);
const next = snapshot.schedule.filter(game => game.week === 8);
assert.equal(next.length, 14);
assert.ok(next.every(game => game.status === "scheduled" && game.awayScore == null && game.homeScore == null));
const playing = next.flatMap(game => [game.awaySlug, game.homeSlug]);
assert.equal(new Set(playing).size, 28);
assert.equal(editorial.byes.length, 4);
assert.deepEqual([...editorial.byes].sort(), ["houston-texans", "new-orleans-saints", "new-york-giants", "san-francisco-49ers"].sort());
assert.equal(new Set([...playing, ...editorial.byes]).size, 32);
const tally = Object.fromEntries(snapshot.teams.map(team => [team.slug, { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 }]));
for (const game of snapshot.schedule.filter(game => game.status === "final")) {
  const a = tally[game.awaySlug], h = tally[game.homeSlug];
  a.pf += game.awayScore; a.pa += game.homeScore; h.pf += game.homeScore; h.pa += game.awayScore;
  if (game.awayScore === game.homeScore) { a.ties++; h.ties++; }
  else if (game.awayScore > game.homeScore) { a.wins++; h.losses++; }
  else { h.wins++; a.losses++; }
}
for (const [slug, row] of Object.entries(tally)) for (const key of Object.keys(row)) assert.equal(snapshot.standings[slug][key], row[key], `${slug}:${key}`);
assert.deepEqual(Object.fromEntries(["wins", "losses", "ties", "pf", "pa"].map(key => [key, Object.values(tally).reduce((sum, row) => sum + row[key], 0)])), { wins: 106, losses: 106, ties: 2, pf: 4926, pa: 4926 });
const pt = utc => new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(utc));
assert.equal(pt(next.find(game => game.id === "401873023").kickoffUtc), "5:15 PM PDT");
assert.equal(pt(next.find(game => game.id === "401873024").kickoffUtc), "10:00 AM PST");
assert.equal(pt(next.find(game => game.id === "401873036").kickoffUtc), "5:15 PM PST");
assert.equal(injury.as_of, "2026-10-20", "Partial reviews cannot renew the comprehensive ledger date");
assert.equal(editorial.moduleSources.injuries.sourceAsOf, "2026-10-20");
assert.equal(editorial.moduleSources.leaders.sourceAsOf, "2026-10-20");
assert.equal(editorial.moduleSources.transactions.sourceAsOf, "2026-10-20");
assert.equal(editorial.moduleSources.fantasy.sourceAsOf, null);
assert.deepEqual(fantasy, { waiver: null, start_sit: null, rookie: null, trade: null });
assert.deepEqual(read(evidence.injuryArchive), old("data/injury-research/current.json"));
assert.deepEqual(read(evidence.fantasyArchive), old("data/fantasy-desk/current.json"));
assert.deepEqual(injury.watch, evidence.watch);
assert.equal(injury.watch.length, 17);
for (const row of [...injury.ledger, ...injury.watch, ...editorial.reserveStatuses, ...editorial.practiceReports, ...editorial.transactions.moves, ...editorial.statLeaders]) {
  assert.ok(new Set(row.sources.map(publisher)).size >= 2, `${row.player}: two publisher families required`);
}
for (const row of injury.watch) {
  assert.ok(["carolina-panthers", "green-bay-packers"].includes(row.team_slug));
  assert.equal(row.practice.thu, null); assert.equal(row.practice.fri, null); assert.equal(row.practice.sat, null);
  if (row.team_slug === "green-bay-packers") assert.equal(row.practice.wed, null);
  if (row.published_status) assert.equal(row.designation_week, 8);
}
assert.equal(injury.watch.find(row => row.player === "Matthew Golden").published_status, "QUESTIONABLE");
assert.equal(injury.watch.find(row => row.player === "Aaron Banks").published_status, null);
assert.equal(injury.watch.find(row => row.player === "Jalen Coker").published_status, "NO_DESIGNATION");
assert.equal(injury.ledger.find(row => row.player === "Terry McLaurin").status, "IR");
assert.equal(editorial.reserveStatuses.find(row => row.player === "Jer'Zhan Newton").status, "RETURN_TO_PRACTICE_WINDOW");
assert.equal(editorial.transactions.moves.find(row => row.player === "Quenton Nelson").status, "pending_physical");
assert.equal(editorial.inactives.length, 28);
for (const report of editorial.inactives) {
  const game = snapshot.schedule.find(game => game.id === report.gameId);
  assert.equal(report.week, 7); assert.equal(game?.week, 7);
  assert.ok([game.awaySlug, game.homeSlug].includes(report.teamSlug));
}
console.log("Week 8 acceptance: PASS — 272 events; 107 preserved finals; 14 Week 7 finals; 32 reconciled standings; 14 Week 8 games/4 byes; DST; 17 targeted watch rows; archives and publication safeguards.");
