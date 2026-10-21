import assert from "node:assert/strict";
import test from "node:test";
import { collectFacts, validateEvidence } from "../scripts/week7-evidence.mjs";
const now = new Date("2026-10-22T18:00:00Z");
const value = { week: 7, status: "final", awayScore: 20, homeScore: 17 };
const after = new Map([["result:game", { kind: "result", key: "game", value }]]);
const proof = () => ({ week: 7, baseCommit: "a".repeat(40), observations: [{ kind: "result", key: "game", value, sources: ["https://www.nfl.com/game", "https://www.espn.com/game"].map(url => ({url, checkedAt: now.toISOString(), reportedWeek: 7, value})) }] });
test("a changed result requires two matching, fresh source observations", () => { assert.equal(validateEvidence(proof(), new Map(), after, now).changedFacts, 1); });
test("a missing or single-source changed result cannot pass", () => { const p=proof(); p.observations[0].sources.pop(); assert.throws(() => validateEvidence(p,new Map(),after,now),/two publisher/); });
test("two ESPN subdomains are one publisher", () => { const p=proof(); p.observations[0].sources[0].url="https://site.api.espn.com/game"; assert.throws(() => validateEvidence(p,new Map(),after,now),/two publisher/); });
test("disagreement, stale evidence and prior-week reports block publication", () => {
  const p=proof(); p.observations[0].sources[0].value={...value,homeScore:14}; assert.throws(() => validateEvidence(p,new Map(),after,now),/disagree/);
  const q=proof(); q.observations[0].sources[0].checkedAt="2026-10-21T00:00:00Z"; assert.throws(() => validateEvidence(q,new Map(),after,now),/stale/);
  const r=proof(); r.observations[0].sources[0].reportedWeek=6; assert.throws(() => validateEvidence(r,new Map(),after,now),/wrong report week/);
});
test("unchanged data cannot create a pretend update", () => { assert.throws(() => validateEvidence(proof(),after,after,now),/NOOP/); });

test("official injury designation and report date require matching observations", () => {
  const bundle = watch => ({ snapshot: { schedule: [] }, injury: { ledger: [], watch }, editorial: {} });
  const row = { player: "Test player", team_slug: "test-team", practice: {} };
  const before = collectFacts(bundle([row]));
  const candidate = collectFacts(bundle([{ ...row, published_status: "OUT", designation_date: "2026-10-22", designation_week: 7 }]));
  const fact = [...candidate.values()][0];
  const p = proof(); p.observations[0] = { ...fact, sources: p.observations[0].sources.map(source => ({ ...source, value: fact.value })) };
  assert.equal(validateEvidence(p, before, candidate, now).changedFacts, 1);
  p.observations[0].sources[1].value = { ...fact.value, designation_date: "2026-10-21" };
  assert.throws(() => validateEvidence(p, before, candidate, now), /disagree/);
});

test("inactive list disagreement, including emergency quarterback designation, blocks publication", () => {
  const value = { gameId: "test-game", week: 7, teamSlug: "test-team", complete: true, players: [{ name: "Test quarterback", designation: "emergency_qb" }] };
  const candidate = new Map([["inactive:test-game:test-team", { kind: "inactive", key: "test-game:test-team", value }]]);
  const p = proof(); p.observations[0] = { kind: "inactive", key: "test-game:test-team", value, sources: p.observations[0].sources.map(source => ({ ...source, value })) };
  assert.equal(validateEvidence(p, new Map(), candidate, now).changedFacts, 1);
  p.observations[0].sources[1].value = { ...value, players: [{ name: "Test quarterback", designation: "inactive" }] };
  assert.throws(() => validateEvidence(p, new Map(), candidate, now), /disagree/);
});

test("an omitted injury record cannot be treated as a sourced activation", () => {
  const p = proof(); p.observations[0].value = null;
  p.observations[0].sources = p.observations[0].sources.map(source => ({ ...source, value: null }));
  assert.throws(() => validateEvidence(p, after, new Map(), now), /removal needs/);
});

test("a reserve record verification date must agree across both recorded observations", () => {
  const candidate=collectFacts({snapshot:{schedule:[]},injury:{ledger:[],watch:[]},editorial:{reserveStatuses:[{player:'Test reserve player',team_slug:'test-team',status:'SUSPENSION',asOf:'2026-10-22'}]}});
  const fact=[...candidate.values()][0],p=proof();
  p.observations=[{...fact,sources:p.observations[0].sources.map(source=>({...source,value:fact.value}))}];
  assert.equal(validateEvidence(p,new Map(),candidate,now).changedFacts,1);
  p.observations[0].sources[1].value={...fact.value,asOf:'2026-10-21'};
  assert.throws(()=>validateEvidence(p,new Map(),candidate,now),/disagree/);
});
