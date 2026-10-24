import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

async function fetchRoute(path, init) {
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html", ...(init?.headers ?? {}) },
      ...init,
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the finished home utility", async () => {
  const response = await fetchRoute("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(response.headers.get("x-content-revision") ?? "", /^[a-f0-9]{64}$/);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/i);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);

  const html = await response.text();
  assert.match(html, /Every Sunday/);
  assert.match(html, /GAME OF THE WEEK|MARQUEE MATCHUP/);
  assert.match(html, /32/);
  assert.match(html, /NFL teams/);
  assert.match(html, /Clean Mode/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("www canonicalizes to the apex domain without losing the request target", async () => {
  const response = await worker.fetch(
    new Request("https://www.dukefantasy.com/scores?week=1"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://dukefantasy.com/scores?week=1");
  assert.match(response.headers.get("strict-transport-security") ?? "", /includeSubDomains/);
});

test("critical product routes render dataset-backed content", async () => {
  const routes = [
    ["/scores", /The slate, without the scavenger hunt/],
    ["/scores", /Select scoreboard week/],
    ["/teams", /All 32 NFL teams/],
    ["/teams/kansas-city-chiefs", /Kansas City/],
    ["/teams/kansas-city-chiefs", /Chiefs/],
    ["/teams/kansas-city-chiefs", /\/logos\/kansas-city-chiefs\.png/],
    ["/conferences", /AFC|NFC/],
    ["/conferences/afc-east", /AFC East/],
    ["/conferences/nfc-west", /49ers|NFC West/],
    ["/schedule", /Week|NFL/i],
    ["/games/401872657", /Netflix/],
    ["/games/401872657", /49ers|Rams/],
    ["/dfs", /picks you can audit/i],
    ["/dfs", /Week <!-- -->7<!-- --> projections are not published/i],
    ["/fantasy-desk", /Aaron Rodgers/],
    ["/transactions", /Tanner Hudson/],
    ["/stats", /Matthew Stafford/],
    ["/data-sources", /Source as of/],
    ["/injuries", /2026-10-19/],
    ["/injuries", /PUP, NFI/],
    ["/dfs", /verification guide/i],
    ["/x-and-ys", /The offense, decoded/],
    ["/x-and-ys", /Wide Zone Tree/],
    ["/x-and-ys", /Mesh/],
    ["/x-and-ys", /film room opens after Week 1/i],
    ["/injuries", /The injury report, on the record/],
    ["/injuries", /LONG-TERM LEDGER/],
    ["/injuries", /GAME-TIME DECISIONS|week-to-week watch/i],
    ["/injuries", /Next scheduled check|Week 7 scheduled checks ended/],
    ["/api/injuries", /"source": ?"ESPN NFL injuries feed"/],
    ["/watch", /DUKE FANTASY BROADCAST DESK/],
    ["/watch", /televised games/],
    ["/watch", /TicketNetwork/],
    ["/watch", /TicketSmarter/],
    ["/search", /Try Chiefs, Mahomes/],
    ["/", /hello@dukefantasy\.com/],
    ["/", /privacy@dukefantasy\.com/],
    ["/privacy", /privacy@dukefantasy\.com/],
    ["/media-kit", /media@dukefantasy\.com/],
    ["/corrections", /admin@dukefantasy\.com/],
    ["/about", /socials@dukefantasy\.com/],
  ];

  for (const [path, pattern] of routes) {
    const response = await fetchRoute(path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), pattern, path);
  }
});

test("dated practice cards distinguish practice reports from walkthrough estimates", async () => {
  const response = await fetchRoute("/injuries");
  assert.equal(response.status, 200);
  const html = (await response.text()).replaceAll("<!-- -->", "");
  const dated = html.match(/<section[^>]+aria-labelledby="dated-practice-title"[\s\S]*?<\/section>/)?.[0] ?? "";
  const cards = [...dated.matchAll(/<article\b[\s\S]*?<\/article>/g)].map(match => match[0]);
  const hall = cards.find(card => card.includes("Breece Hall") && card.includes("2026-10-21"));
  const edwards = cards.find(card => card.includes("T.J. Edwards") && card.includes("2026-10-21"));
  assert.ok(hall, "corroborated Wednesday practice card renders");
  assert.match(hall, /Practice report/);
  assert.doesNotMatch(hall, /Estimated walkthrough/);
  assert.ok(edwards, "dated Bears walkthrough card renders");
  assert.match(edwards, /Estimated walkthrough/);
});

test("game pages print the Eastern game day whatever zone the renderer runs in", async () => {
  // Sunday Night Football (Ravens at Falcons) is Sunday 2026-10-11 in the East.
  // A bare `new Date("2026-10-11")` is UTC midnight, which is Saturday evening
  // in Los Angeles; the planner card used to print "Sat, Oct 10" there.
  const original = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    const response = await fetchRoute("/games/401872993");
    assert.equal(response.status, 200);
    const html = (await response.text()).replaceAll("<!-- -->", "");
    assert.match(html, /Sun · 2026-10-11 · 8:20 PM ET/, "the game header carries the Eastern kickoff");
    assert.match(html, /Sun, Oct 11/, "the planner card names the Eastern game day");
    assert.doesNotMatch(html, /Sat, Oct 10/);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("spoofed admin-identity headers never reach the app (NF-1)", async () => {
  const response = await fetchRoute("/admin", {
    headers: { "oai-authenticated-user-email": "operator@dukefantasy.com" },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  // The console must render its unauthenticated state — a spoofed identity
  // header can never authorize it.
  assert.ok(!/operator@dukefantasy\.com/.test(html), "spoofed email leaked into the admin page");
});

test("health and readiness endpoints disclose dataset state", async () => {
  const health = await fetchRoute("/api/health", { headers: { accept: "application/json" } });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).dataEnvironment, "dataset");

  const readiness = await fetchRoute("/api/readiness", { headers: { accept: "application/json" } });
  const data = await readiness.json();
  assert.equal(data.readyForPreview, true);
  assert.equal(data.readyForProductionLiveData, false);
  assert.match(readiness.headers.get("cache-control") ?? "", /no-store/i);
  assert.ok(data.productionGates.length >= 10);
  assert.ok(data.productionGates.some((gate) => gate.id === "LIVE_MODE" && gate.status === "blocked"));
});

test("simulation API rejects invalid scenario participants and caps work", async () => {
  const board = await fetchRoute("/api/simulate", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ iterations: 100_000 }),
  });
  assert.equal(board.status, 200);
  assert.equal((await board.json()).iterations, 20_000);

  const invalid = await fetchRoute("/api/simulate", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ forced: { "scenario-1": "team-16" }, iterations: 100_000 }),
  });
  assert.equal(invalid.status, 400);

  const unknownTeam = await fetchRoute("/api/simulate", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ forced: { "scenario-1": "clemson" }, iterations: 100_000 }),
  });
  assert.equal(unknownTeam.status, 400);
});


