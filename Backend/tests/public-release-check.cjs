// Non-financial HTTPS verification. No checkout, redemption or outbox job is created.
const assert = require('node:assert/strict');
const { createHmac, randomUUID } = require('node:crypto');
if (process.env.EVENTLIFE_ALLOW_PUBLIC_CHECK !== 'true') throw Error('Explicit EVENTLIFE_ALLOW_PUBLIC_CHECK=true required');
const base = process.env.EVENTLIFE_PUBLIC_CHECK_BASE_URL;
assert.ok(base?.startsWith('https://'), 'Provide the public HTTPS API URL');
const origin = process.env.CLIENT_URL;
let count = 0;
async function check(name, path, expected, options = {}) {
  const response = await fetch(base + path, {
    method: options.body ? 'POST' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'EventLife-release-verifier/1.0', Origin: origin,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  assert.equal(response.status, expected, `${name}: unexpected HTTP status`);
  await response.arrayBuffer();
  console.log(`PASS ${++count}: ${name} (${response.status})`);
  return response;
}
(async () => {
  await check('health', '/health', 200);
  await check('public events', '/api/event', 200);
  await check('subscription plans', '/api/subscription/plans', 200);
  for (const path of ['/metrics', '/api/admin/operations', '/api/scanner/history', '/api/extra/my-extras', '/api/user/profile']) {
    await check(`anonymous access denied ${path}`, path, 401);
  }
  await check('anonymous scan denied', '/api/scanner/validate', 401, { body: { code: 'invalid' } });
  const cors = await check('frontend CORS', '/api/event', 200);
  assert.equal(cors.headers.get('access-control-allow-origin'), origin);
  const denied = await check('foreign origin CORS', '/api/event', 200, { headers: { Origin: 'https://untrusted.invalid' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  for (const kind of ['payment', 'subscription']) {
    const path = `/api/${kind}/webhook`;
    const body = { type: 'configuration_check', data: { id: 'release-check' } };
    await check(`${kind} unsigned webhook rejected`, path, 401, { body });
    const secret = kind === 'subscription' ? process.env.MP_SUBSCRIPTION_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET : process.env.MP_WEBHOOK_SECRET;
    assert.ok(secret, `${kind} signing secret missing`);
    const ts = Math.floor(Date.now() / 1000), id = randomUUID();
    const hash = createHmac('sha256', secret).update(`id:release-check;request-id:${id};ts:${ts};`).digest('hex');
    await check(`${kind} signed ignored topic accepted`, path, 200, {
      body, headers: { 'x-request-id': id, 'x-signature': `ts=${ts},v1=${hash}` }
    });
  }
  console.log(`PUBLIC_RELEASE_CHECK_PASS count=${count}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
