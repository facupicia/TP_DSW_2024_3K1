const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { load, queryAdapter } = require('./helpers.cjs');
const rateEnv = { NODE_ENV: 'test', AUTH_RATE_LIMIT_WINDOW_MINUTES: 15, AUTH_RATE_LIMIT_MAX: 30,
  REFRESH_RATE_LIMIT_WINDOW_MINUTES: 15, REFRESH_RATE_LIMIT_MAX: 60 };

test('Redis failure and recovery preserve rate limits, including requests made before the outage', async () => {
  const express = require('express');
  const rateLimit = require('express-rate-limit');
  let healthy = true, count = 0, now = Date.now();
  class Clock extends Date { static now() { return now; } }
  const { ResilientRateLimitStore } = load('common/middleware/rateLimit.ts', {
    'express-rate-limit': rateLimit,
    '../../config/env': { env: rateEnv },
    'rate-limit-redis': {},
    '../services/redis': { getRedis: async () => null }
  }, { Date: Clock });
  const store = new ResilientRateLimitStore({
    increment: async () => { if (!healthy) throw Error('Redis down'); return { totalHits: ++count, resetTime: new Date(now + 60000) }; },
    decrement() {}, resetKey() {}
  }, 'test:');
  const app = express();
  app.use(rateLimit.rateLimit({ windowMs: 60000, limit: 2, store }));
  app.get('/', (_req, res) => res.sendStatus(200));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    assert.equal((await fetch(url)).status, 200);
    healthy = false;
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(url)).status, 429);
    healthy = true; now += 6000;
    assert.equal((await fetch(url)).status, 429);
  } finally { store.shutdown(); await new Promise(resolve => server.close(resolve)); }
});

test('a stalled Redis store falls back within a bounded time', async () => {
  const { ResilientRateLimitStore } = load('common/middleware/rateLimit.ts', {
    'express-rate-limit': require('express-rate-limit'), 'rate-limit-redis': {}, '../../config/env': { env: rateEnv }
  });
  const store = new ResilientRateLimitStore({ increment: () => new Promise(() => {}), decrement() {}, resetKey() {} }, 'slow:');
  store.init({ windowMs: 60000 });
  try { assert.equal((await store.increment('client')).totalHits, 1); }
  finally { store.shutdown(); }
});