test("official OUT designation replaces a prior questionable likelihood badge", async () => {
  const response = await fetchRoute("/injuries");
  assert.equal(response.status, 200);
  const html = await response.text();
  const row = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].map(match => match[0]).find(row => row.includes("Tremaine Edmunds"));
  assert.ok(row, "Tremaine Edmunds watch row renders");
  assert.match(html, /Full review as of/);
  assert.match(html, /Latest dated observation/);
  assert.match(html, /2026-10-23/);
  const text = row.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /Official Week 7 designation: OUT/);
  assert.match(text, /UNLIKELY/);
  assert.match(text, /high conf/);
  assert.doesNotMatch(text, /QUESTIONABLE/);
});

test("dated reserve verification advances the latest observation while retaining the comprehensive review date", async () => {
  const editorial = JSON.parse(readFileSync(new URL("../data/content-refresh/current-editorial.json", import.meta.url), "utf8"));
  const injury = JSON.parse(readFileSync(new URL("../data/injury-research/current.json", import.meta.url), "utf8"));
  const reinstatement = editorial.reserveStatuses.find(row => row.player === "Montez Sweat");
  assert.ok(reinstatement?.asOf, "the published reserve observation has its own verification date");
  const response = await fetchRoute("/injuries");
  assert.equal(response.status, 200);
  const text = (await response.text()).replaceAll("<!-- -->", "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  assert.equal(text.match(/Full review as of (\d{4}-\d{2}-\d{2})/)?.[1], injury.as_of);
  const latest = text.match(/Latest dated observation (\d{4}-\d{2}-\d{2})/)?.[1];
  assert.ok(latest && latest >= reinstatement.asOf, "a newer reserve observation must not disappear from the latest-observation label");
  assert.ok(text.includes(`Status checked ${reinstatement.asOf}`));
});
