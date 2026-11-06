import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_ID, MIN_REMAINING_SECONDS, verifyAccess } from '../scripts/verify-cloudflare-deploy-access.mjs';

const NOW = Date.parse('2026-11-06T09:30:00Z');
const SENTINEL = 'unit-test-fake-value-never-a-real-credential';
const good = { status: 'active', expires_on: '2026-11-07T09:30:00Z', not_before: '2026-11-05T00:00:00Z' };
const environment = { CLOUDFLARE_API_TOKEN: SENTINEL, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID, DUKEFANTASY_CLOUDFLARE_TOKEN_KIND: 'user' };
const json = (result, extra = {}, init = {}) => new Response(JSON.stringify({ success: true, errors: [], result, ...extra }), init);

async function run({ env = {}, state = {}, first, second, failFetch = false, proxyEnabled, clock = () => NOW, afterTargetRequest = () => {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (failFetch) throw new Error(`Sensitive simulated upstream error ${SENTINEL}`);
    if (calls.length === 1) return first ?? json({ ...good, ...state });
    afterTargetRequest();
    return second ?? json({ deployments: [{ id: 'fake-deployment' }] });
  };
  const report = await verifyAccess({ env: { ...environment, ...env }, fetchImpl, clock, proxyEnabled });
  assert.ok(!JSON.stringify(report).includes(SENTINEL), 'credential must never enter a report');
  return { report, calls };
}

test('active expiring token checks only the intended host and existing Worker with GET', async () => {
  const { report, calls } = await run();
  assert.equal(report.status, 'PASS');
  assert.equal(report.writePermission, 'NOT_PROVEN_BY_READ_CHECK');
  assert.equal(report.deploymentPerformed, false);
  assert.deepEqual(calls.map(c => c.url), [
    'https://api.cloudflare.com/client/v4/user/tokens/verify',
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/dukefantasy/deployments`,
  ]);
  for (const { options } of calls) {
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${SENTINEL}`);
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test('account-owned token uses the account verifier without endpoint guessing', async () => {
  const { report, calls } = await run({ env: { DUKEFANTASY_CLOUDFLARE_TOKEN_KIND: 'account' } });
  assert.equal(report.status, 'PASS');
  assert.equal(calls[0].url, `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/tokens/verify`);
});

for (const [name, env, code] of [
  ['absent token', { CLOUDFLARE_API_TOKEN: '' }, 'MISSING_OR_INVALID_TOKEN_BINDING'],
  ['master alias alone', { CLOUDFLARE_API_TOKEN: undefined, MASTER_DEPLOY_TOKEN: SENTINEL }, 'MISSING_OR_INVALID_TOKEN_BINDING'],
  ['header injection', { CLOUDFLARE_API_TOKEN: 'fake\r\nvalue' }, 'MISSING_OR_INVALID_TOKEN_BINDING'],
  ['missing account', { CLOUDFLARE_ACCOUNT_ID: '' }, 'ACCOUNT_MISSING_OR_MISMATCH'],
  ['wrong account', { CLOUDFLARE_ACCOUNT_ID: '00000000000000000000000000000000' }, 'ACCOUNT_MISSING_OR_MISMATCH'],
  ['unknown issuer kind', { DUKEFANTASY_CLOUDFLARE_TOKEN_KIND: undefined }, 'TOKEN_KIND_REQUIRED'],
  ['disabled TLS', { NODE_TLS_REJECT_UNAUTHORIZED: '0' }, 'TLS_VERIFICATION_REQUIRED'],
]) test(`${name} stops before any request`, async () => {
  const { report, calls } = await run({ env });
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.code, code);
  assert.equal(calls.length, 0);
});

for (const [name, state, code] of [
  ['disabled', { status: 'disabled' }, 'TOKEN_NOT_ACTIVE'],
  ['expired status', { status: 'expired' }, 'TOKEN_NOT_ACTIVE'],
  ['expired timestamp', { expires_on: '2026-11-06T09:29:59Z' }, 'TOKEN_EXPIRED'],
  ['near expiry', { expires_on: '2026-11-06T10:00:00Z' }, 'INSUFFICIENT_REMAINING_LIFETIME'],
  ['future not-before', { not_before: '2026-11-06T09:30:01Z' }, 'TOKEN_NOT_YET_VALID'],
  ['missing expiry', { expires_on: undefined }, 'EXPIRY_UNPROVEN'],
  ['null expiry', { expires_on: null }, 'EXPIRY_UNPROVEN'],
  ['malformed expiry', { expires_on: SENTINEL }, 'INVALID_EXPIRY'],
  ['ambiguous date', { expires_on: '11/07/2026' }, 'INVALID_EXPIRY'],
  ['malformed not-before', { not_before: SENTINEL }, 'INVALID_NOT_BEFORE'],
  ['unrecognized status', { status: SENTINEL }, 'TOKEN_NOT_ACTIVE'],
]) test(`${name} cannot pass the token gate`, async () => {
  const { report, calls } = await run({ state });
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.code, code);
  assert.equal(calls.length, 1);
});

test('optional not-before may be absent; a known sufficiently future expiry is still required', async () => {
  assert.equal((await run({ state: { not_before: undefined } })).report.status, 'PASS');
});
test('minimum lifetime and activation boundaries are inclusive', async () => {
  const state = { expires_on: new Date(NOW + MIN_REMAINING_SECONDS * 1000).toISOString(), not_before: new Date(NOW).toISOString() };
  assert.equal((await run({ state })).report.status, 'PASS');
});
test('clock disagreement with issuer blocks verification', async () => {
  const first = json(good, {}, { headers: { date: 'Thu, 05 Nov 2026 09:30:00 GMT' } });
  assert.equal((await run({ first })).report.code, 'CLOCK_UNTRUSTED');
});
for (const status of [301, 401, 403, 429, 500]) test(`HTTP ${status} fails without disclosing the body or trying a different endpoint`, async () => {
  const { report, calls } = await run({ first: new Response(SENTINEL, { status }) });
  assert.equal(report.code, `HTTP_${status}`);
  assert.equal(calls.length, 1);
});
test('issuer rejection cannot be overridden by active status in the same response', async () => {
  assert.equal((await run({ first: json(good, { success: false }) })).report.code, 'API_REJECTED_OR_INVALID_RESPONSE');
});
test('upstream error messages are not reported', async () => {
  assert.equal((await run({ first: json(good, { errors: [{ message: SENTINEL }] }) })).report.code, 'API_REJECTED_OR_INVALID_RESPONSE');
});
test('target denial blocks access despite a valid token', async () => {
  const { report, calls } = await run({ second: new Response(SENTINEL, { status: 403 }) });
  assert.equal(report.code, 'HTTP_403');
  assert.equal(calls.length, 2);
});
test('a missing existing deployment blocks the handoff gate', async () => {
  assert.equal((await run({ second: json({ deployments: [] }) })).report.code, 'EXISTING_DEPLOYMENT_NOT_CONFIRMED');
});
test('malformed upstream JSON is not logged', async () => {
  assert.equal((await run({ first: new Response(SENTINEL) })).report.code, 'INVALID_OR_INCOMPLETE_RESPONSE');
});
test('oversized upstream bodies are bounded', async () => {
  assert.equal((await run({ first: new Response('x'.repeat(256 * 1024 + 1)) })).report.code, 'RESPONSE_TOO_LARGE');
});
test('network exceptions never disclose secrets', async () => {
  assert.equal((await run({ failFetch: true })).report.code, 'NETWORK_TLS_OR_REDIRECT_FAILURE');
});
test('configured proxies require native proxy support', async () => {
  const { report, calls } = await run({ env: { HTTPS_PROXY: 'http://proxy.invalid:8080' }, proxyEnabled: false });
  assert.equal(report.code, 'ENV_PROXY_SUPPORT_REQUIRED');
  assert.equal(calls.length, 0);
});
test('proxy placeholders are passed through the normal authorized path', async () => {
  const { report, calls } = await run({ env: { HTTPS_PROXY: 'http://proxy.invalid:8080', CLOUDFLARE_API_TOKEN: 'fake-proxy-placeholder' }, proxyEnabled: true });
  assert.equal(report.status, 'PASS');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fake-proxy-placeholder');
});
test('expiry is checked again after the Worker request', async () => {
  let now = NOW;
  const clock = () => now;
  const afterTargetRequest = () => { now += 24 * 60 * 60 * 1000; };
  assert.equal((await run({ clock, afterTargetRequest })).report.code, 'TOKEN_EXPIRED');
});
