import assert from "node:assert/strict";
import test from "node:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { materializeVerifiedSnapshot } from "../scripts/verified-snapshot.mjs";

const manifest = JSON.parse(readFileSync(new URL("../data/content-refresh/current.json", import.meta.url), "utf8"));
function withCandidate(change) {
  const root = mkdtempSync(join(tmpdir(), "duke-week8-negative-"));
  try {
    for (const path of ["data/content-refresh/current.json", `data/content-refresh/${manifest.snapshot}`, "data/content-refresh/current-editorial.json", "data/injury-research/current.json", "data/fantasy-desk/current.json"]) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      copyFileSync(new URL(`../${path}`, import.meta.url), join(root, path));
    }
    mkdirSync(join(root, "lib"));
    writeFileSync(join(root, "lib/nfl-generated.ts"), "previous-good-output");
    const edit = (path, mutate) => { const value = JSON.parse(readFileSync(join(root, path), "utf8")); mutate(value); writeFileSync(join(root, path), JSON.stringify(value)); };
    change(edit);
    assert.throws(() => materializeVerifiedSnapshot(root));
    assert.equal(readFileSync(join(root, "lib/nfl-generated.ts"), "utf8"), "previous-good-output");
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test("Week 8 materializer fails atomically for missing source or wrong report week", () => {
  withCandidate(edit => edit("data/injury-research/current.json", doc => { doc.watch[0].sources = []; }));
  withCandidate(edit => edit("data/injury-research/current.json", doc => { doc.week = 7; }));
});
test("an ACTIVE guess or impossible designation date cannot publish", () => {
  for (const patch of [{ published_status: "ACTIVE" }, { designation_date: "2026-02-30" }, { designation_week: 7 }]) {
    withCandidate(edit => edit("data/injury-research/current.json", doc => Object.assign(doc.watch[0], patch)));
  }
});
test("last week's fantasy board cannot become a current Week 8 edition", () => {
  withCandidate(edit => edit("data/fantasy-desk/current.json", doc => { doc.start_sit = { as_of: "2026-10-20", week: 7, positions: [], tough_calls: [] }; }));
});
test("partial or duplicate schedule inputs preserve the prior generated output", () => {
  withCandidate(edit => edit(`data/content-refresh/${manifest.snapshot}`, doc => { doc.schedule.pop(); }));
  withCandidate(edit => edit(`data/content-refresh/${manifest.snapshot}`, doc => { doc.schedule[1] = doc.schedule[0]; }));
});
test("incomplete or misidentified inactive lists cannot publish", () => {
  for (const patch of [{ complete: false }, { week: 8 }, { sources: [] }, { publishedAt: "2026-10-23T00:16:00Z", checkedAt: "2026-10-23T00:16:01Z" }]) {
    withCandidate(edit => edit("data/content-refresh/current-editorial.json", doc => Object.assign(doc.inactives[0], patch)));
  }
});
