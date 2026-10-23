/** Wait briefly for a deployed revision to reach each public route. Never accept
 * an older revision, even when its calendar date is the same as the candidate. */
export async function fetchReleaseResponse(url, {
  version, revision, attempts = 16, delayMs = 2_000,
  request = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 16) throw new RangeError("Release response attempts must be an integer from 1 to 16");
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await request(url, { signal: AbortSignal.timeout(30_000), redirect: "manual" });
    // HTTP failures still fail immediately in the smoke caller.
    if (response.status !== 200) return response;
    if (response.headers.get("x-content-version") === version && response.headers.get("x-content-revision") === revision) return response;
    const observed = `${response.headers.get("x-content-version")}/${response.headers.get("x-content-revision")}`;
    await response.body?.cancel();
    if (attempt === attempts) throw new Error(`${url}: release did not converge after ${attempts} requests; expected ${version}/${revision}, observed ${observed}`);
    await wait(delayMs);
  }
  throw new Error("Release response requires at least one attempt");
}
