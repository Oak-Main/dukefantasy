import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePublicationDates } from "../scripts/week7-publication-dates.mjs";

const now = new Date("2026-10-22T02:00:00Z"); // Still October 21 in Eastern.
const manifest = { sourceAsOf: "2026-10-21" };
const candidate = () => ({
  injury: { watch: [{ published_status: "OUT", designation_week: 7, designation_date: "2026-10-20" }] },
  editorial: {
    reserveStatuses: [{ asOf: "2026-10-21", checkedAt: "2026-10-21T16:19:19Z" }],
    moduleSources: { injuries: { sourceAsOf: "2026-10-20" }, inactives: { sourceAsOf: null } },
  },
});
const paths = [
  ["reserve", (data, date) => { data.editorial.reserveStatuses[0].asOf = date; }, /reserve status/],
  ["designation", (data, date) => { data.injury.watch[0].designation_date = date; }, /Official designations/],
  ["module", (data, date) => { data.editorial.moduleSources.injuries.sourceAsOf = date; }, /injuries: invalid/],
];
const invalidDates = [
  "2025-13-01", "2025-00-01", "2025-01-00", "2025-01-32", "2025-04-31", "2025-02-30",
  "2025-02-29", "1900-02-29", "2100-02-29",
  "2025-2-01", "2025-02-1", "25-02-01", "2025/02/01", " 2025-02-01", "2025-02-01 ",
  "2025-02-01\n", "2025-02-01T00:00:00Z", "", 0, false, [], {}, ["2025-02-01"],
];
for (const [name, setDate, error] of paths) {
  test(`${name} rejects nonexistent dates and malformed values`, () => {
    for (const date of invalidDates) {
      const data = candidate(); setDate(data, date);
      assert.throws(() => validatePublicationDates(data, manifest, now), error, JSON.stringify(date));
    }
  });
  test(`${name} accepts historical dates and Gregorian leap-year boundaries without mutation`, () => {
    for (const date of ["1900-02-28", "2000-02-29", "2024-02-29", "2025-02-28", "2025-04-30", "2026-10-20", "2026-10-21"]) {
      const data = candidate(); setDate(data, date); const original = structuredClone(data);
      assert.doesNotThrow(() => validatePublicationDates(data, manifest, now));
      assert.deepEqual(data, original);
    }
  });
  test(`${name} rejects tomorrow in Eastern even when UTC has reached that day`, () => {
    const data = candidate(); setDate(data, "2026-10-22");
    assert.throws(() => validatePublicationDates(data, manifest, now), error);
    assert.doesNotThrow(() => validatePublicationDates(data, { sourceAsOf: "2026-10-22" }, new Date("2026-10-22T04:00:00Z")));
    setDate(data, "2027-01-01");
    assert.throws(() => validatePublicationDates(data, manifest, now), error);
  });
}

test("release date must also be a real nonfuture calendar day", () => {
  for (const sourceAsOf of [...invalidDates, null, undefined, "2026-10-22"]) {
    assert.throws(() => validatePublicationDates(candidate(), { sourceAsOf }, now), /release source date/);
  }
});
test("reserve dates cannot exceed the release date and still require a nonfuture retrieval timestamp", () => {
  assert.throws(() => validatePublicationDates(candidate(), { sourceAsOf: "2026-10-20" }, now), /reserve status/);
  for (const checkedAt of [undefined, "not-a-timestamp", "2026-10-22T02:00:01Z", 0, ["2026-10-21T16:19:19Z"], new Date("2026-10-21T16:19:19Z")]) {
    const data = candidate(); data.editorial.reserveStatuses[0].checkedAt = checkedAt;
    assert.throws(() => validatePublicationDates(data, manifest, now), /reserve status/);
  }
});
test("designation status, week and required date guards remain enforced", () => {
  for (const patch of [{ published_status: "ACTIVE" }, { designation_week: 8 }, { designation_date: null }, { designation_date: undefined }]) {
    const data = candidate(); Object.assign(data.injury.watch[0], patch);
    assert.throws(() => validatePublicationDates(data, manifest, now), /Official designations/);
  }
});
test("undated legacy reserves and unreviewed modules remain supported", () => {
  const data = candidate(); delete data.editorial.reserveStatuses[0].asOf;
  delete data.editorial.reserveStatuses[0].checkedAt;
  assert.doesNotThrow(() => validatePublicationDates(data, manifest, now));
});

