/**
 * Receipt: render the built Worker and print the published page titles.
 * This is the screenshot-equivalent proof that the title carries the edition week.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const modulesRoot = fileURLToPath(new URL("../dist/server", import.meta.url));
const files = readdirSync(modulesRoot, { recursive: true }).filter((path) => path.endsWith(".js"));
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    modulesRoot,
    modules: ["index.js", ...files.filter((path) => path !== "index.js")].map((path) => ({
      type: "ESModule",
      path: join(modulesRoot, path),
    })),
    compatibilityDate: "2026-09-01",
    compatibilityFlags: ["nodejs_compat"],
    outboundService: async () => new Response("upstream unavailable", { status: 503 }),
    serviceBindings: { ASSETS: async () => new Response("Not found", { status: 404 }) },
  }),
);

const edition = JSON.parse(readFileSync(new URL("../data/content-refresh/current-editorial.json", import.meta.url)));
for (const path of ["/", "/scores", "/schedule", "/fantasy-desk", "/data-sources"]) {
  const response = await runtime.dispatchFetch(`http://localhost${path}`, new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }));
  const html = await response.text();
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "(no title)";
  const marker = html.match(/\[\[COPY: [^\]]+\]\]/)?.[0] ?? "(no marker)";
  assert.equal(response.status, 200, path);
  assert.notEqual(title, "(no title)", path);
  if (["/", "/schedule", "/fantasy-desk"].includes(path)) assert.match(title, new RegExp(`Week ${edition.week}\\b`), path);
  assert.equal(marker, "(no marker)", path);
  const compiled = html.match(/Dataset compiled through[^<]*/)?.[0] ?? "";
  console.log(`${path.padEnd(14)} ${response.status} | title: ${title}`);
  console.log(`${" ".repeat(15)}marker: ${marker}${compiled ? ` | ${compiled}` : ""}`);
}
await runtime.dispose();
