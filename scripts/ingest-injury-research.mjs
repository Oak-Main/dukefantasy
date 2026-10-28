/**
 * Ingests the weekly injury research JSON into the vendored editorial layer.
 *
 * Usage:
 *   node scripts/ingest-injury-research.mjs [input.json] [--week N]
 *
 * Without an argument it scans data/injury-research/inbox/*.json and ingests
 * the newest valid file (by mtime). After a successful ingest it rewrites
 * data/injury-research/current.json — the build script bakes that file into
 * the deployed dataset. Every entry must reference a known team slug; every
 * likelihood must carry a confidence; anything failing validation is
 * rejected loudly rather than partially ingested.
 */
import { readdirSync, readFileSync, writeFileSync, statSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDesignationPhase } from "./week7-publication-dates.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const INBOX = join(root, "data", "injury-research", "inbox");
const CURRENT = join(root, "data", "injury-research", "current.json");

const LIKELIHOODS = new Set(["likely", "questionable", "doubtful", "unlikely"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);
const PRACTICE = new Set(["DNP", "LP", "FP", null]);
const LEDGER_STATUS = new Set(["IR", "OUT"]);

function teamSlugs() {
  // Read the generated bundle for the canonical slug list (no TS import needed).
  const generated = readFileSync(join(root, "lib", "nfl-generated.ts"), "utf8");
  const match = generated.match(/"teams":\[(.*?)\],"schedule"/s);
  const slugs = new Set();
  for (const m of generated.matchAll(/"slug":"([a-z0-9-]+)"/g)) slugs.add(m[1]);
  if (slugs.size === 0) throw new Error("could not read team slugs from lib/nfl-generated.ts");
  return slugs;
}

function fail(message, entry, index) {
  throw new Error(`validation failed — ${message}${entry ? ` (ledger[${index}]: ${entry.player ?? "?"})` : ""}`);
}

function validate(doc, slugs) {
  if (!doc || typeof doc !== "object") fail("document is not an object");
  if (!Number.isInteger(doc.week) || doc.week < 1 || doc.week > 18) fail("regular-season report week must be 1–18");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.as_of ?? "")) fail("as_of must be the actual YYYY-MM-DD source date");
  const ledger = Array.isArray(doc.ledger) ? doc.ledger : [];
  const watch = Array.isArray(doc.watch) ? doc.watch : [];
  ledger.forEach((entry, index) => {
    if (!entry.player) fail("player missing", entry, index);
    if (!slugs.has(entry.team_slug)) fail(`unknown team_slug ${entry.team_slug}`, entry, index);
    if (!LEDGER_STATUS.has(entry.status)) fail(`status must be IR or OUT, got ${entry.status}`, entry, index);
    if (entry.status === "OUT" && !(typeof entry.weeks_out === "number" && entry.weeks_out > 2)) {
      fail("OUT entries need weeks_out > 2 (week-to-week belongs in watch)", entry, index);
    }
    if (entry.confidence && !CONFIDENCE.has(entry.confidence)) fail(`bad confidence ${entry.confidence}`, entry, index);
    if (!Array.isArray(entry.sources) || entry.sources.length === 0) fail("at least one source URL required", entry, index);
    if (new Set(entry.sources.map(url => new URL(url).hostname.replace(/^www\./, ""))).size < 2) fail("two distinct publishers required", entry, index);
  });
  watch.forEach((entry, index) => {
    validateDesignationPhase(entry);
    if (!entry.player) fail("player missing", entry, index);
    if (!slugs.has(entry.team_slug)) fail(`unknown team_slug ${entry.team_slug}`, entry, index);
    if (entry.published_status != null && (!["OUT", "DOUBTFUL", "QUESTIONABLE", "NO_DESIGNATION"].includes(entry.published_status) || entry.designation_week !== doc.week || !/^\d{4}-\d{2}-\d{2}$/.test(entry.designation_date ?? ""))) fail("official designation needs valid status, report week and source date", entry, index);
    for (const day of ["mon", "tue", "wed", "thu", "fri", "sat"]) {
      if (!PRACTICE.has(entry.practice?.[day] ?? null)) {
        fail(`practice.${day} must be DNP|LP|FP|null, got ${entry.practice?.[day]}`, entry, index);
      }
    }
    if (entry.likelihood && !LIKELIHOODS.has(entry.likelihood)) fail(`bad likelihood ${entry.likelihood}`, entry, index);
    if ((entry.likelihood && !entry.confidence) || (entry.confidence && !CONFIDENCE.has(entry.confidence))) fail("likelihood needs a valid confidence", entry, index);
    if (!entry.published_status && !entry.likelihood && !Object.values(entry.practice ?? {}).some(value => value != null)) {
      fail("watch entries need practice status, a designation or a likelihood", entry, index);
    }
    const allSources = [...(entry.sources ?? []), ...(entry.social ?? [])];
    if (allSources.length === 0) fail("at least one source or verified social link required", entry, index);
    if (new Set(allSources.map(url => new URL(url).hostname.replace(/^www\./, ""))).size < 2) fail("two distinct publishers required", entry, index);
  });
  return {
    week: typeof doc.week === "number" ? doc.week : null,
    as_of: doc.as_of ?? new Date().toISOString().slice(0, 10),
    ledger,
    watch,
  };
}

const argFile = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
const weekArg = process.argv.includes("--week") ? Number(process.argv[process.argv.indexOf("--week") + 1]) : null;

let sourcePath = argFile;
if (!sourcePath) {
  const files = readdirSync(INBOX)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ name, mtime: statSync(join(INBOX, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) {
    console.error(`No research JSON staged. Drop the weekly research export into:\n  ${INBOX}\nor pass a path: node scripts/ingest-injury-research.mjs <file.json>`);
    process.exit(1);
  }
  sourcePath = join(INBOX, files[0].name);
  console.log(`Ingesting newest inbox file: ${files[0].name}`);
}

const slugs = teamSlugs();
const raw = JSON.parse(readFileSync(sourcePath, "utf8"));
const doc = validate(weekArg ? { ...raw, week: weekArg } : raw, slugs);

writeFileSync(CURRENT, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
// Keep the source for auditability.
copyFileSync(sourcePath, join(root, "data", "injury-research", `ingested-${doc.as_of}.json`));

console.log(`Injury research staged: week ${doc.week ?? "n/a"}, as of ${doc.as_of}`);
console.log(`  ledger entries: ${doc.ledger.length} (IR or 3+ weeks out)`);
console.log(`  watch entries:  ${doc.watch.length}`);
console.log(`Wrote ${CURRENT}`);
console.log("Next: npm run build && npx wrangler deploy --config wrangler.deploy.jsonc (or let the scheduled automation handle it)");
