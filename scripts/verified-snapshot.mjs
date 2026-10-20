import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** A release build must reproduce reviewed data, never silently replace it with
 * a single-provider pull or give old editorial inputs a new source timestamp. */
export function materializeVerifiedSnapshot(root) {
  const read = (file) => JSON.parse(readFileSync(join(root, file), "utf8"));
  const manifest = read("data/content-refresh/current.json");
  if (!/^\d{4}-\d{2}-\d{2}\/snapshot\.json$/.test(manifest.snapshot)) throw new Error("Invalid snapshot path");
  const snapshot = read(`data/content-refresh/${manifest.snapshot}`);
  const injuryResearch = read("data/injury-research/current.json");
  const fantasyDesk = read("data/fantasy-desk/current.json");
  const editorial = read("data/content-refresh/current-editorial.json");
  if (snapshot.teams.length !== 32 || snapshot.schedule.length !== 272 || new Set(snapshot.schedule.map(g => g.id)).size !== 272) {
    throw new Error("Incomplete verified NFL snapshot; keeping the previous generated file");
  }
  if (snapshot.sourceAsOf !== manifest.sourceAsOf || injuryResearch.as_of !== manifest.sourceAsOf || injuryResearch.week !== snapshot.season.currentWeek || editorial.asOf !== manifest.sourceAsOf || editorial.week !== snapshot.season.currentWeek) {
    throw new Error("Verified snapshot and injury report date/week do not match");
  }
  for (const [key, board] of Object.entries(fantasyDesk)) {
    const expectedWeek = key === "rookie" ? snapshot.season.currentWeek - 1 : snapshot.season.currentWeek;
    const boardWeek = key === "waiver" ? board?.week_adding_for : board?.week;
    if (board && (boardWeek !== expectedWeek || board.as_of !== manifest.sourceAsOf)) {
      throw new Error("Fantasy board belongs to another source date/week");
    }
  }
  const payload = { ...snapshot, injuryResearch, fantasyDesk };
  // One write, only after all reads and validation succeed. generatedAt remains
  // the source collection time, even when a release is built again tomorrow.
  writeFileSync(join(root, "lib/nfl-generated.ts"),
    `// GENERATED from the reviewed data/content-refresh snapshot.\n// Source collection time is preserved across builds.\n// biome-ignore lint: generated file\nexport default ${JSON.stringify(payload)};\n`);
  console.log(`Verified snapshot: ${manifest.sourceAsOf}, Week ${snapshot.season.currentWeek}, 272 games; source timestamps preserved.`);
}
