import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

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
  for (const row of injuryResearch.watch) {
    if (row.published_status != null && (!["OUT", "DOUBTFUL", "QUESTIONABLE", "NO_DESIGNATION"].includes(row.published_status) || row.designation_week !== injuryResearch.week || !/^\d{4}-\d{2}-\d{2}$/.test(row.designation_date ?? ""))) {
      throw new Error("Official injury designations require a valid status, matching report week and dated source");
    }
  }
  if (snapshot.teams.length !== 32 || snapshot.schedule.length !== 272 || new Set(snapshot.schedule.map(g => g.id)).size !== 272) {
    throw new Error("Incomplete verified NFL snapshot; keeping the previous generated file");
  }
  const sources = editorial.moduleSources;
  if (sources.schedule.sourceAsOf !== snapshot.sourceAsOf || sources.injuries.sourceAsOf !== injuryResearch.as_of || injuryResearch.week !== snapshot.season.currentWeek || editorial.week !== snapshot.season.currentWeek) {
    throw new Error("Verified snapshot and injury report date/week do not match");
  }
  for (const [key, board] of Object.entries(fantasyDesk)) {
    const expectedWeek = key === "rookie" ? snapshot.season.currentWeek - 1 : snapshot.season.currentWeek;
    const boardWeek = key === "waiver" ? board?.week_adding_for : board?.week;
    if (board && (boardWeek !== expectedWeek || !/^\d{4}-\d{2}-\d{2}$/.test(board.as_of) || board.as_of > manifest.sourceAsOf)) {
      throw new Error("Fantasy board belongs to another source date/week");
    }
  }
  for (const source of Object.values(sources)) {
    if (source.sourceAsOf && source.sourceAsOf > manifest.sourceAsOf) throw new Error("Module date is newer than the release date");
  }
  const publicationId = createHash("sha256").update(JSON.stringify({ snapshot, injuryResearch, fantasyDesk, editorial })).digest("hex");
  const payload = { ...snapshot, injuryResearch, fantasyDesk, publicationId };
  // One write, only after all reads and validation succeed. generatedAt remains
  // the source collection time, even when a release is built again tomorrow.
  writeFileSync(join(root, "lib/nfl-generated.ts"),
    `// GENERATED from the reviewed data/content-refresh snapshot.\n// Source collection time is preserved across builds.\n// biome-ignore lint: generated file\nexport default ${JSON.stringify(payload)};\n`);
  console.log(`Verified snapshot: ${manifest.sourceAsOf}, Week ${snapshot.season.currentWeek}, 272 games; source timestamps preserved.`);
}
