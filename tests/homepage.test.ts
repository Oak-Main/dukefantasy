import assert from "node:assert/strict";
import test from "node:test";
import { datasetAsOf, games, standings, teams } from "../lib/cfb-dataset.ts";
import {
  dateLabel,
  featuredGame,
  formatPointDifferential,
  formatRecord,
  isNationalWindow,
  slateFinals,
  topStandings,
  weekGames,
  winPercentage,
  type BroadcastGame,
  type BroadcastTeam,
} from "../lib/homepage.ts";
import type { NflGameEvent } from "../lib/nfl-scoreboard.ts";
import type { TeamStanding } from "../lib/types.ts";

/* ------------------------------------------------------------ fixtures */

// Kickoff instants from the real 2026-10-11 slate (UTC).
const LONDON = "2026-10-11T13:30Z"; // 9:30 AM ET
const EARLY = "2026-10-11T17:00Z"; // 1:00 PM ET
const LATE_WINDOW = "2026-10-11T20:25Z"; // 4:25 PM ET
const SUNDAY_NIGHT = "2026-10-12T00:20Z"; // 8:20 PM ET Sunday
const MONDAY_NIGHT = "2026-10-13T00:15Z"; // 8:15 PM ET Monday

function row(
  teamSlug: string,
  record: string,
  pointsFor: number,
  pointsAgainst: number,
): TeamStanding {
  const [wins, losses, ties = 0] = record.split("-").map(Number);
  return { teamSlug, division: "NFC West", wins, losses, ties, pointsFor, pointsAgainst };
}

function team(slug: string, record: string): BroadcastTeam {
  return {
    slug,
    name: slug,
    shortName: slug,
    abbreviation: slug.slice(0, 3).toUpperCase(),
    conference: "NFC",
    record,
    color: "#112233",
  };
}

function game(
  id: string,
  away: string,
  home: string,
  overrides: Partial<BroadcastGame> = {},
): BroadcastGame {
  return {
    id,
    week: 5,
    date: "2026-10-11T17:00:00.000Z",
    kickoffUtc: EARLY,
    kickoffLabel: "Sun · 2026-10-11 · 1:00 PM ET",
    statusDetail: "Sun, October 11th at 1:00 PM EDT",
    awayTeamId: away,
    homeTeamId: home,
    venue: "Venue",
    broadcast: "CBS",
    neutralSite: false,
    status: "scheduled",
    ...overrides,
  };
}

const slugs = (rows: readonly { teamSlug: string }[]) => rows.map((r) => r.teamSlug);

/* ------------------------------------------------------- topStandings */

test("standings rank by win percentage, then point differential", () => {
  const ranked = topStandings([
    row("three-one-low", "3-1", 80, 70), // .750, +10
    row("four-oh", "4-0", 60, 55), // 1.000, +5
    row("three-one-high", "3-1", 90, 60), // .750, +30
    row("two-two-huge", "2-2", 200, 100), // .500, +100
  ]);
  assert.deepEqual(slugs(ranked), [
    "four-oh",
    "three-one-high",
    "three-one-low",
    "two-two-huge",
  ]);
  assert.deepEqual(
    ranked.map((r) => r.rank),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    ranked.map((r) => r.pointDifferential),
    [5, 30, 10, 100],
  );
});

test("a tie counts as half a win", () => {
  assert.equal(winPercentage({ wins: 3, losses: 0, ties: 1 }), 0.875);
  assert.equal(winPercentage({ wins: 0, losses: 0, ties: 0 }), null);
  assert.deepEqual(
    slugs(
      topStandings([
        row("three-one", "3-1", 90, 60), // .750, +30
        row("three-one-flat", "3-1", 50, 50), // .750, 0
        row("unbeaten-tied", "3-0-1", 50, 50), // .875
        row("four-oh", "4-0", 50, 50), // 1.000
      ]),
    ),
    ["four-oh", "unbeaten-tied", "three-one", "three-one-flat"],
  );
});

