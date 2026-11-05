// Re-capture the three published listings used for the November 8 assignment.
// These raw body fingerprints supplement the separately reviewed and pinned ruling.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const ruling = JSON.parse(readFileSync(new URL("../data/content-refresh/broadcast-reviews.json", import.meta.url)))["401873042"];
assert.equal(ruling.date, "2026-11-08");
assert.equal(ruling.network, "CBS");
const listings = [
  { field: "leagueUrl", host: "www.nfl.com", patterns: [/Detroit Lions\s+(?:vs\.?|at)\s+Miami Dolphins\s*\(CBS\)/i, /(?:Nov(?:ember)?\.?\s+8)/i] },
  { field: "teamUrl", host: "www.detroitlions.com", patterns: [/Detroit Lions.{0,200}WEEK 9.{0,80}11\/08.{0,160}Miami Dolphins.{0,100}CBS/i] },
  { field: "broadcasterUrl", host: "www.paramountplus.com", patterns: [/Lions.Dolphins game is Sunday, Nov\.? 8.{0,100}airs on CBS/i, /1\s*PM ET/i] },
];
for (const { field, host, patterns } of listings) {
  const url = ruling[field];
  assert.equal(new URL(url).hostname, host);
  const response = await fetch(url, { redirect: "error", headers: { "user-agent": "Mozilla/5.0", "accept-language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(25000) });
  assert.equal(response.status, 200, url);
  assert.equal(response.url, url);
  const bytes = Buffer.from(await response.arrayBuffer());
  const visible = bytes.toString("utf8").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&(?:nbsp|amp|ndash|mdash);/gi, " ").replace(/\s+/g, " ");
  for (const pattern of patterns) assert.match(visible, pattern, url);
  console.log("broadcast-source", JSON.stringify({ id: "401873042", field, url, checkedAt: new Date().toISOString(), status: response.status, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }));
}
