// Read-only credential gate. Never prints credentials, upstream bodies, or errors.
// Run with Node 22.23+ and --use-env-proxy. No dependencies or file writes.
import { pathToFileURL } from 'node:url';

export const ACCOUNT_ID = '820e7cee61fccc60d14c8e20bc686942';
export const WORKER = 'dukefantasy';
export const MIN_REMAINING_SECONDS = 90 * 60;
const API = 'https://api.cloudflare.com/client/v4';
const MAX_BYTES = 256 * 1024;

class CheckFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new CheckFailure(code); };

function timestamp(value, code) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail(code);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) fail(code);
  return time;
}

function validity(result, now) {
  if (result.status !== 'active') fail('TOKEN_NOT_ACTIVE');
  if (result.expires_on === undefined || result.expires_on === null) fail('EXPIRY_UNPROVEN');
  const expires = timestamp(result.expires_on, 'INVALID_EXPIRY');
  if (result.not_before !== undefined && result.not_before !== null && timestamp(result.not_before, 'INVALID_NOT_BEFORE') > now) fail('TOKEN_NOT_YET_VALID');
  if (expires <= now) fail('TOKEN_EXPIRED');
  if (expires - now < MIN_REMAINING_SECONDS * 1000) fail('INSUFFICIENT_REMAINING_LIFETIME');
  return new Date(expires).toISOString();
}

async function request(path, token, fetchImpl, clock) {
  let response;
  try {
    response = await fetchImpl(API + path, {
      method: 'GET', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  } catch { fail('NETWORK_TLS_OR_REDIRECT_FAILURE'); }
  if (!response.ok) fail(`HTTP_${response.status}`);
  const serverDate = response.headers.get('date');
  if (serverDate !== null) {
    const serverTime = Date.parse(serverDate);
    if (!Number.isFinite(serverTime) || Math.abs(serverTime - clock()) > 300000) fail('CLOCK_UNTRUSTED');
  }
  let document;
  try {
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        fail('RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
    }
    document = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof CheckFailure) throw error;
    fail('INVALID_OR_INCOMPLETE_RESPONSE');
  }
  if (document?.success !== true || !document.result || typeof document.result !== 'object') fail('API_REJECTED_OR_INVALID_RESPONSE');
  if (document.errors !== undefined && (!Array.isArray(document.errors) || document.errors.length)) fail('API_REJECTED_OR_INVALID_RESPONSE');
  return document.result;
}

export async function verifyAccess({ env = process.env, fetchImpl = globalThis.fetch, clock = Date.now, proxyEnabled = process.execArgv.includes('--use-env-proxy') || env.NODE_USE_ENV_PROXY === '1' } = {}) {
  // Only constant fields and normalized timestamps enter the report.
  const report = {
    check: 'cloudflare-token-validity-and-existing-worker-read',
    checkedAt: new Date(clock()).toISOString(),
    accountId: ACCOUNT_ID, worker: WORKER,
    minimumRemainingSeconds: MIN_REMAINING_SECONDS,
    writePermission: 'NOT_PROVEN_BY_READ_CHECK', deploymentPerformed: false,
  };
  try {
    if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') fail('TLS_VERIFICATION_REQUIRED');
    const hasProxy = ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy'].some(key => Boolean(env[key]));
    if (hasProxy && !proxyEnabled) fail('ENV_PROXY_SUPPORT_REQUIRED');
    const token = env.CLOUDFLARE_API_TOKEN;
    if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) fail('MISSING_OR_INVALID_TOKEN_BINDING');
    // MASTER_DEPLOY_TOKEN is deliberately never consumed. Classify it locally first.
    if (env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT_ID) fail('ACCOUNT_MISSING_OR_MISMATCH');
    const kind = env.DUKEFANTASY_CLOUDFLARE_TOKEN_KIND;
    if (kind !== 'user' && kind !== 'account') fail('TOKEN_KIND_REQUIRED');
    const path = kind === 'account' ? `/accounts/${ACCOUNT_ID}/tokens/verify` : '/user/tokens/verify';
    const tokenState = await request(path, token, fetchImpl, clock);
    validity(tokenState, clock());
    const deploymentState = await request(`/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER}/deployments`, token, fetchImpl, clock);
    if (!Array.isArray(deploymentState.deployments) || deploymentState.deployments.length === 0) fail('EXISTING_DEPLOYMENT_NOT_CONFIRMED');
    // Recheck the remaining lifetime after both requests.
    const expiresAt = validity(tokenState, clock());
    return { ...report, checkedAt: new Date(clock()).toISOString(), status: 'PASS', tokenKind: kind, expiresAt, targetRead: 'PASS' };
  } catch (error) {
    return { ...report, status: 'BLOCKED', code: error instanceof CheckFailure ? error.code : 'CHECK_FAILED' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await verifyAccess();
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}