test("equal records fall to points scored, then team slug, whatever the input order", () => {
  const rows = [
    row("delta", "2-2", 100, 90), // +10, 100 scored
    row("alpha", "2-2", 80, 70), // +10, 80 scored
    row("charlie", "2-2", 80, 70), // identical to alpha
    row("bravo", "2-2", 60, 50), // +10, 60 scored
  ];
  const expected = ["delta", "alpha", "charlie", "bravo"];
  assert.deepEqual(slugs(topStandings(rows)), expected);
  assert.deepEqual(slugs(topStandings([...rows].reverse())), expected);
  assert.deepEqual(slugs(topStandings([rows[2], rows[0], rows[3], rows[1]])), expected);
});

test("teams that have not played are left out, so a fresh season shows the empty state", () => {
  assert.deepEqual(topStandings([row("a", "0-0", 0, 0), row("b", "0-0", 0, 0)]), []);
  assert.deepEqual(topStandings([]), []);
  assert.deepEqual(slugs(topStandings([row("idle", "0-0", 0, 0), row("played", "1-0", 21, 14)])), ["played"]);
});

test("the list is capped at five by default, honours a limit, and never mutates its input", () => {
  const rows = ["a", "b", "c", "d", "e", "f", "g"].map((slug, i) => row(slug, "3-1", 100 - i, 50));
  const snapshot = JSON.stringify(rows);
  assert.equal(topStandings(rows).length, 5);
  assert.equal(topStandings(rows, 2).length, 2);
  assert.deepEqual(topStandings(rows, 0), []);
  assert.equal(JSON.stringify(rows), snapshot);
});

test("records and point differentials format for display", () => {
  assert.equal(formatRecord({ wins: 3, losses: 1, ties: 0 }), "3-1");
  assert.equal(formatRecord({ wins: 3, losses: 1, ties: 1 }), "3-1-1");
  assert.equal(formatPointDifferential(58), "+58");
  assert.equal(formatPointDifferential(-3), "\u22123");
  assert.equal(formatPointDifferential(0), "0");
});

test("adapter standings cover every team and agree with each team's record", () => {
  assert.equal(standings.length, teams.length);
  const bySlug = new Map(teams.map((t) => [t.slug, t]));
  for (const entry of standings) {
    const t = bySlug.get(entry.teamSlug);
    assert.ok(t, `standings: unknown team ${entry.teamSlug}`);
    assert.equal(formatRecord(entry), t.record, entry.teamSlug);
    // Washington was once keyed `was` (ESPN says WSH) and shipped with no division.
    assert.match(entry.division, /^(AFC|NFC) (East|North|South|West)$/, entry.teamSlug);
  }
  const top = topStandings(standings);
  assert.ok(top.length <= 5);
  for (const entry of top) assert.equal(entry.pointDifferential, entry.pointsFor - entry.pointsAgainst);
});

/* ------------------------------------------------------- featuredGame */

test("featured game is the strongest combined record, never just the earliest slot", () => {
  const roster = [
    team("london-a", "2-2"),
    team("london-b", "3-1"),
    team("noon-a", "2-2"),
    team("noon-b", "2-2"),
    team("late-a", "4-0"),
    team("late-b", "3-1"),
  ];
  const slate = [
    game("1", "london-a", "london-b", { kickoffUtc: LONDON, broadcast: "NFL Net" }),
    game("2", "noon-a", "noon-b"),
    game("3", "late-a", "late-b", { kickoffUtc: LATE_WINDOW, broadcast: "Fox" }),
  ];
  assert.equal(featuredGame(slate, roster)?.id, "3");
});

test("with every team unranked and every record level, the old earliest-game fallback is gone", () => {
  const roster = [team("a", "2-2"), team("b", "2-2"), team("c", "2-2"), team("d", "2-2")];
  const slate = [
    game("early", "a", "b", { kickoffUtc: LONDON, broadcast: "NFL Net" }),
    game("late", "c", "d", { kickoffUtc: LATE_WINDOW, broadcast: "Fox" }),
  ];
  assert.equal(featuredGame(slate, roster)?.id, "late");
});

