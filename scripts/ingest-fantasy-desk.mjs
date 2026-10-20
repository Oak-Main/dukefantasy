/**
 * Ingests the weekly fantasy-desk research JSON (research prompts 11-14) into
 * the editorial layer. Mirrors ingest-injury-research.mjs: inbox scan, loud
 * validation, then rewrite data/fantasy-desk/current.json — the build script
 * bakes that file into the deployed dataset. Anything failing validation is
 * rejected whole, never partially ingested.
 *
 * Usage:
 *   node scripts/ingest-fantasy-desk.mjs [input.json]
 *
 * Input contract (one JSON file, any subset of the four boards):
 * {
 *   "waiver":   { per research prompt 11 },
 *   "start_sit":{ per research prompt 12 },
 *   "rookie":   { per research prompt 13 },
 *   "trade":    { per research prompt 14 }
 * }
 */
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const INBOX = join(root, "data", "fantasy-desk", "inbox");
const CURRENT = join(root, "data", "fantasy-desk", "current.json");

const POSITIONS = new Set(["QB", "RB", "WR", "TE", "FLEX", "DST", "K"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);
const HOLD = new Set(["stream", "rest_of_season"]);
const TIERS = new Set(["start_confidence", "start_if_needed", "fringe", "sit"]);
const TREND = new Set(["rising", "steady", "fading"]);
const MEANING = new Set(["waiver_relevant", "bench_stash", "dynasty_only"]);
const MARKET = new Set(["buy_low", "sell_high", "fair"]);
const URL_RE = /^https?:\/\/.+/;

function teamSlugs() {
  const generated = readFileSync(join(root, "lib", "nfl-generated.ts"), "utf8");
  const slugs = new Set();
  for (const m of generated.matchAll(/"slug":"([a-z0-9-]+)"/g)) slugs.add(m[1]);
  if (slugs.size === 0) throw new Error("could not read team slugs from lib/nfl-generated.ts");
  return slugs;
}

function fail(where, message, player) {
  throw new Error(`validation failed — ${where}: ${message}${player ? ` [${player}]` : ""}`);
}

const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isSources = (v, where, player) => {
  if (!Array.isArray(v) || v.length === 0 || !v.every((s) => typeof s === "string" && URL_RE.test(s))) {
    fail(where, "needs a non-empty sources array of URLs", player);
  }
  if (new Set(v.map(url => new URL(url).hostname.replace(/^www\./, ""))).size < 2) {
    fail(where, "needs at least two distinct publisher hosts", player);
  }
};

function validateWaiver(w, slugs) {
  if (!isDate(w.as_of)) fail("waiver", "as_of must be YYYY-MM-DD");
  if (!Number.isInteger(w.week_adding_for)) fail("waiver", "week_adding_for must be an integer");
  if (!Array.isArray(w.adds) || w.adds.length === 0) fail("waiver", "adds must be a non-empty array");
  for (const a of w.adds) {
    if (!a.player) fail("waiver.adds", "player missing", a.player);
    if (!slugs.has(a.team_slug)) fail("waiver.adds", `unknown team_slug ${a.team_slug}`, a.player);
    if (!POSITIONS.has(a.position)) fail("waiver.adds", `position must be one of QB/RB/WR/TE/FLEX/DST/K`, a.player);
    if (!(a.ownership_pct === null || (typeof a.ownership_pct === "number" && a.ownership_pct >= 0 && a.ownership_pct <= 100))) {
      fail("waiver.adds", "ownership_pct must be a published 0-100 number or null", a.player);
    }
    if (!CONFIDENCE.has(a.confidence)) fail("waiver.adds", "confidence must be high/medium/low", a.player);
    if (!HOLD.has(a.hold)) fail("waiver.adds", "hold must be stream/rest_of_season", a.player);
    isSources(a.sources, "waiver.adds", a.player);
  }
  for (const d of w.drops ?? []) {
    if (!d.player || !slugs.has(d.team_slug)) fail("waiver.drops", "player/known team_slug required", d.player);
    isSources(d.sources, "waiver.drops", d.player);
  }
  if (typeof w.priority_note !== "string") fail("waiver", "priority_note missing");
}

function validateStartSit(s, slugs) {
  if (!isDate(s.as_of)) fail("start_sit", "as_of must be YYYY-MM-DD");
  if (!Number.isInteger(s.week)) fail("start_sit", "week must be an integer");
  if (!Array.isArray(s.positions) || s.positions.length === 0) fail("start_sit", "positions must be non-empty");
  for (const p of s.positions) {
    if (!p.position) fail("start_sit.positions", "position missing");
    if (!Array.isArray(p.tiers) || p.tiers.length === 0) fail("start_sit.positions", `${p.position}: tiers must be non-empty`);
    for (const t of p.tiers) {
      if (!TIERS.has(t.tier)) fail("start_sit.positions", `${p.position}: tier must be one of the four tier keys`);
      if (!Array.isArray(t.players) || t.players.length === 0) fail("start_sit.positions", `${p.position}/${t.tier}: players must be non-empty`);
      for (const r of t.players) {
        if (!r.player || !slugs.has(r.team_slug)) fail("start_sit.positions", `${p.position}/${t.tier}: player/known team_slug required`, r.player);
        if (typeof r.note !== "string" || !r.note) fail("start_sit.positions", "note required", r.player);
        isSources(r.sources, "start_sit.positions", r.player);
      }
    }
  }
  for (const tc of s.tough_calls ?? []) {
    if (!tc.player || !slugs.has(tc.team_slug) || !tc.verdict) fail("start_sit.tough_calls", "player/known team_slug/verdict required", tc.player);
    isSources(tc.sources, "start_sit.tough_calls", tc.player);
  }
  // Decision board, not projections: no numeric point fields exist on the
  // schema by construction, and the domain test enforces the same.
}

function validateRookie(r, slugs) {
  if (!isDate(r.as_of)) fail("rookie", "as_of must be YYYY-MM-DD");
  if (!Number.isInteger(r.week)) fail("rookie", "week must be an integer");
  if (!Array.isArray(r.rookies) || r.rookies.length === 0) fail("rookie", "rookies must be non-empty");
  for (const x of r.rookies) {
    if (!x.player || !slugs.has(x.team_slug)) fail("rookie.rookies", "player/known team_slug required", x.player);
    if (!TREND.has(x.trend)) fail("rookie.rookies", "trend must be rising/steady/fading", x.player);
    if (!MEANING.has(x.fantasy_meaning)) fail("rookie.rookies", "fantasy_meaning must be waiver_relevant/bench_stash/dynasty_only", x.player);
    for (const k of ["draft_round", "snaps", "team_snaps", "snap_share_pct", "targets_or_carries"]) {
      if (!(x[k] === null || typeof x[k] === "number")) fail("rookie.rookies", `${k} must be a published number or null`, x.player);
    }
    isSources(x.sources, "rookie.rookies", x.player);
  }
}

function validateTrade(t, slugs) {
  if (!isDate(t.as_of)) fail("trade", "as_of must be YYYY-MM-DD");
  if (!Number.isInteger(t.week)) fail("trade", "week must be an integer");
  if (!Array.isArray(t.boards) || t.boards.length === 0) fail("trade", "boards must be non-empty");
  const byPosition = new Map();
  for (const g of t.boards) {
    if (!g.position) fail("trade.boards", "position missing");
    if (!Array.isArray(g.rows) || g.rows.length === 0) fail("trade.boards", `${g.position}: rows must be non-empty`);
    const seen = byPosition.get(g.position) ?? new Map(); // player -> tier (cross-board consistency)
    for (const r of g.rows) {
      if (!r.player || !slugs.has(r.team_slug)) fail("trade.boards", `${g.position}: player/known team_slug required`, r.player);
      if (!(Number.isInteger(r.tier) && r.tier >= 1 && r.tier <= 5)) fail("trade.boards", "tier must be 1-5", r.player);
      if (!MARKET.has(r.market)) fail("trade.boards", "market must be buy_low/sell_high/fair", r.player);
      if (typeof r.basis !== "string" || !r.basis) fail("trade.boards", "basis required", r.player);
      isSources(r.sources, "trade.boards", r.player);
      const prior = seen.get(r.player);
      if (prior !== undefined && prior !== r.tier) fail("trade.boards", `${r.player} appears twice in ${g.position} with different tiers`);
      seen.set(r.player, r.tier);
    }
    byPosition.set(g.position, seen);
  }
  for (const sw of t.swing_trades ?? []) {
    if (!sw.give || !sw.get || !sw.rationale) fail("trade.swing_trades", "give/get/rationale required");
  }
}

function validate(doc, slugs) {
  if (!doc || typeof doc !== "object") fail("document", "not an object");
  const known = ["waiver", "start_sit", "rookie", "trade"];
  const present = known.filter((k) => doc[k]);
  if (present.length === 0) fail("document", "no boards present (expected at least one of waiver/start_sit/rookie/trade)");
  for (const key of Object.keys(doc)) {
    if (!known.includes(key)) fail("document", `unknown board key ${key}`);
  }
  if (doc.waiver) validateWaiver(doc.waiver, slugs);
  if (doc.start_sit) validateStartSit(doc.start_sit, slugs);
  if (doc.rookie) validateRookie(doc.rookie, slugs);
  if (doc.trade) validateTrade(doc.trade, slugs);
  return present;
}

// --- run ---
const arg = process.argv[2];
let inputPath = null;
if (arg && !arg.startsWith("--")) {
  inputPath = join(root, arg);
} else {
  mkdirSync(INBOX, { recursive: true });
  const files = readdirSync(INBOX).filter((f) => f.endsWith(".json")).sort((a, b) => statSync(join(INBOX, b)).mtimeMs - statSync(join(INBOX, a)).mtimeMs);
  if (files.length === 0) { console.error("no inbox files — nothing to ingest"); process.exit(1); }
  inputPath = join(INBOX, files[0]);
}

const slugs = teamSlugs();
const incoming = JSON.parse(readFileSync(inputPath, "utf8"));
const present = validate(incoming, slugs);
console.log(`validated boards: ${present.join(", ")} (from ${inputPath})`);

// Merge into current.json so a Tuesday waiver file doesn't wipe Saturday's
// start/sit board: boards arrive on different cadences and stack.
let currentDoc = {};
try { currentDoc = JSON.parse(readFileSync(CURRENT, "utf8")); } catch { /* first ingest */ }
const merged = { ...currentDoc };
for (const key of present) merged[key] = incoming[key];
if (currentDoc.waiver || currentDoc.start_sit || currentDoc.rookie || currentDoc.trade) {
  // Re-validate the merged doc so a bad merge can never ship.
  validate(merged, slugs);
}
writeFileSync(CURRENT, JSON.stringify(merged, null, 1));
console.log(`✓ ${CURRENT} — boards now staged: ${Object.keys(merged).join(", ")}`);
