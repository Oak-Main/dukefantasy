import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const rulings = JSON.parse(readFileSync(new URL("../data/content-refresh/broadcast-reviews.json", import.meta.url)));
for (const [id, ruling] of Object.entries(rulings)) {
  for (const field of ["leagueUrl", "teamUrl", "broadcasterUrl"]) {
    const url = ruling[field];
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", "accept-language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(25000) });
    assert.equal(response.status, 200, url);
    const bytes = Buffer.from(await response.arrayBuffer());
    const html = bytes.toString("utf8");
    for (const term of ["Lions", "Dolphins", ruling.network]) assert.ok(html.toLowerCase().includes(term.toLowerCase()), url + " lacks " + term);
    console.log("broadcast-source", JSON.stringify({ id, field, url, checkedAt: new Date().toISOString(), status: response.status, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }));
  }
}