test("in-game status is an explicit phase and cannot masquerade as no injury-report designation", () => {
  const data = candidate(); Object.assign(data.injury.watch[0], { designation_phase: "in_game", game_id: "test-game", status_scope: "remainder_of_game" });
  assert.doesNotThrow(() => validatePublicationDates(data, manifest, now));
  for (const patch of [{ designation_phase: "pregame_guess" }, { published_status: null }, { published_status: "NO_DESIGNATION" }]) {
    const invalid = structuredClone(data); Object.assign(invalid.injury.watch[0], patch);
    assert.throws(() => validatePublicationDates(invalid, manifest, now), /status phase/);
  }
  data.injury.watch[0].designation_phase = "injury_report";
  data.injury.watch[0].published_status = "NO_DESIGNATION";
  assert.doesNotThrow(() => validatePublicationDates(data, manifest, now));
});
test("the actual published records retain their historical verification dates", () => {
  const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
  const data = { injury: read("data/injury-research/current.json"), editorial: read("data/content-refresh/current-editorial.json") };
  const original = structuredClone(data);
  // Publication inputs advance with the scheduled updater; fixed clocks belong to the fixtures above.
  validatePublicationDates(data, read("data/content-refresh/current.json"));
  assert.deepEqual(data, original);
});

test("the executable evidence gate applies all date guards and retains two-source requirements", () => {
  const root = mkdtempSync(join(tmpdir(), "dukefantasy-date-gate-"));
  const write = (path, value) => writeFileSync(join(root, path), JSON.stringify(value));
  const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    for (const dir of ["scripts", "data/content-refresh/test", "data/injury-research"]) mkdirSync(join(root, dir), { recursive: true });
    for (const script of ["verify-week7-update.mjs", "week7-publication-dates.mjs", "week7-evidence.mjs"]) copyFileSync(new URL(`../scripts/${script}`, import.meta.url), join(root, "scripts", script));
    const at = new Date();
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(at);
    const currentManifest = { sourceAsOf: day, snapshot: "test/snapshot.json" };
    const editorial = { reserveStatuses: [], moduleSources: { injuries: { sourceAsOf: "2025-01-01" } } };
    write("data/content-refresh/current.json", currentManifest);
    write("data/content-refresh/test/snapshot.json", { schedule: [] });
    write("data/content-refresh/current-editorial.json", editorial);
    write("data/injury-research/current.json", { ledger: [], watch: [] });
    git(["init", "-q"]); git(["add", "."]);
    git(["-c", "user.name=Date gate test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Test baseline"]);
    const value = { player: "Test reserve", team_slug: "test-team", status: "IR", asOf: day };
    const sources = ["https://www.nfl.com/test", "https://www.espn.com/test"];
    editorial.reserveStatuses = [{ ...value, checkedAt: at.toISOString(), sources }];
    const proof = { week: 7, baseCommit: git(["rev-parse", "HEAD"]), observations: [{ kind: "reserve", key: "test-team:Test reserve", value, sources: sources.map(url => ({ url, checkedAt: at.toISOString(), reportedWeek: 7, value })) }] };
    const run = () => spawnSync(process.execPath, ["scripts/verify-week7-update.mjs"], { cwd: root, encoding: "utf8" });
    const save = () => { write("data/content-refresh/current-editorial.json", editorial); write("data/content-refresh/week7-release-evidence.json", proof); };
    save();
    let result = run(); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /PASS \(1 changed facts, 0 complete reviews\)/);
    editorial.reserveStatuses[0].asOf = "2025-13-01"; save();
    result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /reserve status/);
    editorial.reserveStatuses[0].asOf = day;
    write("data/injury-research/current.json", { ledger: [], watch: [{ published_status: "OUT", designation_week: 7, designation_date: "2025-02-29" }] }); save();
    result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Official designations/);
    write("data/injury-research/current.json", { ledger: [], watch: [] });
    editorial.moduleSources.injuries.sourceAsOf = "2025-04-31"; save();
    result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /injuries: invalid/);
    editorial.moduleSources.injuries.sourceAsOf = "2025-01-01";
    proof.observations[0].sources.pop(); save();
    result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /two publisher families required/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
