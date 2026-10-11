import assert from "node:assert/strict";
import test from "node:test";
import { games, getTeamSchedule, teams } from "../lib/cfb-dataset.ts";
import {
  EMPTY_LIVE_STATE,
  LIVE_STALE_MS,
  applyLivePatch,
  applyLiveToScheduleGame,
  describeLiveTransitions,
  expireStaleLive,
  formatGameResult,
  liveTransitions,
  patchFromEvent,
  patchGames,
  patchScheduleGames,
  reduceLiveScoreboard,
  type LiveGamePatch,
  type LivePatchMap,
  type LiveScoreboardState,
} from "../lib/live-scoreboard.ts";
import type { NflGameEvent } from "../lib/nfl-scoreboard.ts";

const NOW = 1_800_000_000_000;

function event(overrides: Partial<NflGameEvent> = {}): NflGameEvent {
  return {
    id: "401000001",
    utc: "2026-10-11T17:00Z",
    home: "Washington",
    away: "Indianapolis",
    homeScore: null,
    awayScore: null,
    state: "scheduled",
    statusLabel: null,
    venue: null,
    ...overrides,
  };
}

function liveEvent(overrides: Partial<NflGameEvent> = {}): NflGameEvent {
  return event({ state: "live", awayScore: 17, homeScore: 20, statusLabel: "Q3 5:42", ...overrides });
}

function finalEvent(overrides: Partial<NflGameEvent> = {}): NflGameEvent {
  return event({ state: "final", awayScore: 24, homeScore: 17, statusLabel: "Final", ...overrides });
}

function payload(events: NflGameEvent[], extra: Record<string, unknown> = {}) {
  return { events, asOf: "2026-10-11T17:05:00.000Z", source: "espn", degraded: false, ...extra };
}

function stateWith(patches: Record<string, LiveGamePatch>, asOf: number | null = NOW): LiveScoreboardState {
  return { patches: new Map(Object.entries(patches)), events: [], asOf };
}

const patch = (overrides: Partial<LiveGamePatch> = {}): LiveGamePatch => ({
  state: "live",
  awayScore: 17,
  homeScore: 20,
  statusLabel: "Q3 5:42",
  seenAt: NOW,
  ...overrides,
});

/* ------------------------------------------------------------- event → patch */

test("patchFromEvent: in-progress, halftime and final events patch; nothing else does", () => {
  assert.deepEqual(patchFromEvent(liveEvent(), NOW), patch());
  assert.equal(patchFromEvent(liveEvent({ state: "halftime", statusLabel: "Halftime" }), NOW)?.state, "live");
  assert.equal(patchFromEvent(liveEvent({ state: "halftime", statusLabel: "Halftime" }), NOW)?.statusLabel, "Halftime");
  assert.deepEqual(patchFromEvent(finalEvent(), NOW), patch({ state: "final", awayScore: 24, homeScore: 17, statusLabel: "Final" }));
  for (const state of ["scheduled", "postponed", "canceled", "other"] as const) {
    assert.equal(patchFromEvent(event({ state, awayScore: 0, homeScore: 0 }), NOW), null, state);
  }
});

test("patchFromEvent: scores come as a pair of real integers or the baked row stands", () => {
  assert.equal(patchFromEvent(liveEvent({ awayScore: null }), NOW), null);
  assert.equal(patchFromEvent(liveEvent({ homeScore: null }), NOW), null);
  assert.equal(patchFromEvent(finalEvent({ homeScore: -3 }), NOW), null);
  assert.equal(patchFromEvent(finalEvent({ awayScore: Number.NaN }), NOW), null);
  assert.equal(patchFromEvent(finalEvent({ awayScore: 2.5 }), NOW), null);
  // 0–0 at kickoff is a real score, not a missing one.
  assert.deepEqual(patchFromEvent(liveEvent({ awayScore: 0, homeScore: 0 }), NOW)?.awayScore, 0);
  // An empty label is "no label", never an empty pill.
  assert.equal(patchFromEvent(liveEvent({ statusLabel: "" }), NOW)?.statusLabel, null);
});

