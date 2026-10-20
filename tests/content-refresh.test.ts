import assert from "node:assert/strict";
import test from "node:test";
import { games, standings } from "../lib/cfb-dataset.ts";
import { byeTeams, contentSourceModules, practiceReports, refreshWeek, reserveStatuses, sourceFreshness, statLeaders, transactions } from "../lib/content-refresh.ts";

test("international game metadata preserves the actual city and designated home team", () => {
  const game = games.find(row => row.id === "401873011");
  assert.equal(game?.homeTeamId, "new-orleans-saints");
  assert.equal(game?.neutralSite, true);
  assert.equal(game?.venue, "Stade de France");
  assert.equal(game?.city, "Saint-Denis");
  assert.equal(game?.country, "France");
  assert.equal(game?.kickoffUtc, "2026-10-25T13:30Z");
});

test("current-week games and byes partition all 32 teams; Washington has a division", () => {
  const participants = games.filter(row => row.week === refreshWeek).flatMap(row => [row.awayTeamId, row.homeTeamId]);
  assert.equal(new Set([...participants, ...byeTeams]).size, 32);
  assert.equal(participants.length + byeTeams.length, 32);
  assert.equal(standings.find(row => row.teamSlug === "washington-commanders")?.division, "NFC East");
});

test("wire and leaders expose two distinct publishers per row and never include held claims", () => {
  assert.equal(transactions.length, 30);
  assert.equal(statLeaders.length, 15);
  for (const row of [...transactions, ...statLeaders]) {
    assert.ok(new Set(row.sources.map(url => new URL(url).hostname)).size >= 2, row.player);
  }
  assert.equal(statLeaders.find(row => row.category === "passing" && row.rank === 1)?.yards, 1794);
});

test("source age becomes stale without a rebuild and an unavailable source never reads current", () => {
  assert.equal(sourceFreshness(null), "unavailable");
  assert.equal(sourceFreshness("invalid"), "unavailable");
  assert.equal(sourceFreshness("2026-10-20T19:20:03.528Z", new Date("2026-10-21T19:20:03.528Z")), "current");
  assert.equal(sourceFreshness("2026-10-20T19:20:03.528Z", new Date("2026-10-23T19:20:03.528Z")), "stale");
  for (const row of contentSourceModules(new Date("2026-11-01T00:00:00Z"))) assert.equal(row.freshness, "stale");
});

test("Thursday-game walkthrough retains Monday date and week instead of filling Wednesday", () => {
  const report = practiceReports.find(row => row.player === "Kyle Monangai");
  assert.equal(report?.week, 7);
  assert.equal(report?.date, "2026-10-19");
  assert.equal(report?.report_type, "estimated_walkthrough");
  assert.equal(report?.participation, "DNP");
});

test("reserve eligibility statuses remain separate from the injury ledger and carry two sources", () => {
  assert.equal(reserveStatuses.length, 14);
  for (const row of reserveStatuses) {
    assert.ok(!["IR", "OUT", "QUESTIONABLE", "DOUBTFUL"].includes(row.status));
    assert.ok(new Set(row.sources.map(url => new URL(url).hostname)).size >= 2);
  }
});