test("a national or primetime window breaks ties, but a stronger record always outranks it", () => {
  const roster = [
    team("a", "3-1"),
    team("b", "2-2"),
    team("c", "3-1"),
    team("d", "2-2"),
    team("e", "4-0"),
    team("f", "3-1"),
  ];
  const regional = game("regional", "a", "b", { broadcast: "CBS", kickoffUtc: LATE_WINDOW });
  // The regional game kicks off later, but the national window decides first.
  const primetime = game("primetime", "c", "d", { broadcast: "NBC", kickoffUtc: EARLY });
  assert.equal(featuredGame([regional, primetime], roster)?.id, "primetime");
  assert.equal(featuredGame([primetime, regional], roster)?.id, "primetime");
  const stronger = game("stronger", "e", "f", { broadcast: "CBS" });
  assert.equal(featuredGame([primetime, stronger], roster)?.id, "stronger");
});

test("national windows are recognised by network name only", () => {
  for (const network of ["NBC", "nbc", "ESPN", "ESPN/ABC", "ABC", "Prime Video", "Amazon Prime Video", "Netflix", "NETFLIX", "NBC/Peacock"]) {
    assert.equal(isNationalWindow(network), true, network);
  }
  for (const network of ["CBS", "FOX", "Fox", "NFL Net", "ESPN2", "", null, undefined]) {
    assert.equal(isNationalWindow(network), false, String(network));
  }
});

test("among level matchups the later kickoff wins, whatever the day, then game id", () => {
  const roster = [team("a", "2-2"), team("b", "2-2"), team("c", "2-2"), team("d", "2-2"), team("e", "2-2"), team("f", "2-2")];
  const london = game("1", "a", "b", { kickoffUtc: LONDON, broadcast: "NFL Net" });
  const noon = game("2", "c", "d", { kickoffUtc: EARLY });
  const late = game("3", "e", "f", { kickoffUtc: LATE_WINDOW });
  assert.equal(featuredGame([london, noon, late], roster)?.id, "3");
  // Thursday night is chronologically earlier than the Sunday late window.
  const thursday = game("4", "a", "c", { date: "2026-10-08T17:00:00.000Z", kickoffUtc: "2026-10-09T00:15Z" });
  assert.equal(featuredGame([thursday, late], roster)?.id, "3");
  // Identical instants fall back to game id, so the pick is stable.
  const twin = game("0", "a", "d", { kickoffUtc: LATE_WINDOW });
  assert.equal(featuredGame([late, twin], roster)?.id, "0");
  assert.equal(featuredGame([twin, late], roster)?.id, "0");
});

test("a 'Time TBD' slot never outranks a game with a real kickoff on the same day", () => {
  // Unflexed slots carry a placeholder instant at the start of their Eastern day.
  const roster = [team("a", "2-2"), team("b", "2-2"), team("c", "2-2"), team("d", "2-2")];
  const tbd = game("tbd", "a", "b", {
    week: 16,
    date: "2026-12-27T17:00:00.000Z",
    kickoffUtc: "2026-12-27T05:00Z",
    kickoffLabel: "Sun · 2026-12-27 · Time TBD (ET)",
    broadcast: null,
  });
  const known = game("known", "c", "d", {
    week: 16,
    date: "2026-12-27T17:00:00.000Z",
    kickoffUtc: "2026-12-27T18:00Z",
  });
  assert.equal(featuredGame([tbd, known], roster)?.id, "known");
  assert.equal(featuredGame([known, tbd], roster)?.id, "known");
  // With no instant at all the game still orders by its Eastern day.
  const undated = game("undated", "a", "b", { kickoffUtc: undefined });
  assert.equal(featuredGame([undated], roster)?.id, "undated");
});

test("a game that is already over is never featured", () => {
  const roster = [team("a", "4-0"), team("b", "4-0"), team("c", "2-2"), team("d", "2-2"), team("e", "1-3"), team("f", "1-3")];
  const final = game("final", "a", "b", { status: "final", awayScore: 24, homeScore: 21 });
  const next = game("next", "c", "d");
  assert.equal(featuredGame([final, next], roster)?.id, "next");
  assert.equal(featuredGame([final], roster), undefined);
  assert.equal(featuredGame([final, game("canceled", "c", "d", { status: "canceled" }), game("postponed", "e", "f", { status: "postponed" })], roster), undefined);
  assert.equal(featuredGame([], roster), undefined);
});

