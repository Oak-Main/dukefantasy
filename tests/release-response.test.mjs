import assert from "node:assert/strict";
import test from "node:test";
import { fetchReleaseResponse } from "../scripts/release-response.mjs";

const response = (version, revision, status = 200) => new Response("body", { status, headers: { "x-content-version": version, "x-content-revision": revision } });
const expected = { version: "2026-10-23", revision: "checked-candidate", delayMs: 0, wait: async () => {} };

test("release retries reject an excessive or invalid request count before any fetch", async () => {
  let calls = 0;
  for (const attempts of [17, 0, -1, 1.5, Number.NaN, Infinity, "16"]) {
    await assert.rejects(fetchReleaseResponse("https://example.com/", { ...expected, attempts, request: async () => { calls++; return response(expected.version, expected.revision); } }), RangeError);
  }
  assert.equal(calls, 0);
});

test("release smoke waits for the exact revision after an older route response", async () => {
  const older = response("2026-10-22", "old"), current = response(expected.version, expected.revision);
  let calls = 0, waits = 0;
  const result = await fetchReleaseResponse("https://example.com/scores", { ...expected, request: async () => ++calls === 1 ? older : current, wait: async () => { waits++; } });
  assert.equal(result, current);
  assert.equal(calls, 2);
  assert.equal(waits, 1);
  assert.equal(older.body.locked, false);
  assert.equal(older.bodyUsed, true);
});

test("a previous publication on the same day never passes the bounded gate", async () => {
  let calls = 0;
  await assert.rejects(fetchReleaseResponse("https://example.com/scores", { ...expected, attempts: 3, request: async () => { calls++; return response(expected.version, "different-content"); } }), /did not converge after 3 requests/);
  assert.equal(calls, 3);
});

test("matching revision with the wrong source date does not pass", async () => {
  await assert.rejects(fetchReleaseResponse("https://example.com/", { ...expected, attempts: 1, request: async () => response("2026-10-22", expected.revision) }), /did not converge/);
});

test("HTTP errors are returned immediately for the existing smoke assertion", async () => {
  let calls = 0;
  const result = await fetchReleaseResponse("https://example.com/", { ...expected, request: async () => { calls++; return response(null, null, 503); } });
  assert.equal(result.status, 503);
  assert.equal(calls, 1);
});

test("transport failure is not hidden by revision retries", async () => {
  let calls = 0;
  await assert.rejects(fetchReleaseResponse("https://example.com/", { ...expected, request: async () => { calls++; throw new Error("network unavailable"); } }), /network unavailable/);
  assert.equal(calls, 1);
});
