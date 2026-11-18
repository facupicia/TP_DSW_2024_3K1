const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const zod = require('zod');

test('event validation fully parses numeric strings and bounds text, IDs, prices and capacities', () => {
  const { updateEventSchema } = load('schemas/schema.event.ts', { zod });
  const parse = body => updateEventSchema.safeParse({ body, params: { id: '1' } });
  for (const value of ['abc', '5garbage', '', ' ', -1, Infinity, NaN, '0x10']) {
    assert.equal(parse({ ticketTypes: [{ id: 1, price: value }] }).success, false, String(value));
  }
  for (const value of [-1, '2.5', '2a', 2147483648]) assert.equal(parse({ ticketTypes: [{ id: 1, capacity: value }] }).success, false);
  for (const value of [0, -1, '1a', '1.5']) assert.equal(parse({ categoryId: value }).success, false);
  assert.equal(parse({ minAge: 100 }).success, false);
  assert.equal(parse({ title: 'x'.repeat(201) }).success, false);
  assert.equal(parse({ description: 'x'.repeat(10001) }).success, false);
  assert.equal(parse({ ticketTypes: [{ id: null, price: 10 }] }).success, false);
  const valid = parse({ categoryId: '2', minAge: '18', ticketTypes: [{ id: '1', price: '10.50', capacity: '20' }] });
  assert.equal(valid.success, true);
  assert.equal(valid.data.body.ticketTypes[0].price, 10.5);
  assert.equal(valid.data.body.ticketTypes[0].capacity, 20);
  assert.equal(valid.data.params.id, '1');
});

test('admin queries reject invalid dates, reversed or incomplete ranges and unbounded query values', () => {
  const { adminMetricsSchema } = load('schemas/schema.admin.ts', { zod });
  const parse = query => adminMetricsSchema.safeParse({ query });
  for (const query of [{ startDate: 'bad', endDate: 'bad' }, { startDate: '2026-02-30', endDate: '2026-03-01' },
    { startDate: '2026-01-01' }, { startDate: '2026-02-01', endDate: '2026-01-01' },
    { limit: '-5' }, { limit: '9999999' }, { limit: '10tail' }, { limit: ['1', '2'] }, { last: '0' }, { last: '367' }, { period: 'minute' }]) {
    assert.equal(parse(query).success, false, JSON.stringify(query));
  }
  const valid = parse({ startDate: '2026-01-01', endDate: '2026-02-01', limit: '50', period: 'month', last: '12' });
  assert.equal(valid.success, true);
  assert.equal(valid.data.query.limit, 50);
  assert.equal(parse({}).data.query.limit, 10);
});

test('admin validation rejects malformed requests before any service or cache call', async () => {
  const express = require('express');
  let serviceCalls = 0;
  const noop = (_req, _res, next) => next();
  const { adminRouter } = load('admin/admin.controller.ts', {
    express,
    '../schemas/schema.admin': load('schemas/schema.admin.ts', { zod }),
    '../common/middleware/schemaValidacion': load('common/middleware/schemaValidacion.ts', { zod }),
    '../common/middleware/authToken': { checkAuthToken: noop },
    '../common/middleware/checkRole': { checkRoleAuth: () => noop },
    './admin.service': { AdminService: class { async getOverview() { serviceCalls++; return {}; } } }
  });
  const app = express(); app.use('/api/admin', adminRouter);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/admin/metrics/overview`;
  try {
    assert.equal((await fetch(base + '?startDate=invalid&endDate=invalid')).status, 400);
    assert.equal((await fetch(base + '?limit=9999999')).status, 400);
    assert.equal(serviceCalls, 0);
    assert.equal((await fetch(base)).status, 200);
    assert.equal(serviceCalls, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('image uploads check file signatures, per-kind roles, multipart bounds and a dedicated quota', async () => {
  const express = require('express');
  let roles = ['user'], calls = 0;
  const controller = load('upload/upload.controller.ts', {
    './image-signature': load('upload/image-signature.ts'),
    './upload.service': { uploadImageBuffer: async () => { calls++; return { url: 'https://images.example/image.png' }; } }
  });
  const router = load('upload/upload.routes.ts', {
    express, multer: require('multer'), 'express-rate-limit': require('express-rate-limit'),
    '../common/middleware/rateLimit': { createRedisStore: () => undefined },
    '../common/middleware/authToken': { checkAuthToken: (req, _res, next) => { req.user = { id: 1, roles }; next(); } },
    '../common/middleware/checkRole': { checkRoleAuth: () => (_req, _res, next) => next() },
    './upload.controller': controller
  }).default;
  const app = express(); app.use('/upload', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/upload/image`;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/n8AAAAASUVORK5CYII=', 'base64');
  async function upload(kind, bytes = png, mime = 'image/png', extra = false) {
    const body = new FormData(); body.append('kind', kind); body.append('image', new Blob([bytes], { type: mime }), 'image.png');
    if (extra) body.append('unbounded', 'x'.repeat(100));
    return fetch(url, { method: 'POST', body });
  }
  try {
    assert.equal((await upload('event')).status, 403);
    assert.equal((await upload('product')).status, 403);
    assert.equal((await upload('profile', Buffer.from('<svg>fake</svg>'))).status, 400);
    assert.equal((await upload('profile', png, 'image/jpeg')).status, 400);
    assert.equal(calls, 0);
    assert.equal((await upload('profile')).status, 201);
    roles = ['organizer']; assert.equal((await upload('event')).status, 201);
    roles = ['admin']; assert.equal((await upload('product')).status, 201);
    assert.equal((await upload('profile', png, 'image/png', true)).status, 400);
    await upload('profile'); await upload('profile');
    assert.equal((await upload('profile')).status, 429);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('signature detection recognizes all accepted raster headers and rejects truncated or executable content', () => {
  const { detectImageMime } = load('upload/image-signature.ts');
  for (const [buffer, expected] of [[Buffer.from([255, 216, 255]), 'image/jpeg'],
    [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'], [Buffer.from('GIF89a'), 'image/gif'],
    [Buffer.from('RIFF0000WEBPVP8 '), 'image/webp'], [Buffer.from('MZfake'), null], [Buffer.from('GIF'), null],
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), null]]) assert.equal(detectImageMime(buffer), expected);
});

test('numeric transformer preserves nullability and refuses non-finite amounts', () => {
  const { numericTransformer: transformer } = load('common/utils/numeric-transformer.ts');
  assert.equal(transformer.from('10.50'), 10.5); assert.equal(transformer.from(null), null);
  assert.equal(transformer.to(undefined), undefined); assert.equal(transformer.to('25.00'), 25);
  assert.throws(() => transformer.from('NaN')); assert.throws(() => transformer.to(Infinity));
});

test('outbox polls immediately then uses the configured quieter interval and stops cleanly', async () => {
  let queries = 0, interval, cleared;
  const worker = load('queue/outbox.service.ts', {
    '../db': { query: async () => { queries++; return [[], 0]; } },
    '../config/env': { env: { OUTBOX_POLL_INTERVAL_MS: 7000 } }
  }, { setInterval: (_callback, milliseconds) => { interval = milliseconds; return 1; }, clearInterval: id => { cleared = id; } });
  worker.startOutboxWorker();
  assert.equal(interval, 7000);
  await worker.closeOutboxWorker();
  assert.equal(queries, 1); assert.equal(cleared, 1);
});