test('health bypasses the global limiter and still reports database readiness', async () => {
  const express = require('express');
  let ready = true;
  const next = (_req, _res, proceed) => proceed();
  const deps = {
    express, helmet: require('helmet'), cors: require('cors'), morgan: () => next,
    './config/env': { env: { NODE_ENV: 'production', CLIENT_URL: 'https://app.example' } },
    './common/services/requestId': { requestId: next },
    './common/services/metrics': { metricsMiddleware: next, metricsHandler: next },
    './common/middleware/authToken': { checkAuthToken: next },
    './common/middleware/checkRole': { checkRoleAuth: () => next },
    './common/middleware/errorHandler': { errorHandler: (_error, _req, res, _next) => res.sendStatus(500) },
    './common/middleware/rateLimit': { globalRateLimiter: (_req, res) => res.sendStatus(429) },
    './db': { isInitialized: true, query: async () => { if (!ready) throw Error('DB down'); } },
    './admin/admin.controller': { adminRouter: express.Router() }
  };
  for (const module of ['user', 'event', 'ticket', 'ticketType', 'category', 'scanner', 'payment', 'subscription',
    'coupon', 'promoter', 'upload', 'product', 'extra']) deps[`./${module}/${module}.routes`] = express.Router();
  const app = load('app.ts', deps).default;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(url + '/health')).status, 200);
    assert.equal((await fetch(url + '/api/category')).status, 429);
    ready = false;
    assert.equal((await fetch(url + '/health')).status, 503);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('production API hides internal errors while retaining diagnostic messages and stacks in server logs', () => {
  const logs = [];
  const { errorHandler } = load('common/middleware/errorHandler.ts', {
    '../../config/env': { env: { NODE_ENV: 'production' } }, '../services/logger': { logger: { error: (...args) => logs.push(args) } }
  });
  const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  const error = Object.assign(new Error('relation payment_log missing'), { code: '42P01' });
  errorHandler(error, { method: 'GET', originalUrl: '/api/admin?token=private-link' }, response);
  assert.equal(response.statusCode, 500);
  assert.equal(JSON.stringify(response.body), JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Internal server error' }));
  assert.equal(logs[0][1].message, error.message);
  assert.equal(logs[0][1].stack, error.stack);
  assert.equal(logs[0][1].url, '/api/admin');
});

test('logout never returns provider or database error text', async () => {
  const controller = load('user/user.controller.ts', {
    '../common/services/sessionTokens': { revokeRefreshToken: async () => { throw Error('private database hostname'); } }
  });
  const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  await controller.logoutUser({}, response);
  assert.equal(response.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(response.body), /private database/);
});

test('every admin controller returns a generic response when its service fails', async () => {
  const { adminRouter } = load('admin/admin.controller.ts', {
    express: require('express'),
    '../schemas/schema.admin': { adminMetricsSchema: {} },
    '../common/middleware/schemaValidacion': { schemaValidation: () => (_req, _res, next) => next() },
    '../common/middleware/authToken': { checkAuthToken: (_req, _res, next) => next() },
    '../common/middleware/checkRole': { checkRoleAuth: () => (_req, _res, next) => next() },
    './admin.service': { AdminService: class { constructor() {
      return new Proxy({}, { get: () => async () => { throw Error('private SQL error'); } });
    } } }
  });
  let checked = 0;
  for (const layer of adminRouter.stack.filter(layer => layer.route?.methods.get && layer.route.path !== '/operations')) {
    const handler = layer.route.stack.at(-1).handle;
    const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    await handler({ query: {} }, response);
    assert.equal(response.statusCode, 500);
    assert.doesNotMatch(JSON.stringify(response.body), /private SQL/);
    checked++;
  }
  assert.ok(checked >= 10);
});

test('marketplace webhook reads the known organizer account before trying the platform', async () => {
  const tokens = [];
  const core = load('payment/payment.core.ts', {
    '../config/env': { env: { MP_MODE: 'production' } },
    './mp-oauth.controller': { refreshOrganizerToken: async () => 'organizer-token' },
    mercadopago: { MercadoPagoConfig: class { constructor({ accessToken }) { this.token = accessToken; } },
      Payment: class { constructor(client) { this.client = client; } async get() { tokens.push(this.client.token); return { status: 'pending' }; } } }
  });
  const result = await core.resolveWebhookPayment('payment', { external_reference: '3|7|code|uuid' });
  assert.equal(result.source, 'organizer');
  assert.deepEqual(tokens, ['organizer-token']);
});

test('outbox bounds provider failures without losing payload and accepts later payment state notifications', async () => {
  const db = new PGlite();
  let status = 'pending', fail = true, delivered = 0;
  try {
    await db.exec(`CREATE TABLE outbox_job(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text UNIQUE, kind text,
      payload jsonb, attempts integer DEFAULT 0, "availableAt" timestamptz DEFAULT NOW(), "lockedUntil" timestamptz,
      owner uuid, "processedAt" timestamptz, "failedAt" timestamptz, "lastError" text);`);
    const worker = load('queue/outbox.service.ts', {
      '../db': { query: queryAdapter(db) },
      '../payment/refund.service': { executeRefund: async () => { if (fail) throw Error('Provider unavailable'); } },
      '../payment/payment.core': { resolveWebhookPayment: async () => ({ payment: { status } }),
        processApprovedPayment: async () => { delivered++; return { success: true }; } }
    });
    await db.exec(`INSERT INTO outbox_job(key,kind,payload,attempts) VALUES('retry','refund','{"refundRequestId":"keep"}',${worker.MAX_OUTBOX_ATTEMPTS - 1})`);
    await worker.drainOutbox();
    const failed = (await db.query('SELECT * FROM outbox_job')).rows[0];
    assert.ok(failed.failedAt); assert.equal(failed.processedAt, null);
    assert.equal(failed.attempts, worker.MAX_OUTBOX_ATTEMPTS);
    assert.equal(failed.payload.refundRequestId, 'keep');
    await db.exec('UPDATE outbox_job SET "availableAt"=NOW()');
    fail = false; await worker.drainOutbox();
    assert.equal((await db.query('SELECT attempts FROM outbox_job')).rows[0].attempts, worker.MAX_OUTBOX_ATTEMPTS);
    for (const nextStatus of ['pending', 'in_process', 'approved']) {
      status = nextStatus;
      await db.query('INSERT INTO outbox_job(key,kind,payload) VALUES($1,\'payment\',\'{"paymentId":"same-payment"}\')', ['notification-' + status]);
      await worker.drainOutbox();
    }
    assert.equal(delivered, 1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM outbox_job WHERE "processedAt" IS NOT NULL')).rows[0].n, 3);
    // Explicit operator retry retains the same job and business idempotency key.
    await db.exec('UPDATE outbox_job SET "failedAt"=NULL,attempts=0,"availableAt"=NOW() WHERE key=\'retry\'');
    await worker.drainOutbox();
    assert.ok((await db.query('SELECT "processedAt" FROM outbox_job WHERE key=\'retry\'')).rows[0].processedAt);
  } finally { await db.close(); }
});