test("live and delayed games stay eligible", () => {
  const roster = [team("a", "4-0"), team("b", "4-0"), team("c", "2-2"), team("d", "2-2")];
  const next = game("next", "c", "d");
  assert.equal(featuredGame([next, game("live", "a", "b", { status: "live" })], roster)?.id, "live");
  assert.equal(featuredGame([next, game("delayed", "a", "b", { status: "delayed" })], roster)?.id, "delayed");
});

test("ties count as half a win in the combined record", () => {
  const roster = [team("a", "3-0-1"), team("b", "3-0-1"), team("c", "3-1"), team("d", "3-1")];
  const tied = game("tied", "a", "b");
  const clean = game("clean", "c", "d", { broadcast: "NBC" });
  // .875 beats .750 even though the other game has a national window.
  assert.equal(featuredGame([clean, tied], roster)?.id, "tied");
});

test("unpublished or malformed records neither crash the pick nor sink the game", () => {
  const roster = [team("a", ""), team("b", "Not published"), team("c", "3-1"), team("d", "1-3"), team("e", "4-0"), team("f", "3-1"), team("g", "1-3")];
  const unknown = game("unknown", "a", "b"); // no data: neutral .500
  const middling = game("middling", "c", "d"); // .500
  const strong = game("strong", "e", "f"); // .875
  const weak = game("weak", "d", "g"); // 1-3 twice: .250
  assert.equal(featuredGame([unknown], roster)?.id, "unknown");
  assert.equal(featuredGame([weak, unknown], roster)?.id, "unknown");
  assert.equal(featuredGame([unknown, middling, strong], roster)?.id, "strong");
});

test("games between teams outside the team list are skipped", () => {
  const roster = [team("a", "4-0"), team("b", "4-0")];
  const orphan = game("orphan", "a", "nobody");
  const valid = game("valid", "a", "b");
  assert.equal(featuredGame([orphan, valid], roster)?.id, "valid");
  assert.equal(featuredGame([orphan], roster), undefined);
});

test("the pick does not depend on input order and does not mutate its inputs", () => {
  const roster = [team("a", "3-1"), team("b", "3-1"), team("c", "3-1"), team("d", "3-1"), team("e", "3-1"), team("f", "3-1")];
  const slate = [
    game("1", "a", "b", { kickoffUtc: EARLY }),
    game("2", "c", "d", { kickoffUtc: LATE_WINDOW }),
    game("3", "e", "f", { kickoffUtc: LATE_WINDOW }),
  ];
  const snapshot = JSON.stringify(slate);
  const expected = featuredGame(slate, roster)?.id;
  assert.equal(expected, "2");
  assert.equal(featuredGame([...slate].reverse(), roster)?.id, expected);
  assert.equal(featuredGame([slate[1], slate[2], slate[0]], roster)?.id, expected);
  assert.equal(JSON.stringify(slate), snapshot);
});

