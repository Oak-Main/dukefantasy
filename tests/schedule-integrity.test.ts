import assert from "node:assert/strict";
import test from "node:test";
import nfl from "../lib/nfl-generated.ts";
import { games, getTeamBySlug } from "../lib/cfb-dataset.ts";
import { easternDay } from "../lib/eastern.ts";
import { weekGames, type BroadcastGame } from "../lib/homepage.ts";
import { defaultScoreboardWeek, gamesForWeek, requestedScoreboardWeek } from "../lib/scoreboard.ts";
import { getTeamHubData } from "../lib/team-hub.ts";

interface ScheduleRow {
  id: string;
  date: string;
  week: number;
  kickoffUtc: string;
  timeTbd: boolean;
  kickoffLabel: string;
  awaySlug: string;
  homeSlug: string;
  status: "scheduled" | "in_progress" | "final";
  statusDetail: string;
  awayScore: number | null;
  homeScore: number | null;
  broadcast: string | null;
}

const schedule = nfl.schedule as unknown as ScheduleRow[];
const GAMES_PER_TEAM = 17;

/* Eastern wall clock from the statutory US DST rule (2nd Sunday of March
 * 02:00 -> 1st Sunday of November 02:00), deliberately NOT via Intl so this
 * check is independent of the build script's conversion. Valid for the
 * 2026-27 season; extend the two instants when the season rolls over. */
const DST_START_UTC = Date.UTC(2026, 2, 8, 7, 0);
const DST_END_UTC = Date.UTC(2026, 10, 1, 6, 0);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function easternWallClock(iso: string) {
  const ms = Date.parse(iso);
  const offsetHours = ms >= DST_START_UTC && ms < DST_END_UTC ? -4 : -5;
  const shifted = new Date(ms + offsetHours * 3_600_000); // read with UTC getters
  const hour24 = shifted.getUTCHours();
  return {
    weekday: WEEKDAYS[shifted.getUTCDay()],
    date: shifted.toISOString().slice(0, 10),
    time: `${hour24 % 12 || 12}:${String(shifted.getUTCMinutes()).padStart(2, "0")} ${hour24 >= 12 ? "PM" : "AM"}`,
  };
}

test("schedule is the complete regular season: 272 games, 17 per team, weeks 1-18", () => {
  assert.equal(nfl.teams.length, 32);
  assert.equal(schedule.length, (nfl.teams.length * GAMES_PER_TEAM) / 2, "full regular season");
  assert.equal(new Set(schedule.map((game) => game.id)).size, schedule.length, "unique event ids");

  const perTeam = new Map<string, number>();
  const teamWeek = new Set<string>();
  for (const game of schedule) {
    for (const slug of [game.awaySlug, game.homeSlug]) {
      perTeam.set(slug, (perTeam.get(slug) ?? 0) + 1);
      const key = `${slug}:${game.week}`;
      assert.ok(!teamWeek.has(key), `${slug} is booked twice in week ${game.week}`);
      teamWeek.add(key);
    }
  }
  for (const team of nfl.teams) {
    assert.equal(perTeam.get(team.slug), GAMES_PER_TEAM, `${team.slug} games`);
  }
  const weeks = new Set(schedule.map((game) => game.week));
  for (let week = 1; week <= 18; week += 1) assert.ok(weeks.has(week), `week ${week} missing`);
  assert.equal(nfl.season.weeks, 18);

  // The Wednesday kickoff and the whole of Week 18 were once silently dropped
  // by a hand-typed date window; pin them so that can never recur unnoticed.
  assert.ok(schedule.some((game) => game.week === 1 && game.homeSlug === "seattle-seahawks"), "Seahawks Week 1 opener present");
  assert.equal(schedule.filter((game) => game.week === 18).length, 16, "all of Week 18 present");
});

test("kickoff labels are Eastern (not UTC) and never invent a clock time for unflexed slots", () => {
  for (const game of schedule) {
    const et = easternWallClock(game.kickoffUtc);
    assert.equal(game.date, et.date, `${game.id}: date must be the ET calendar day`);
    if (game.timeTbd) {
      assert.equal(game.kickoffLabel, `${et.weekday} · ${et.date} · Time TBD (ET)`, game.id);
      assert.doesNotMatch(game.kickoffLabel, /\d{1,2}:\d{2} [AP]M/, `${game.id}: TBD slot leaks a clock time`);
    } else {
      assert.equal(game.kickoffLabel, `${et.weekday} · ${et.date} · ${et.time} ET`, game.id);
    }
  }
  // 24 slots (Weeks 16-18) are unflexed today; a TBD flag with no TBD games would mean the flag broke.
  assert.ok(schedule.some((game) => game.timeTbd), "expected unflexed (TBD) slots late in the season");
});

