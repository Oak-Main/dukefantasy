import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { isCalendarDate, validateDesignationPhase, validatePublicationDates } from "./week7-publication-dates.mjs";
import { publisher } from "./week7-evidence.mjs";

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
  validatePublicationDates({ injury: injuryResearch, editorial }, manifest);
  for (const row of [...injuryResearch.ledger, ...injuryResearch.watch, ...(editorial.reserveStatuses ?? []), ...(editorial.practiceReports ?? []), ...(editorial.transactions?.moves ?? []), ...(editorial.statLeaders ?? [])]) {
    if (!Array.isArray(row.sources) || new Set(row.sources.map(publisher)).size < 2) throw new Error("Published records require two HTTPS publisher families");
  }
  const todayEastern = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const releaseDay = manifest.cutoffUtc
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(manifest.cutoffUtc))
    : manifest.sourceAsOf;
  for (const row of editorial.practiceReports ?? []) {
    if (!isCalendarDate(row.date) || row.date > todayEastern || row.date > manifest.sourceAsOf || row.date > releaseDay || !Number.isInteger(row.week) || row.week < 1 || row.week > snapshot.season.currentWeek) throw new Error("Practice observations require real nonfuture dates within the release cutoff and official report week");
    const game = snapshot.schedule.find(game => game.week === row.week && [game.awaySlug, game.homeSlug].includes(row.team_slug));
    const gameDay = game && new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(game.kickoffUtc));
    const daysBeforeGame = gameDay && (Date.parse(gameDay) - Date.parse(row.date)) / 86_400_000;
    // Historical reports retain their own week. An official game report window
    // spans the six preceding calendar days through that team's Eastern game day.
    if (!game || daysBeforeGame < 0 || daysBeforeGame > 6) throw new Error("Practice observation references the wrong team, date or official game week");
    if (row.checkedAt != null && (typeof row.checkedAt !== "string" || !isCalendarDate(row.checkedAt.slice(0, 10)) || !Number.isFinite(Date.parse(row.checkedAt)) || new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(row.checkedAt)) < row.date || Date.parse(row.checkedAt) > Date.now() || (manifest.cutoffUtc && Date.parse(row.checkedAt) > Date.parse(manifest.cutoffUtc)))) throw new Error("Practice retrieval timestamp exceeds the release cutoff");
  }
  for (const row of injuryResearch.watch) {
    validateDesignationPhase(row);
    if (row.designation_phase === "in_game") {
      const game = snapshot.schedule.find(game => String(game.id) === row.game_id);
      if (!game || game.week !== injuryResearch.week || ![game.awaySlug, game.homeSlug].includes(row.team_slug)) throw new Error("In-game injury status references the wrong game, team or week");
    }
    if (row.published_status != null && (!["OUT", "DOUBTFUL", "QUESTIONABLE", "NO_DESIGNATION"].includes(row.published_status) || row.designation_week !== injuryResearch.week || !isCalendarDate(row.designation_date))) {
      throw new Error("Official injury designations require a valid status, matching report week and dated source");
    }
  }
  for (const report of editorial.inactives ?? []) {
    const game = snapshot.schedule.find(game => String(game.id) === report.gameId);
    if (!game || game.week !== report.week || ![game.awaySlug, game.homeSlug].includes(report.teamSlug)) throw new Error("Inactive report references the wrong game, team or official week");
    if (!report.complete || !Array.isArray(report.players) || new Set(report.players.map(player => player.name)).size !== report.players.length || report.players.some(player => !player.name || !["inactive", "emergency_qb"].includes(player.designation))) throw new Error("Inactive lists must be complete, unique and distinguish emergency quarterbacks");
    if (!Array.isArray(report.sources) || new Set(report.sources.map(publisher)).size < 2) throw new Error("Inactive lists require two HTTPS publisher families");
    const published = Date.parse(report.publishedAt), checked = Date.parse(report.checkedAt);
    if (!Number.isFinite(published) || !Number.isFinite(checked) || published > checked || checked > Date.now() || published > Date.parse(game.kickoffUtc) || published < Date.parse(game.kickoffUtc) - 2 * 3_600_000) throw new Error("Inactive lists require actual pre-kickoff publication and retrieval times");
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
    if (board && (boardWeek !== expectedWeek || !isCalendarDate(board.as_of) || board.as_of > manifest.sourceAsOf)) {
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