/* ------------------------------------------------------------------ reducer */

test("reduceLiveScoreboard: a good payload yields an id-keyed patch map", () => {
  const next = reduceLiveScoreboard(
    EMPTY_LIVE_STATE,
    payload([liveEvent({ id: "A" }), finalEvent({ id: "B" }), event({ id: "C" })]),
    NOW,
  );
  assert.deepEqual([...next.patches.keys()].sort(), ["A", "B"]);
  assert.equal(next.patches.get("A")?.state, "live");
  assert.equal(next.patches.get("B")?.state, "final");
  assert.equal(next.asOf, NOW);
  assert.equal(next.events.length, 3);
});

test("reduceLiveScoreboard: degraded, failed, or malformed polls are no information", () => {
  const prev = stateWith({ A: patch({ seenAt: NOW - 1_000 }) });
  const bad: unknown[] = [
    null,
    undefined,
    "<html>502</html>",
    42,
    {},
    { events: "nope", degraded: false },
    payload([], { degraded: true, source: "none" }),
    payload([liveEvent({ id: "Z" })], { degraded: true }),
    payload([]),
    payload([{ ...event(), id: "" }, { ...event(), id: 7 as unknown as string }]),
  ];
  for (const body of bad) {
    // Same object back: nothing changed, so nothing re-renders and nothing is surfaced.
    assert.equal(reduceLiveScoreboard(prev, body, NOW), prev, JSON.stringify(body));
  }
});

test("reduceLiveScoreboard: matches by ESPN event id only, never by team name or time", () => {
  const baked = {
    id: "401000001",
    status: "scheduled" as const,
    statusDetail: "Sun, October 11th at 1:00 PM EDT",
    awayScore: undefined,
    homeScore: undefined,
  };
  // Same teams and same kickoff, different event id: must not touch the baked game.
  const lookalike = liveEvent({ id: "401999999", away: "Indianapolis", home: "Washington", utc: "2026-10-11T17:00Z" });
  const state = reduceLiveScoreboard(EMPTY_LIVE_STATE, payload([lookalike]), NOW);
  assert.equal(patchGames([baked], state.patches)[0], baked);
  // Same id is the only thing that matches, whatever the labels say.
  const sameId = liveEvent({ id: "401000001", away: "???", home: "!!!", utc: "1999-01-01T00:00Z" });
  const matched = reduceLiveScoreboard(EMPTY_LIVE_STATE, payload([sameId]), NOW);
  assert.equal(patchGames([baked], matched.patches)[0].status, "live");
});

test("reduceLiveScoreboard: ids the payload does not mention keep their patch", () => {
  // The route drops a failed scoreboard day without marking the payload degraded.
  const prev = stateWith({
    LIVE: patch({ seenAt: NOW - 60_000 }),
    DONE: patch({ state: "final", seenAt: NOW - 3 * LIVE_STALE_MS }),
  });
  const next = reduceLiveScoreboard(prev, payload([liveEvent({ id: "OTHER" })]), NOW);
  assert.deepEqual([...next.patches.keys()].sort(), ["DONE", "LIVE", "OTHER"]);
  assert.equal(next.patches.get("LIVE"), prev.patches.get("LIVE"));
});

test("reduceLiveScoreboard: an explicit scheduled verdict clears an earlier patch; unusable scores do not", () => {
  const prev = stateWith({ A: patch(), B: patch() });
  const next = reduceLiveScoreboard(
    prev,
    payload([event({ id: "A", state: "scheduled" }), liveEvent({ id: "B", awayScore: null })]),
    NOW,
  );
  assert.equal(next.patches.has("A"), false, "provider says it is not in progress");
  assert.equal(next.patches.get("B"), prev.patches.get("B"), "provider sent garbage; keep the last good patch");
});

test("reduceLiveScoreboard: a newer state replaces an older one", () => {
  const prev = stateWith({ A: patch() });
  const next = reduceLiveScoreboard(prev, payload([finalEvent({ id: "A" })]), NOW + 60_000);
  assert.equal(next.patches.get("A")?.state, "final");
  assert.equal(next.patches.get("A")?.seenAt, NOW + 60_000);
});