test("kickoff labels agree with ESPN's own human-readable kickoff text", () => {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  let compared = 0;
  for (const game of schedule) {
    if (game.timeTbd) continue;
    const espn = game.statusDetail.match(/^(\w{3}), (\w+) (\d+)(?:st|nd|rd|th) at (\d{1,2}):(\d{2}) (AM|PM) E[SD]T$/);
    if (!espn) continue; // finals carry "Final"; nothing independent to compare
    const label = game.kickoffLabel.match(/^(\w{3}) · \d{4}-(\d{2})-(\d{2}) · (\d{1,2}):(\d{2}) ([AP]M) ET$/);
    assert.ok(label, `${game.id}: ${game.kickoffLabel}`);
    const [, weekday, month, day, hour, minute, period] = label;
    compared += 1;
    assert.equal(weekday, espn[1], `${game.id} weekday`);
    assert.equal(months[Number(month) - 1], espn[2], `${game.id} month`);
    assert.equal(Number(day), Number(espn[3]), `${game.id} day`);
    assert.equal(`${Number(hour)}:${minute} ${period}`, `${Number(espn[4])}:${espn[5]} ${espn[6]}`, `${game.id} time`);
  }
  // If ESPN rewords its text the loop above compares nothing and passes; fail loudly instead.
  if (schedule.some((game) => !game.timeTbd && game.status !== "final")) {
    assert.ok(compared > 0, "no kickoff label could be compared with ESPN's own kickoff text");
  }
});

test("easternDay is the Eastern calendar day, not the UTC day", () => {
  // Sunday Night Football kicks off at 00:20Z Monday and is still Sunday in the East.
  assert.equal(easternDay("2026-10-12T00:20:00Z"), "2026-10-11");
  assert.equal(easternDay("2026-10-12T03:59:59Z"), "2026-10-11"); // last second of Sunday (EDT, UTC-4)
  assert.equal(easternDay("2026-10-12T04:00:00Z"), "2026-10-12");
  assert.equal(easternDay("2026-11-02T04:59:59Z"), "2026-11-01"); // last second of Sunday after daylight time ends (EST, UTC-5)
  assert.equal(easternDay("2026-11-02T05:00:00Z"), "2026-11-02");
  assert.equal(easternDay(Date.parse("2026-10-12T00:20:00Z")), "2026-10-11");
  assert.equal(easternDay(new Date("2026-10-12T00:20:00Z")), "2026-10-11");
  // The default is the clock's Eastern day.
  assert.match(easternDay(), /^\d{4}-\d{2}-\d{2}$/);
  // Every 20 minutes of the season, against the independent statutory-rule oracle above.
  for (let ms = Date.UTC(2026, 8, 1); ms < Date.UTC(2027, 1, 15); ms += 20 * 60_000) {
    const iso = new Date(ms).toISOString();
    assert.equal(easternDay(iso), easternWallClock(iso).date, iso);
  }
});

test("team hub 'today' is the Eastern day, so a primetime game is still upcoming at kickoff", (t) => {
  // 8:25 PM ET on Sunday 2026-10-11: five minutes into Sunday Night Football,
  // and the UTC calendar has already turned to Monday.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-12T00:25:00Z") });
  try {
    const ravens = getTeamBySlug("baltimore-ravens");
    assert.ok(ravens, "Baltimore Ravens are in the dataset");
    const hub = getTeamHubData(ravens);
    assert.equal(hub.referenceDate, "2026-10-11");
    const week5 = hub.schedule?.find((row) => row.week === 5);
    assert.equal(week5?.date, "2026-10-11", "precondition: the Ravens' Week 5 game is Sunday night, Eastern");
    // The predicate team-hub.tsx and schedule.tsx use for UP NEXT and for "Result not published".
    assert.ok(week5.date >= hub.referenceDate, "tonight's game must not read as already played");
    // An explicit reference day still wins.
    assert.equal(getTeamHubData(ravens, "2026-12-01").referenceDate, "2026-12-01");
  } finally {
    t.mock.timers.reset();
  }
});

test("scores are baked for finals only; live scores belong to the live overlay", () => {
  for (const game of schedule) {
    if (game.status === "final") {
      assert.ok(game.awayScore !== null && game.homeScore !== null, `${game.id}: final without a score`);
    } else {
      assert.equal(game.awayScore, null, `${game.id}: non-final carries an away score`);
      assert.equal(game.homeScore, null, `${game.id}: non-final carries a home score`);
    }
    if (game.status === "in_progress") {
      assert.doesNotMatch(game.statusDetail, /halftime|^q\d|quarter|ot\b/i, `${game.id}: in-progress detail must not freeze a game clock`);
    }
  }
});

test("standings are exactly what the final scores imply and match team records", () => {
  const expected = new Map<string, { wins: number; losses: number; ties: number; pf: number; pa: number }>();
  for (const team of nfl.teams) expected.set(team.slug, { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 });
  for (const game of schedule) {
    if (game.status !== "final" || game.awayScore === null || game.homeScore === null) continue;
    const away = expected.get(game.awaySlug);
    const home = expected.get(game.homeSlug);
    assert.ok(away && home, `${game.id}: unknown team`);
    away.pf += game.awayScore;
    away.pa += game.homeScore;
    home.pf += game.homeScore;
    home.pa += game.awayScore;
    if (game.awayScore > game.homeScore) {
      away.wins += 1;
      home.losses += 1;
    } else if (game.homeScore > game.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.ties += 1;
      home.ties += 1;
    }
  }
  const standings = nfl.standings as Record<string, { wins: number; losses: number; ties: number; pf: number; pa: number; record: string }>;
  for (const team of nfl.teams) {
    const want = expected.get(team.slug);
    const have = standings[team.slug];
    assert.ok(want && have, team.slug);
    assert.deepEqual({ wins: have.wins, losses: have.losses, ties: have.ties, pf: have.pf, pa: have.pa }, want, team.slug);
    const record = `${want.wins}-${want.losses}${want.ties ? `-${want.ties}` : ""}`;
    assert.equal(have.record, record, `${team.slug} standings record`);
    assert.equal(team.record, record, `${team.slug} team record`);
  }
});

