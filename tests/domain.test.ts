import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { calculateBuyout } from "../lib/contracts.ts";
import nfl from "../lib/nfl-generated.ts";
import {
  coaches,
  fantasyNotes,
  games,
  portalEvents,
  preseasonRatings,
  providerHealth,
  scenarioGames,
  stadiums,
  teams,
  tvRows,
} from "../lib/cfb-dataset.ts";
import { normalizeForcedOutcomes, runPlayoffSimulation } from "../lib/simulation.ts";


test("travel affiliates: config integrity and fail-closed placement", async () => {
  const { travelPartners, activeTravelPartners, travelLinksForQuery, travelAffiliatesConfigured } =
    await import("../lib/travel-affiliates.ts");
  const categories = { hotels: 0, flights: 0, cars: 0 };
  for (const partner of travelPartners) {
    categories[partner.category] += 1;
    assert.match(partner.id, /^[a-z0-9-]+$/);
    assert.ok(partner.commissionNote.length > 3, partner.id);
  }
  // 2-3 partners per category per the strategy doc
  for (const [category, count] of Object.entries(categories)) {
    assert.ok(count >= 2 && count <= 3, `${category}: expected 2-3 partners, got ${count}`);
  }
  // Pre-activation: nothing renders anywhere (fail-closed placement surfaces).
  if (!travelAffiliatesConfigured) {
    assert.equal(activeTravelPartners().length, 0);
    assert.deepEqual(travelLinksForQuery("hotels near Bryant-Denny Stadium", "hotels"), []);
  } else {
    for (const link of travelLinksForQuery("Tuscaloosa car rental", "cars")) {
      assert.match(link.url, /^https:/, link.partner);
    }
  }
});
test("schedule is complete: every game references real teams and carries kickoff info", () => {
  assert.equal(teams.length, 32);
  assert.ok(games.length >= 250, `expected a full season schedule, got ${games.length}`);
  const slugs = new Set(teams.map((team) => team.slug));
  for (const game of games) {
    assert.ok(slugs.has(game.awayTeamId), `${game.id}: unknown away team`);
    assert.ok(slugs.has(game.homeTeamId), `${game.id}: unknown home team`);
    assert.match(game.kickoffLabel, /ET/, game.id);
    assert.ok(game.week >= 1 && game.week <= 22, `${game.id}: bad week ${game.week}`);
  }
  const withBroadcast = games.filter((game) => game.broadcast);
  assert.ok(withBroadcast.length >= 200, `expected TV designations, got ${withBroadcast.length}`);
  // 2026 opener: Thursday night international game on Netflix.
  const opener = games.find((game) => game.id === "401872657");
  assert.equal(opener?.broadcast, "Netflix");
  assert.match(opener?.venue ?? "", /Melbourne/i);
});

test("standings cover all 32 teams with honest records", () => {
  const entries = Object.values(nfl.standings);
  assert.equal(entries.length, 32);
  const slugs = new Set(teams.map((team) => team.slug));
  for (const row of entries) {
    assert.ok(slugs.has(row.slug), `standings: unknown team ${row.slug}`);
    assert.match(row.record, /^\d+-\d+(-\d+)?$/, row.slug);
  }
});

test("CFB-only surfaces stay empty and honest in the NFL build", () => {
  assert.equal(coaches.length, 0);
  assert.equal(portalEvents.length, 0);
  assert.equal(fantasyNotes.length, 0);
  assert.equal(Object.keys(preseasonRatings).length, 0);
  assert.equal(scenarioGames.length, 0);
});

test("NFL stadiums come from ESPN venue facts with honest editorial gaps", () => {
  assert.equal(stadiums.length, teams.length, "one venue per team");
  for (const stadium of stadiums) {
    assert.ok(stadium.name, `${stadium.teamId}: venue name required`);
    assert.ok(stadium.city, `${stadium.teamId}: venue city required`);
    assert.equal(stadium.provenance.provider, "ESPN NFL API");
    assert.equal(stadium.provenance.licenseClass, "R3_CITED_FACTS");
    // Gameday-visit details are unresearched: must stay empty, never invented.
    assert.equal(stadium.parking, "");
    assert.equal(stadium.transit, "");
    assert.equal(stadium.clearBag, "");
  }
});

