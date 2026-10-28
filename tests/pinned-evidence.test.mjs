import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const evidence = JSON.parse(readFileSync(new URL("../data/content-refresh/2026-10-28/espn-verification.json", import.meta.url), "utf8"));
for (const [name, change] of [
  ["changed observed score", data => { data.responses[0].document.events[0].competitions[0].competitors[0].score = "999"; }],
  ["missing week", data => { data.responses.pop(); }],
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