test("stale in-progress patches expire; finals never do", () => {
  const prev = stateWith({
    FRESH: patch({ seenAt: NOW - LIVE_STALE_MS }),
    STALE: patch({ seenAt: NOW - LIVE_STALE_MS - 1 }),
    FINAL: patch({ state: "final", seenAt: NOW - 10 * LIVE_STALE_MS }),
  });
  const after = expireStaleLive(prev, NOW);
  assert.deepEqual([...after.patches.keys()].sort(), ["FINAL", "FRESH"]);
  // Nothing to expire: identical object, so subscribers are not notified.
  assert.equal(expireStaleLive(after, NOW), after);
  // A failed poll applies the same rule.
  assert.deepEqual([...reduceLiveScoreboard(prev, null, NOW).patches.keys()].sort(), ["FINAL", "FRESH"]);
  // Stale ids are not carried over by a good poll that skips them either.
  const good = reduceLiveScoreboard(prev, payload([liveEvent({ id: "NEW" })]), NOW);
  assert.deepEqual([...good.patches.keys()].sort(), ["FINAL", "FRESH", "NEW"]);
});

/* ------------------------------------------------------------------ merging */

const bakedGame = {
  id: "401000001",
  week: 5,
  date: "2026-10-11T17:00:00.000Z",
  kickoffLabel: "Sun · 2026-10-11 · 1:00 PM ET",
  status: "scheduled" as const,
  statusDetail: "Sun, October 11th at 1:00 PM EDT",
  awayTeamId: "indianapolis-colts",
  homeTeamId: "washington-commanders",
  awayScore: undefined as number | undefined,
  homeScore: undefined as number | undefined,
  broadcast: "CBS",
};

test("applyLivePatch: status, detail and both scores come from the patch; everything else is kept", () => {
  const live = applyLivePatch(bakedGame, patch());
  assert.deepEqual(live, {
    ...bakedGame,
    status: "live",
    statusDetail: "Q3 5:42",
    awayScore: 17,
    homeScore: 20,
  });
  assert.equal(bakedGame.status, "scheduled", "input is not mutated");
  assert.equal(bakedGame.awayScore, undefined);
  const done = applyLivePatch(bakedGame, patch({ state: "final", awayScore: 24, homeScore: 17, statusLabel: "Final/OT" }));
  assert.equal(done.status, "final");
  assert.equal(done.statusDetail, "Final/OT");
});

test("applyLivePatch: a missing provider label never falls back to the baked kickoff text", () => {
  assert.equal(applyLivePatch(bakedGame, patch({ statusLabel: null })).statusDetail, "Live");
  assert.equal(applyLivePatch(bakedGame, patch({ state: "final", statusLabel: null })).statusDetail, "Final");
});

test("applyLivePatch: a live patch replaces the baked 0–0 placeholder scores", () => {
  const placeholder = { ...bakedGame, awayScore: 0, homeScore: 0 };
  const live = applyLivePatch(placeholder, patch({ awayScore: 3, homeScore: 0 }));
  assert.equal(live.awayScore, 3);
  assert.equal(live.homeScore, 0);
});

test("patchGames: unpatched games keep their identity and an empty map is a no-op", () => {
  const other = { ...bakedGame, id: "401000002" };
  const list = [bakedGame, other];
  assert.equal(patchGames(list, new Map()), list);
  const out = patchGames(list, new Map([["401000001", patch()]]));
  assert.notEqual(out, list);
  assert.notEqual(out[0], bakedGame);
  assert.equal(out[1], other);
  assert.equal(list[0], bakedGame, "source list untouched");
});