test("Sunday-morning week: the 9:30 AM London game does not become the marquee by default", () => {
  // Shaped like the real Week 5 slate: Thursday's game is final, the London
  // game airs on NFL Network, eight one o'clock games, the late window, Sunday
  // Night Football on NBC and Monday Night Football on ESPN.
  const roster = [
    team("tampa-bay", "4-1"), team("dallas", "3-2"),
    team("philadelphia", "2-2"), team("jacksonville", "3-1"),
    team("chicago", "3-1"), team("green-bay", "2-2"),
    team("houston", "0-4"), team("tennessee", "0-4"),
    team("cincinnati", "2-2"), team("miami", "0-4"),
    team("las-vegas", "3-1"), team("new-england", "2-2"),
    team("minnesota", "4-0"), team("new-orleans", "1-3"),
    team("denver", "2-2"), team("la-chargers", "0-4"),
    team("detroit", "2-2"), team("arizona", "1-3"),
    team("san-francisco", "4-0"), team("seattle", "3-1"),
    team("baltimore", "3-1"), team("atlanta", "2-2"),
    team("buffalo", "3-1"), team("la-rams", "2-2"),
  ];
  const slate = [
    game("tnf", "tampa-bay", "dallas", { status: "final", broadcast: "Prime Video", date: "2026-10-08T17:00:00.000Z", kickoffUtc: "2026-10-09T00:15Z" }),
    game("london", "philadelphia", "jacksonville", { broadcast: "NFL Net", kickoffUtc: LONDON }),
    game("chi-gb", "chicago", "green-bay", { broadcast: "FOX" }),
    game("hou-ten", "houston", "tennessee", { broadcast: "CBS" }),
    game("cin-mia", "cincinnati", "miami", { broadcast: "FOX" }),
    game("lv-ne", "las-vegas", "new-england", { broadcast: "CBS" }),
    game("min-no", "minnesota", "new-orleans", { broadcast: "FOX" }),
    game("den-lac", "denver", "la-chargers", { broadcast: "CBS", kickoffUtc: "2026-10-11T20:05Z" }),
    game("det-ari", "detroit", "arizona", { broadcast: "FOX", kickoffUtc: LATE_WINDOW }),
    game("sf-sea", "san-francisco", "seattle", { broadcast: "FOX", kickoffUtc: LATE_WINDOW }),
    game("snf", "baltimore", "atlanta", { broadcast: "NBC", kickoffUtc: SUNDAY_NIGHT }),
    game("mnf", "buffalo", "la-rams", { broadcast: "ESPN", date: "2026-10-12T17:00:00.000Z", kickoffUtc: MONDAY_NIGHT }),
  ];
  assert.equal(featuredGame(slate, roster)?.id, "sf-sea");
  // If the best matchup were already over, the national windows win the .625
  // tie and the London game is still never the default.
  const withoutBest = slate.map((g) => (g.id === "sf-sea" ? { ...g, status: "final" as const } : g));
  const pick = featuredGame(withoutBest, roster);
  assert.notEqual(pick?.id, "london");
  assert.ok(["snf", "mnf"].includes(pick?.id ?? ""), `unexpected pick ${pick?.id}`);
  // And with no national window left either, the later kickoff beats the London slot.
  const regionalOnly = withoutBest.filter((g) => g.id !== "snf" && g.id !== "mnf");
  const regional = featuredGame(regionalOnly, roster);
  assert.notEqual(regional?.id, "london");
  assert.ok(["chi-gb", "lv-ne", "min-no"].includes(regional?.id ?? ""), `unexpected pick ${regional?.id}`);
});

test("on the real dataset the pick, when there is one, is a slate game that is not over", () => {
  const slate = weekGames(games, datasetAsOf);
  const pick = featuredGame(slate, teams);
  if (!pick) {
    const over = new Set(["final", "canceled", "postponed"]);
    assert.ok(slate.every((g) => over.has(g.status)), "an upcoming game exists but nothing was featured");
    return;
  }
  assert.ok(slate.some((g) => g.id === pick.id), "pick must come from the slate");
  assert.notEqual(pick.status, "final");
  assert.ok(teams.some((t) => t.slug === pick.awayTeamId) && teams.some((t) => t.slug === pick.homeTeamId));
});

/* ------------------------------------------------- Eastern days and weeks */

test("the Week 5 rail has Thursday, Sunday and Monday tabs: no Friday, no Tuesday", () => {
  // The tab labels come from each game's Eastern date. When those were UTC days,
  // Thursday night read Friday and Sunday/Monday night read Monday/Tuesday.
  const slate = weekGames(games, "2026-10-11");
  const tabs = [...new Set(slate.map((g) => g.date.slice(0, 10)))].map((day) => dateLabel(day).split(",")[0]);
  assert.deepEqual(tabs, ["Thu", "Sun", "Mon"]);
});

function finalEvents(week: number): NflGameEvent[] {
  return games
    .filter((g) => g.week === week)
    .map((g) => ({
      id: g.id,
      utc: g.kickoffUtc ?? g.date,
      home: g.homeTeamId,
      away: g.awayTeamId,
      homeScore: 24,
      awayScore: 17,
      state: "final",
      statusLabel: "Final",
      venue: null,
    }));
}