test("snapshot is not stale against ESPN's current week", () => {
  const currentWeek = nfl.season.currentWeek as number | null;
  assert.ok(currentWeek !== null && Number.isInteger(currentWeek) && currentWeek >= 1 && currentWeek <= 18, `currentWeek=${currentWeek}`);
  // Every game from a completed week is final -- unless the league moved it.
  for (const game of schedule) {
    if (game.week >= currentWeek || game.status === "final") continue;
    assert.match(game.statusDetail, /postpone|cancel|delay|suspend/i, `${game.id}: week ${game.week} game is not final but ESPN is already on week ${currentWeek}`);
  }
});

test("networks use the canonical spellings the watch board orders by", () => {
  for (const game of schedule) {
    if (game.broadcast == null) continue;
    assert.ok(!["Fox", "fox", "Cbs", "Nbc", "Espn", "Abc"].includes(game.broadcast), `${game.id}: ${game.broadcast}`);
  }
  assert.ok(schedule.some((game) => game.broadcast === "FOX"), "FOX games present");
});

test("landing week follows the NFL week, not the college Saturday", () => {
  // Sunday of Week 5, Monday-night day, and the Tuesday after (next week's slate).
  assert.equal(defaultScoreboardWeek(games, "2026-10-11"), 5);
  assert.equal(defaultScoreboardWeek(games, "2026-10-12"), 5);
  assert.equal(defaultScoreboardWeek(games, "2026-10-13"), 6);
  // Before the season: Week 1. After the last game: the final week.
  assert.equal(defaultScoreboardWeek(games, "2026-09-01"), 1);
  assert.equal(defaultScoreboardWeek(games, "2027-03-01"), 18);
  // Regression: the old "next Saturday" rule sent a mid-October visit to a December week.
  assert.ok(defaultScoreboardWeek(games, "2026-10-11") < 8);
});

test("games list chronologically within a day (a 1:00 PM kickoff never trails a 4:05 PM one)", () => {
  for (const week of [5, 6, 12]) {
    const ordered = gamesForWeek(games, week);
    assert.ok(ordered.length > 0, `week ${week} has games`);
    for (let i = 1; i < ordered.length; i += 1) {
      const [prev, next] = [ordered[i - 1], ordered[i]];
      assert.ok(
        `${prev.date.slice(0, 10)}|${prev.kickoffUtc}` <= `${next.date.slice(0, 10)}|${next.kickoffUtc}`,
        `week ${week}: ${prev.id} (${prev.kickoffLabel}) listed before ${next.id} (${next.kickoffLabel})`,
      );
    }
  }
  const slate = weekGames(games as unknown as BroadcastGame[], "2026-10-11");
  const sunday = slate.filter((game) => game.date.startsWith("2026-10-11")).map((game) => game.kickoffLabel.match(/\d{1,2}:\d{2} [AP]M/)?.[0]);
  assert.equal(sunday[0], "9:30 AM", "international early window opens the Sunday slate");
  assert.equal(sunday.at(-1), "8:20 PM", "Sunday night closes it");
});

test("homepage slate is the whole NFL week (Thursday through Monday), not a Mon-Sun window", () => {
  const slate = weekGames(games as unknown as BroadcastGame[], "2026-10-11");
  const weeks = new Set(slate.map((game) => game.week));
  assert.deepEqual([...weeks], [5]);
  assert.equal(slate.length, schedule.filter((game) => game.week === 5).length, "all Week 5 games, none from Week 4");
  const dates = slate.map((game) => game.date.slice(0, 10)).sort();
  assert.equal(dates[0], "2026-10-08", "Thursday night opens the week");
  assert.equal(dates.at(-1), "2026-10-12", "Monday night closes the week");
  assert.deepEqual(weekGames(games as unknown as BroadcastGame[], "not-a-date"), []);
});

test("score queries accept stored archives and future planning weeks with unchanged provenance", () => {
  assert.equal(requestedScoreboardWeek(games, "2026-10-28", "7"), 7);
  assert.equal(requestedScoreboardWeek(games, "2026-10-28", "9"), 9);
  assert.equal(requestedScoreboardWeek(games, "2026-10-28", "18"), 18);
  for (const value of [undefined, "", "0", "19", "7.0", "7x", "-7", ["7", "8"]]) assert.equal(requestedScoreboardWeek(games, "2026-10-28", value), 8);
});