test("patchGames against the real dataset: only the game with the matching id moves", () => {
  const target = games.find((game) => game.status !== "final");
  assert.ok(target, "dataset has an unplayed game");
  const state = reduceLiveScoreboard(
    EMPTY_LIVE_STATE,
    payload([liveEvent({ id: target.id, awayScore: 10, homeScore: 7, statusLabel: "Q2 1:03" })]),
    NOW,
  );
  const patched = patchGames(games, state.patches);
  assert.equal(patched.length, games.length);
  const changed = patched.filter((game, index) => game !== games[index]);
  assert.deepEqual(changed.map((game) => game.id), [target.id]);
  assert.equal(changed[0].status, "live");
  assert.equal(changed[0].awayScore, 10);
  assert.equal(changed[0].homeScore, 7);
  assert.equal(changed[0].statusDetail, "Q2 1:03");
  assert.equal(changed[0].homeTeamId, target.homeTeamId);
});

/* ------------------------------------------------------ team schedule rows */

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "indianapolis-colts-2026-10-11-4",
  eventId: "401000001" as string | null,
  homeAway: "away" as string | null,
  result: null as string | null,
  opponent: "Washington Commanders",
  kickoffLabel: "1:00 PM ET",
  ...overrides,
});

test("formatGameResult: the team's score first, W/L/T, en dash", () => {
  assert.equal(formatGameResult(24, 17), "W 24–17");
  assert.equal(formatGameResult(17, 24), "L 17–24");
  assert.equal(formatGameResult(20, 20), "T 20–20");
});

test("applyLiveToScheduleGame: finals become a result from the team's side", () => {
  const final = patch({ state: "final", awayScore: 24, homeScore: 17 });
  assert.equal(applyLiveToScheduleGame(row({ homeAway: "away" }), final).result, "W 24–17");
  assert.equal(applyLiveToScheduleGame(row({ homeAway: "home" }), final).result, "L 17–24");
  const tie = patch({ state: "final", awayScore: 20, homeScore: 20 });
  assert.equal(applyLiveToScheduleGame(row({ homeAway: "home" }), tie).result, "T 20–20");
});

test("applyLiveToScheduleGame: an in-progress game shows a score, not a result", () => {
  const away = applyLiveToScheduleGame(row({ homeAway: "away", result: "T 0–0" }), patch());
  assert.equal(away.result, null, "a stale placeholder result must not read as FINAL");
  assert.deepEqual(away.live, { statusLabel: "Q3 5:42", ownScore: 17, opponentScore: 20 });
  const home = applyLiveToScheduleGame(row({ homeAway: "home" }), patch());
  assert.deepEqual(home.live, { statusLabel: "Q3 5:42", ownScore: 20, opponentScore: 17 });
});

test("applyLiveToScheduleGame: rows it cannot orient or identify are left alone", () => {
  const input = row({ homeAway: "neutral" });
  assert.equal(applyLiveToScheduleGame(input, patch()), input);
  const noSide = row({ homeAway: null });
  assert.equal(applyLiveToScheduleGame(noSide, patch()), noSide);
  const noId = row({ eventId: null });
  assert.equal(applyLiveToScheduleGame(noId, patch()), noId);
  const noPatch = row();
  assert.equal(applyLiveToScheduleGame(noPatch, undefined), noPatch);
});

test("patchScheduleGames: looks rows up by event id, not by row id", () => {
  const a = row({ id: "same-row-id", eventId: "E1" });
  const b = row({ id: "same-row-id", eventId: "E2" });
  const out = patchScheduleGames([a, b], new Map([["E2", patch()]]));
  assert.equal(out[0], a);
  assert.ok(out[1].live);
  // A patch keyed by a row id (the old synthetic key) matches nothing.
  assert.equal(patchScheduleGames([a], new Map([["same-row-id", patch()]]))[0].live, undefined);
  const empty = [a, b];
  assert.equal(patchScheduleGames(empty, new Map()), empty);
});

test("dataset: every team-schedule row carries its game's ESPN event id", () => {
  const ids = new Set(games.map((game) => game.id));
  const perGame = new Map<string, number>();
  for (const team of teams) {
    const rows = getTeamSchedule(team.slug);
    const eventIds = rows.map((r) => r.eventId);
    assert.equal(new Set(eventIds).size, rows.length, `${team.slug}: duplicate event ids`);
    for (const r of rows) {
      assert.ok(r.eventId && ids.has(r.eventId), `${team.slug}: ${r.eventId} is not a dataset game`);
      assert.equal(r.href, `/games/${r.eventId}`, "href and eventId must agree");
      perGame.set(r.eventId, (perGame.get(r.eventId) ?? 0) + 1);
    }
  }
  for (const game of games) assert.equal(perGame.get(game.id), 2, `${game.id}: one row per team`);
});

