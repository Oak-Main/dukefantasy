import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const manifest = JSON.parse(readFileSync(new URL("../data/content-refresh/current.json", import.meta.url), "utf8"));
const evidencePath = manifest.snapshot.replace(/snapshot\.json$/, "espn-verification.json");
const evidence = JSON.parse(readFileSync(new URL(`../data/content-refresh/${evidencePath}`, import.meta.url), "utf8"));
for (const [name, change] of [
  ["changed observed score", data => { data.responses[0].document.events[0].competitions[0].competitors[0].score = "999"; }],
  ["missing week", data => { data.responses.pop(); }],
  ["impossible source calendar date", data => { data.responses[0].checkedAt = "2026-02-30T12:00:00Z"; }],
  ["source timestamp without timezone", data => { data.responses[0].checkedAt = "2026-10-28T20:00:00"; }],
  ["source timestamp containing only a date", data => { data.responses[0].checkedAt = "2026-10-28"; }],
  ["wrong cutoff", data => { data.cutoffUtc = "2026-10-20T00:00:00Z"; }],
]) test(`pinned verification rejects ${name} without fetching a replacement`, () => {
  const dir = mkdtempSync(join(tmpdir(), "duke-pinned-"));
  try {
    const data = structuredClone(evidence); change(data);
    const file = join(dir, "proof.json"); writeFileSync(file, JSON.stringify(data));
    const result = spawnSync(process.execPath, ["scripts/verify-nfl-dataset.mjs", "--evidence", file], { encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Pinned evidence|pinned ESPN response/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// #91: a game that went final after the snapshot was compiled is BEHIND (exit 2),
// not a disagreement (exit 1), even though ESPN now has its score and the two
// teams' official standings no longer match the baked rows.
test("a game that went final after compile reads BEHIND, not a disagreement", async () => {
  const { createHash } = await import("node:crypto");
  const source = readFileSync(new URL("../lib/nfl-generated.ts", import.meta.url), "utf8");
  const snapshot = JSON.parse(source.slice(source.indexOf("export default ") + "export default ".length).replace(/;\s*$/, ""));
  const notFinal = new Set(snapshot.schedule.filter((g) => g.status !== "final").map((g) => g.id));
  const data = structuredClone(evidence);
  let event = null;
  for (const row of data.responses) {
    event = (row.document.events ?? []).find((ev) => notFinal.has(ev.id) && ev.status?.type?.state === "pre");
    if (event) {
      event.status.type.state = "post";
      event.status.type.completed = true;
      const [a, b] = event.competitions[0].competitors;
      a.score = "24"; b.score = "17";
      row.documentSha256 = createHash("sha256").update(JSON.stringify(row.document)).digest("hex");
      break;
    }
  }
  assert.ok(event, "the pinned evidence holds a game that is not final in the snapshot");
  const [a, b] = event.competitions[0].competitors;
  const standings = data.responses.find((row) => row.url.includes("/standings"));
  const collect = (node) => (node.standings?.entries ?? []).concat((node.children ?? []).flatMap(collect));
  const bump = (name, stat, by) => {
    for (const entry of collect(standings.document)) {
      if (entry.team.displayName !== name) continue;
      const s = entry.stats.find((x) => x.name === stat);
      if (s) s.value += by;
    }
  };
  bump(a.team.displayName, "wins", 1); bump(a.team.displayName, "pointsFor", 24); bump(a.team.displayName, "pointsAgainst", 17);
  bump(b.team.displayName, "losses", 1); bump(b.team.displayName, "pointsFor", 17); bump(b.team.displayName, "pointsAgainst", 24);
  standings.documentSha256 = createHash("sha256").update(JSON.stringify(standings.document)).digest("hex");
  const dir = mkdtempSync(join(tmpdir(), "duke-behind-"));
  try {
    const file = join(dir, "proof.json"); writeFileSync(file, JSON.stringify(data));
    const result = spawnSync(process.execPath, ["scripts/verify-nfl-dataset.mjs", "--evidence", file], { encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stdout, /BEHIND: 1 game\(s\) went final after this snapshot was compiled \(2 standing row\(s\) differ\)/);
    assert.doesNotMatch(result.stdout, /final score differs/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
