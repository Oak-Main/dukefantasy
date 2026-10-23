import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fetchReleaseResponse } from "./release-response.mjs";

const base = new URL(process.argv[2] ?? "https://dukefantasy.com");
const manifest = JSON.parse(readFileSync(new URL("../data/content-refresh/current.json", import.meta.url), "utf8"));
const generated = readFileSync(new URL("../lib/nfl-generated.ts", import.meta.url), "utf8");
const candidate = JSON.parse(generated.slice(generated.indexOf("export default ") + 15).replace(/;\s*$/, ""));
const checks = [];
async function get(path) {
  const response = await fetchReleaseResponse(new URL(path, base), { version: manifest.sourceAsOf, revision: candidate.publicationId });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  assert.equal(response.headers.get("x-content-version"), manifest.sourceAsOf, `${path}: wrong release`);
  assert.equal(response.headers.get("x-content-revision"), candidate.publicationId, `${path}: wrong content revision`);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  return response;
}
for (const [path, match] of [
  ["/", /Week <!-- -->7<!-- --> Fantasy Desk/],
  ["/scores", /Select scoreboard week/],
  ["/schedule", /2026/],
  ["/fantasy-desk", /Aaron Rodgers/],
  ["/injuries", /Kyle Monangai/],
  ["/transactions", /Tanner Hudson/],
  ["/stats", /Matthew Stafford/],
  ["/data-sources", new RegExp(manifest.sourceAsOf)],
  ["/dfs", /projections are not published/],
  ["/games/401873011", /Saint-Denis/],
]) {
  const response = await get(path);
  const html = await response.text();
  const visible = html.replaceAll("<!-- -->", "");
  assert.match(html, match, path);
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${path}: one H1`);
  assert.match(html, /<link[^>]+rel="canonical"[^>]+href="https:\/\/dukefantasy\.com/, `${path}: canonical`);
  if (path === "/") assert.doesNotMatch(visible, /CLEAR YOUR SATURDAY|AP preseason|SP\+|Top 25/);
  if (path === "/fantasy-desk") assert.match(html, /fantasypros\.com/);
  if (path === "/games/401873011") assert.match(visible, /Neutral site; New Orleans Saints designated home/);
  checks.push({ path, status: response.status, title: html.match(/<title>(.*?)<\/title>/s)?.[1], contentVersion: response.headers.get("x-content-version") });
}
const health = await (await get("/api/health")).json();
assert.equal(health.contentVersion, manifest.sourceAsOf);
assert.equal(health.nflWeek, 7);
assert.equal(health.modules.length, 6);
checks.push({ path: "/api/health", status: 200, modules: health.modules });
const readiness = await (await get("/api/readiness")).json();
assert.equal(readiness.datasetProvider, "reviewed-nfl-snapshot");
assert.equal(readiness.contentModules.length, 6);
checks.push({ path: "/api/readiness", status: 200, ready: readiness.readyForProductionLiveData });
const scoreboard = await (await get("/api/nfl-scoreboard")).json();
assert.ok(Array.isArray(scoreboard.events), "scoreboard events");
checks.push({ path: "/api/nfl-scoreboard", status: 200, events: scoreboard.events.length });
for (const path of ["/robots.txt", "/sitemap.xml"]) {
  const response = await get(path);
  assert.ok((await response.text()).includes("dukefantasy.com"), path);
  checks.push({ path, status: response.status });
}
if (base.hostname === "dukefantasy.com") {
  const response = await fetch("https://www.dukefantasy.com/scores?week=6", { redirect: "manual" });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://dukefantasy.com/scores?week=6");
  checks.push({ path: "www redirect", status: 308 });
}
const result = { checkedAt: new Date().toISOString(), base: base.href, acceptance: "PASS", checks };
if (process.argv[3]) writeFileSync(process.argv[3], `${JSON.stringify(result, null, 2)}\n`);
console.log(`PASS: ${checks.length} release smoke checks at ${base.origin}`);