test("dataset: a final patch reproduces every baked result exactly, from both sides", () => {
  const finals = games.filter((game) => game.status === "final");
  assert.ok(finals.length > 0, "dataset has finals");
  for (const game of finals) {
    const live = patch({
      state: "final",
      awayScore: game.awayScore as number,
      homeScore: game.homeScore as number,
      statusLabel: "Final",
    });
    for (const slug of [game.awayTeamId, game.homeTeamId]) {
      const baked = getTeamSchedule(slug).find((r) => r.eventId === game.id);
      assert.ok(baked?.result, `${game.id}/${slug}: baked result`);
      const overlaid = applyLiveToScheduleGame({ ...baked, result: null }, live);
      assert.equal(overlaid.result, baked.result, `${game.id}/${slug}`);
    }
  }
});

/* ------------------------------------------------------------ announcements */

const watched = [
  { id: "A", status: "scheduled", away: "Indianapolis", home: "Washington" },
  { id: "B", status: "final", away: "Dallas", home: "Giants" },
  { id: "C", status: "scheduled", away: "Miami", home: "Buffalo" },
];
const maps = (entries: Record<string, LiveGamePatch>): LivePatchMap => new Map(Object.entries(entries));

test("liveTransitions: kickoff and final are news; score changes and re-confirmed finals are not", () => {
  const kickoff = liveTransitions(watched, maps({}), maps({ A: patch() }));
  assert.deepEqual(kickoff.map((t) => [t.game.id, t.patch.state]), [["A", "live"]]);

  const finish = liveTransitions(watched, maps({ A: patch() }), maps({ A: patch({ state: "final" }) }));
  assert.deepEqual(finish.map((t) => [t.game.id, t.patch.state]), [["A", "final"]]);

  const missedLive = liveTransitions(watched, maps({}), maps({ C: patch({ state: "final" }) }));
  assert.deepEqual(missedLive.map((t) => t.game.id), ["C"]);

  const scoreOnly = liveTransitions(watched, maps({ A: patch() }), maps({ A: patch({ awayScore: 24 }) }));
  assert.deepEqual(scoreOnly, []);

  // B is already final in the baked data; the live feed agreeing is not news.
  const reconfirmed = liveTransitions(watched, maps({}), maps({ B: patch({ state: "final" }) }));
  assert.deepEqual(reconfirmed, []);
});

test("liveTransitions: only games on the page are considered, and a vanished patch is silent", () => {
  assert.deepEqual(liveTransitions(watched, maps({}), maps({ ELSEWHERE: patch() })), []);
  assert.deepEqual(liveTransitions(watched, maps({ A: patch() }), maps({})), []);
});

test("describeLiveTransitions: short sentences, no scores for kickoffs, a count for a crowd", () => {
  assert.equal(describeLiveTransitions([]), "");
  assert.equal(
    describeLiveTransitions([{ to: "live", away: "Indianapolis", home: "Washington", awayScore: 0, homeScore: 0 }]),
    "Indianapolis at Washington is now live.",
  );
  assert.equal(
    describeLiveTransitions([{ to: "final", away: "Indianapolis", home: "Washington", awayScore: 24, homeScore: 17 }]),
    "Final: Indianapolis 24, Washington 17.",
  );
  const crowd = (to: "live" | "final") => ({ to, away: "A", home: "B", awayScore: 1, homeScore: 2 });
  assert.equal(
    describeLiveTransitions([crowd("live"), crowd("final")]),
    "A at B is now live. Final: A 1, B 2.",
  );
  assert.equal(describeLiveTransitions([crowd("live"), crowd("live"), crowd("live"), crowd("final")]), "4 games updated: 3 now live, 1 final.");
  assert.equal(describeLiveTransitions([crowd("final"), crowd("final"), crowd("final"), crowd("final")]), "4 games updated: 4 final.");
});
