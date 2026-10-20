import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [component, config] = await Promise.all([
  readFile(new URL("../components/HubApp.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/config.ts", import.meta.url), "utf8"),
]);
const header = await readFile(new URL("../components/broadcast/header.tsx", import.meta.url), "utf8");
const footer = await readFile(new URL("../components/broadcast/footer.tsx", import.meta.url), "utf8");
const source = `${component}\n${config}\n${header}\n${footer}`;
const required = [
  "/scores",
  "/schedule",
  "/transactions",
  "/stats",
  "/fantasy-desk",
  "/conferences",
  "/x-and-ys",
  "/injuries",
  "/search",
  "/dfs",
  "/watch",
  "/methodology",
  "/data-sources",
  "/corrections",
  "/newsletter",
  "/advertise",
  "/partnerships",
  "/privacy",
  "/terms",
  "/affiliate-disclosure",
  "/responsible-gaming",
];

test("all required route families are linked from the product shell", () => {
  for (const route of required) assert.match(source, new RegExp(route.replaceAll("/", "\\/")));
});

test("no javascript or placeholder hrefs are used", () => {
  assert.doesNotMatch(component, /href=["'](?:#["']|javascript:)/i);
});
