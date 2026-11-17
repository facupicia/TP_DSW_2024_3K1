const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');

function sandboxConfig(fetch) {
  return load('payment/mp.config.ts', {
    '../config/env': { env: { MP_MODE: 'sandbox', MP_ACCESS_TOKEN: 'APP_USR-test', MP_CLIENT_ID: 'test', MP_CLIENT_SECRET: 'test' } }
  }, { fetch });
}

test('sandbox permits a verified test seller with APP_USR credentials', async () => {
  const config = sandboxConfig(async (url, options) => {
    assert.equal(url, 'https://api.mercadopago.com/users/me');
    assert.equal(options.headers.Authorization, 'Bearer APP_USR-test');
    return { ok: true, json: async () => ({ id: 42, tags: ['test_user'] }) };
  });
  await config.assertSandboxSeller();
});

test('sandbox rejects a real seller or an unavailable account verification', async () => {
  await assert.rejects(sandboxConfig(async () => ({ ok: true, json: async () => ({ tags: [] }) })).assertSandboxSeller(), /MP_SANDBOX_REQUIRES_TEST_SELLER/);
  await assert.rejects(sandboxConfig(async () => ({ ok: false })).assertSandboxSeller(), /MP_SANDBOX_SELLER_UNAVAILABLE/);
});

test('sandbox webhook accepts test-seller payments including live_mode=true and rejects another collector', async () => {
  for (const collector_id of [42, 999, undefined]) {
    const core = load('payment/payment.core.ts', {
      '../config/env': { env: { MP_MODE: 'sandbox' } },
      './mp.config': { getMPConfig: () => ({accessToken:'test'}), assertSandboxSeller: async () => '42' },
      'mercadopago': {
        MercadoPagoConfig: class {},
        Payment: class { async get() { return { id: 1, status: 'approved', live_mode: true, collector_id }; } }
      },
      './mp-oauth.controller': { refreshOrganizerToken: async () => { assert.fail('Organizer credentials accessed'); } },
      '../db': { getRepository: () => { assert.fail('Organizer lookup attempted'); } }
    });
    const result = await core.resolveWebhookPayment('1');
    if (collector_id === 42) assert.equal(result.payment.live_mode, true);
    else assert.equal(result, null);
  }
});

test('sandbox status reports readiness separately from organizer connection and blocks OAuth', async () => {
  let verified = 0;
  const controller = load('payment/mp-oauth.controller.ts', {
    '../config/env': { env: { MP_MODE: 'sandbox' } },
    './mp.config': { assertSandboxSeller: async () => { verified++; } },
    '../db': { getRepository: () => ({ findOne: async () => ({ id: 1, mpUserId: null, mpTokenExpiresAt: null }) }) }
  });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.getMpStatus({ user: { id: 1 } }, res);
  assert.equal(verified, 1);
  assert.equal(res.body.sandboxReady, true);
  assert.equal(res.body.connected, false);
  await controller.initiateOAuth({ user: { id: 1 } }, res);
  assert.equal(res.code, 409);
  assert.equal(res.body.code, 'MP_SANDBOX_PLATFORM_SELLER');
});

test('sandbox event creation rejects an unverified seller before opening a transaction', async () => {
  const service = load('event/event.service.ts', {
    '../config/env': { env: { MP_MODE: 'sandbox' } },
    '../payment/mp.config': { assertSandboxSeller: async () => { throw Error('MP_SANDBOX_REQUIRES_TEST_SELLER'); } },
    '../db': { createQueryRunner: () => { assert.fail('Transaction opened before verification'); } }
  });
  await assert.rejects(service.create(1, {}), /MP_SANDBOX_REQUIRES_TEST_SELLER/);
});
