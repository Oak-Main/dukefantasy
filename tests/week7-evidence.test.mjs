import assert from "node:assert/strict";
import test from "node:test";
import { validateEvidence } from "../scripts/week7-evidence.mjs";
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