test("every team carries a logo file and a brand color", () => {
  const projectRoot = fileURLToPath(new URL("..", import.meta.url));
  for (const team of teams) {
    assert.match(team.logo ?? "", /^\/logos\/[a-z0-9-]+\.png$/, team.slug);
    assert.ok(existsSync(`${projectRoot}/public${team.logo}`), `${team.slug}: missing file`);
    assert.match(team.color, /^#[0-9a-fA-F]{6}$/, team.slug);
  }
  for (const slug of [
    "kansas-city-chiefs",
    "dallas-cowboys",
    "green-bay-packers",
    "new-england-patriots",
    "san-francisco-49ers",
  ]) {
    assert.ok(teams.some((team) => team.slug === slug), `${slug} missing from the dataset`);
  }
});

test("TV rows mirror the schedule with ET times", () => {
  assert.equal(tvRows.length, games.length);
  for (const row of tvRows) {
    if (row.time_et) assert.match(row.time_et, /\d{1,2}:\d{2} [AP]M ET/, `${row.away} at ${row.home}`);
  }
});

test("affiliate seams stay fail-closed until configured", async () => {
  const { ticketLinksForTeam, ticketAffiliatesConfigured, ticketPartners } = await import("../lib/affiliates.ts");
  // LINK-FIRST: every partner always yields a working https link.
  const links = ticketLinksForTeam("Kansas City Chiefs");
  assert.equal(links.length, ticketPartners.length);
  for (const link of links) {
    assert.match(link.url, /^https:\/\//, link.partner);
    if (ticketAffiliatesConfigured && link.tracked) {
      assert.ok(link.url.includes("url="), "wrapper must encode the destination");
    } else {
      assert.equal(link.tracked, false, `${link.partner}: untracked must be direct`);
    }
  }
});

test("playoff simulation is deterministic under the same seed", () => {
  const first = runPlayoffSimulation("same-seed", {}, 2_000);
  const second = runPlayoffSimulation("same-seed", {}, 2_000);
  assert.deepEqual(first, second);
});

test("different seeds vary and probabilities stay bounded", () => {
  const first = runPlayoffSimulation("seed-a", {}, 2_000);
  const second = runPlayoffSimulation("seed-b", {}, 2_000);
  assert.notDeepEqual(first.results, second.results);
  for (const result of first.results) {
    assert.ok(result.playoff >= 0 && result.playoff <= 1);
    assert.ok(result.bye >= 0 && result.bye <= 1);
    assert.ok(result.title >= 0 && result.title <= 1);
  }
  const titleTotal = first.results.reduce((sum, result) => sum + result.title, 0);
  assert.ok(Math.abs(titleTotal - 1) < 0.001);
});

test("forced outcomes reject games that are not on the board", () => {
  // The NFL build ships no scenario board yet, so every forced pair must be
  // dropped rather than silently influencing the simulation.
  assert.deepEqual(normalizeForcedOutcomes({ "no-such-game": "kansas-city-chiefs" }), {});
  const result = runPlayoffSimulation("fractional", {}, 1_000.5);
  assert.equal(result.iterations, 1_000);
  assert.ok(Math.abs(result.results.reduce((sum, item) => sum + item.title, 0) - 1) < 0.001);
});

test("buyout applies mitigation without going negative", () => {
  const result = calculateBuyout({
    guaranteedRemaining: 13_000_000,
    mitigationApplies: true,
    estimatedOffset: 2_000_000,
  });
  assert.equal(result.estimatedNet, 11_000_000);
  assert.equal(
    calculateBuyout({
      guaranteedRemaining: 1_000_000,
      mitigationApplies: true,
      estimatedOffset: 2_000_000,
    }).estimatedNet,
    0,
  );
});

test("X & Ys concept library is complete and scheme families map to real teams", async () => {
  const { CONCEPT_LIBRARY, SCHEME_FAMILIES, TECHNIQUE_PRIMERS, WEEKLY_SPOTLIGHTS, publishedSpotlights } =
    await import("../lib/x-and-ys.ts");
  assert.ok(CONCEPT_LIBRARY.length >= 20, `expected a full concept library, got ${CONCEPT_LIBRARY.length}`);
  assert.ok(CONCEPT_LIBRARY.some((c) => c.side === "pass") && CONCEPT_LIBRARY.some((c) => c.side === "run"));
  for (const concept of CONCEPT_LIBRARY) {
    assert.match(concept.id, /^[a-z-]+$/);
    assert.ok(concept.macro.length > 80, `${concept.id}: macro too thin`);
    assert.ok(concept.micro.length > 80, `${concept.id}: micro too thin`);
    assert.ok(concept.beats.length > 5, `${concept.id}: beats missing`);
    assert.ok(concept.tags.length >= 1, `${concept.id}: no tags`);
  }
  const slugs = new Set(teams.map((team) => team.slug));
  for (const family of SCHEME_FAMILIES) {
    assert.ok(family.teamSlugs.length >= 1, `${family.id}: no teams mapped`);
    for (const slug of family.teamSlugs) {
      assert.ok(slugs.has(slug), `${family.id}: unknown team slug ${slug}`);
    }
  }
  assert.ok(TECHNIQUE_PRIMERS.length >= 5);
  // Spotlight slots must never fabricate: a slot without a video has no
  // playmaker, team, or concept attached.
  for (const spotlight of WEEKLY_SPOTLIGHTS) {
    if (spotlight.videoUrl === null) {
      assert.equal(spotlight.playmaker, null);
      assert.equal(spotlight.teamSlug, null);
      assert.equal(spotlight.publishedAt, null);
    } else {
      assert.match(spotlight.videoUrl, /^https:\/\//);
      assert.ok(spotlight.playmaker, "published spotlight needs a playmaker");
    }
  }
  assert.equal(publishedSpotlights().length, 0); // nothing publishes before Week 1 completes
});

test("DFS ledger grades only published top-10 picks and reports honest accuracy", async () => {
  const { accuracyFor, accuracyByWeek, isGraded, isHit, GRADE_DEPTH, projections, pickResults } =
    await import("../lib/dfs-ledger.ts");
  assert.equal(projections.length, 0); // fail-closed until picks publish
  assert.equal(pickResults.length, 0);
  assert.ok(GRADE_DEPTH === 10);

  // Synthetic ledger to verify the math deterministically.
  const fake: import("../lib/dfs-ledger.ts").DfsPickResult[] = [
    { week: 1, position: "WR", player: "A", teamSlug: "t", projectedPoints: 20, projectedRank: 3, actualPoints: 18, actualRank: 4 },
    { week: 1, position: "WR" as const, player: "B", teamSlug: "t", projectedPoints: 14, projectedRank: 8, actualPoints: 6, actualRank: 28 },
    { week: 1, position: "QB" as const, player: "C", teamSlug: "t", projectedPoints: 22, projectedRank: 12, actualPoints: 9, actualRank: 20 },
    { week: 2, position: "RB" as const, player: "D", teamSlug: "t", projectedPoints: 17, projectedRank: 2, actualPoints: 24, actualRank: 1 },
  ];
  assert.equal(isGraded(fake[0]), true);
  assert.equal(isGraded(fake[2]), false); // rank 12 is outside grading depth
  assert.equal(isHit(fake[0]), true);
  assert.equal(isHit(fake[1]), false);
  assert.equal(isHit(fake[2]), null);

  const week1 = accuracyFor(fake, 1);
  assert.equal(week1.gradedPicks, 2);
  assert.equal(week1.hits, 1);
  assert.equal(week1.hitRate, 0.5);
  // MAE uses every pick with both points published, including the ungraded one.
  assert.ok(Math.abs((week1.mae ?? 0) - (2 + 8 + 13) / 3) < 1e-9);
  const season = accuracyFor(fake);
  assert.equal(season.gradedPicks, 3);
  assert.equal(season.hits, 2);
  assert.equal(accuracyByWeek(fake).length, 2);

  const empty = accuracyFor([]);
  assert.equal(empty.hitRate, null);
  assert.equal(empty.mae, null);
  assert.equal(empty.bias, null);
});

test("injury desk: sourced base, long-term rule and bounded Week 7 cadence", async () => {
  const injury = await import("../lib/injury-report.ts");
  /* The floor proves the feed LOADED — not its size. The NFL injury report
     fluctuates through the week (draft-week peak was 200+; midweek after
     Week 1 legitimately sat at 172 as players returned). A broken fetch ships
     0; anything past a modest floor is a healthy feed. */
  assert.ok(injury.espnInjuries.length >= 100 || (injury.injuryResearch.asOf && injury.injuryResearch.ledger.length > 0 && injury.injuryResearch.watch.length > 0), "a loaded provider base or a sourced research publication is required");
  const slugs = new Set(teams.map((team) => team.slug));
  for (const entry of injury.espnInjuries.slice(0, 50)) {
    assert.ok(entry.teamSlug === null || slugs.has(entry.teamSlug), `unknown team ${entry.teamSlug}`);
  }
  // Long-term rule: IR always qualifies; OUT needs 3+ weeks; 2 weeks never does.
  assert.ok(injury.isLongTerm({ status: "IR", weeksOut: null }));
  assert.ok(injury.isLongTerm({ status: "OUT", weeksOut: 3 }));
  assert.ok(!injury.isLongTerm({ status: "OUT", weeksOut: 2 }));
  assert.ok(!injury.isLongTerm({ status: "QUESTIONABLE", weeksOut: null }));
  // Practice-status likelihood model is deterministic and explainable.
  assert.equal(injury.likelihoodFromPractice({ wed: null, thu: "FP", fri: "FP", sat: null }).likelihood, "likely");
  assert.equal(injury.likelihoodFromPractice({ wed: null, thu: null, fri: "DNP", sat: null }).likelihood, "doubtful");
  assert.equal(injury.likelihoodFromPractice({ wed: null, thu: null, fri: null, sat: null }).likelihood, null);
  // The actual bounded automation covers the early Sunday game and then expires.
  const tuesday = injury.nextInjurySlot(new Date("2026-10-20T18:00:00Z"));
  assert.equal(tuesday?.at.toISOString(), "2026-10-20T23:15:00.000Z");
  const earlySunday = injury.nextInjurySlot(new Date("2026-10-25T10:59:00Z"));
  assert.equal(earlySunday?.at.toISOString(), "2026-10-25T11:00:00.000Z");
  assert.equal(injury.nextInjurySlot(new Date("2026-10-28T07:00:00Z")), null);
  // Missing research stays empty; published research must have provenance.
  const research = injury.injuryResearch;
  if (research.asOf === null) {
    assert.equal(research.ledger.length, 0);
    assert.equal(research.watch.length, 0);
  } else {
    assert.match(research.asOf, /^\d{4}-\d{2}-\d{2}$/);
    for (const row of [...research.ledger, ...research.watch]) {
      assert.ok(slugs.has(row.teamSlug), row.player);
      assert.ok(row.sources.length >= 2, row.player + " needs two sources");
      assert.ok(new Set(row.sources.map((url) => new URL(url).hostname)).size >= 2,
        row.player + " needs two publishers");
    }
    for (const row of research.ledger) assert.ok(injury.isLongTerm(row), row.player);
  }
});

test("dataset records are provenance-tagged and never claim live status", () => {
  assert.ok(games.every((game) => game.provenance.dataEnvironment === "production"));
  assert.ok(games.every((game) => game.provenance.licenseClass === "R2_LINK_ONLY"));
  assert.ok(games.every((game) => !game.statusDetail.toLowerCase().includes("live")));
  assert.equal(
    providerHealth.find((provider) => provider.id === "espn-nfl")?.status,
    "operational",
  );
});

test("fantasy desk is fail-closed and decision-only", async () => {
  const desk = await import("../lib/fantasy-desk.ts");
  // Boards ship only when staged research passes ingest validation.
  for (const board of [desk.fantasyDesk.waiver, desk.fantasyDesk.startSit, desk.fantasyDesk.rookie, desk.fantasyDesk.trade]) {
    if (board === null) continue;
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(board.as_of), "board needs an as_of date");
  }
  // Start/Sit carries tier keys only — no numeric projection fields anywhere.
  if (desk.fantasyDesk.startSit) {
    const allowedTiers = new Set(["start_confidence", "start_if_needed", "fringe", "sit"]);
    for (const group of desk.fantasyDesk.startSit.positions) {
      for (const tier of group.tiers) {
        assert.ok(allowedTiers.has(tier.tier), `unknown tier key ${tier.tier}`);
        for (const row of tier.players) {
          assert.ok(!("projected_points" in row) && !("projection" in row), "start/sit rows must not carry projections");
          assert.ok(typeof row.note === "string" && row.note.length > 0, "every tier row carries a note");
        }
      }
    }
  }
  // Trade tiers are internally consistent within a position.
  if (desk.fantasyDesk.trade) {
    for (const group of desk.fantasyDesk.trade.boards) {
      const seen = new Map();
      for (const row of group.rows) {
        assert.ok(row.tier >= 1 && row.tier <= 5, `tier out of range for ${row.player}`);
        const prior = seen.get(row.player);
        assert.ok(prior === undefined || prior === row.tier, `${row.player} has inconsistent tiers`);
        seen.set(row.player, row.tier);
      }
    }
  }
  // Waiver ownership is published-or-null, never estimated.
  if (desk.fantasyDesk.waiver) {
    for (const add of desk.fantasyDesk.waiver.adds) {
      assert.ok(add.ownership_pct === null || (add.ownership_pct >= 0 && add.ownership_pct <= 100));
      assert.ok(Array.isArray(add.sources) && add.sources.length > 0, `waiver add ${add.player} needs sources`);
    }
  }
  // Cadence metadata is complete for the honest shells.
  assert.equal(desk.DESK_CADENCE.length, 4);
});