test("the week-so-far finals are the slate's own games, so Sunday and Monday night stay in their week", () => {
  // The live feed reporting every Week 4 and Week 5 game as final.
  const slate = weekGames(games, "2026-10-11");
  const finals = slateFinals([...finalEvents(4), ...finalEvents(5)], slate);
  const slateIds = new Set(slate.map((g) => g.id));
  assert.equal(finals.length, slate.length, "every Week 5 final, no more");
  assert.ok(finals.every((e) => slateIds.has(e.id)), "nothing from Week 4");

  // Sunday Night Football is Sunday in the East but 00:20Z Monday, and Monday
  // Night Football is 00:15Z Tuesday: a Monday-to-Sunday window over UTC
  // instants drops both from their own week.
  const sundayNight = slate
    .filter((g) => g.date.startsWith("2026-10-11"))
    .sort((a, b) => (a.kickoffUtc ?? "").localeCompare(b.kickoffUtc ?? ""))
    .at(-1);
  const mondayNight = slate.at(-1);
  assert.equal(sundayNight?.kickoffUtc?.slice(0, 10), "2026-10-12", "precondition: Sunday night's UTC instant is Monday");
  assert.equal(mondayNight?.kickoffUtc?.slice(0, 10), "2026-10-13", "precondition: Monday night's UTC instant is Tuesday");
  assert.ok(finals.some((e) => e.id === sundayNight?.id), "Sunday Night Football is in the week-so-far finals");
  assert.ok(finals.some((e) => e.id === mondayNight?.id), "Monday Night Football is in the week-so-far finals");

  // Last week's Sunday and Monday night games land inside that same UTC window
  // (Monday 2026-10-05 00:20Z onward); they are Week 4's and stay out.
  const lastWeekPrimetime = games.filter((g) => g.week === 4 && /^(Sun|Mon) · .* · 8:/.test(g.kickoffLabel));
  assert.ok(lastWeekPrimetime.length >= 2, "precondition: Week 4 had Sunday and Monday night games");
  for (const g of lastWeekPrimetime) assert.ok(!finals.some((e) => e.id === g.id), `${g.id} belongs to Week 4`);

  // Newest first.
  const order = finals.map((e) => e.utc);
  assert.deepEqual(order, [...order].sort().reverse());
});

test("the finals strip follows the slate: Monday night's day is still Week 5, the day after is Week 6", () => {
  const feed = [...finalEvents(4), ...finalEvents(5)];
  const monday = slateFinals(feed, weekGames(games, "2026-10-12"));
  assert.equal(monday.length, weekGames(games, "2026-10-12").length, "all of Week 5, Sunday's games included");
  // Tuesday's slate is Week 6, which has no finals yet: the strip hides rather than
  // presenting the last two games of Week 5 as "the week so far".
  assert.deepEqual(slateFinals(feed, weekGames(games, "2026-10-13")), []);
});

test("finals strip rows need a final state, both scores and a real kickoff instant", () => {
  const slate = ["a", "b", "c", "d", "e"].map((id) => game(id, "x", "y"));
  const event = (id: string, overrides: Partial<NflGameEvent> = {}): NflGameEvent => ({
    id,
    utc: EARLY,
    home: "Y",
    away: "X",
    homeScore: 20,
    awayScore: 10,
    state: "final",
    statusLabel: null,
    venue: null,
    ...overrides,
  });
  const feed = [
    event("a", { utc: EARLY }),
    event("b", { utc: LATE_WINDOW }),
    event("c", { state: "live" }),
    event("d", { homeScore: null }),
    event("e", { utc: "not a date" }),
    event("elsewhere"),
  ];
  const before = JSON.stringify(feed);
  assert.deepEqual(slateFinals(feed, slate).map((e) => e.id), ["b", "a"]);
  assert.equal(JSON.stringify(feed), before, "the feed is not mutated");
  assert.deepEqual(slateFinals(feed, []), []);
});
