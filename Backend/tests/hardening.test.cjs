const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, entities: E } = require('./helpers.cjs');

test('account claims reject reset tokens without consuming them', async () => {
  let mutations = 0;
  const link = { id: 1, userId: 3, purpose: 'reset', credentialsVersion: 2, expiresAt: new Date(Date.now() + 60000) };
  const user = { id: 3, active: true, isGuestAccount: true, credentialsVersion: 2 };
  const manager = {
    findOne: async (entity, options) => entity === E.AccountClaimToken
      ? (!options.where.purpose || options.where.purpose === link.purpose ? link : null)
      : user,
    update: async () => { mutations++; return { affected: 1 }; }
  };
  const claims = load('user/accountClaim.service.ts');
  assert.equal(await claims.consumeAccountClaimToken('reset-token', manager), null);
  assert.equal(mutations, 0);
});

test('claim validation rejects a link issued before a credentials change', async () => {
  const link = { purpose: 'claim', credentialsVersion: 1, expiresAt: new Date(Date.now() + 60000),
    user: { id: 3, active: true, isGuestAccount: true, credentialsVersion: 2 } };
  const claims = load('user/accountClaim.service.ts', {
    '../db': { getRepository: () => ({ findOne: async () => link }) }
  });
  assert.equal(await claims.findValidAccountClaimToken('old-link'), null);
});

test('a current claim can be validated and consumed exactly once', async () => {
  const user = { id: 3, active: true, isGuestAccount: true, credentialsVersion: 2 };
  const link = { id: 1, userId: 3, purpose: 'claim', credentialsVersion: 2, usedAt: null,
    expiresAt: new Date(Date.now() + 60000), user };
  const manager = {
    findOne: async entity => entity === E.AccountClaimToken ? (link.usedAt ? null : link) : user,
    update: async (_, criteria) => {
      if (criteria.id) { link.usedAt = new Date(); return { affected: 1 }; }
      return { affected: 0 };
    }
  };
  const claims = load('user/accountClaim.service.ts', {
    '../db': { getRepository: () => ({ findOne: async () => link }) }
  });
  assert.equal(await claims.findValidAccountClaimToken('current-link'), link);
  assert.equal(await claims.consumeAccountClaimToken('current-link', manager), user);
  assert.equal(await claims.consumeAccountClaimToken('current-link', manager), null);
});

test('malformed refresh cookies are rejected without querying the database or throwing', async () => {
  const sessions = load('common/services/sessionTokens.ts', {
    '../../db': { transaction() { throw new Error('unexpected database access'); } }
  });
  for (const raw of ['%', '%E0%A4%A', 'x'.repeat(513), '']) {
    let cleared = 0;
    const request = { headers: { cookie: 'other=value; eventlife_refresh=' + raw } };
    const response = { clearCookie() { cleared++; } };
    assert.equal(await sessions.rotateRefreshToken(request, response), null);
    await sessions.revokeRefreshToken(request, response);
    assert.equal(cleared, 1);
  }
});

test('guest invitation loads all requested ticket IDs with executable PostgreSQL SQL', async () => {
  const { PGlite } = require('@electric-sql/pglite');
  const { DataSource, EntitySchema, In } = require('typeorm');
  const source = new DataSource({ type: 'postgres', entities: [new EntitySchema({
    name: 'Ticket', target: E.Ticket, tableName: 'ticket', columns: { id: { type: Number, primary: true } }
  })] });
  await source.buildMetadatas();
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE ticket(id integer PRIMARY KEY); INSERT INTO ticket VALUES(1),(2),(3);');
    const event = { id: 5, title: 'Evento', date: '2027-01-01', time: '22:00', direccion: 'Lugar' };
    let delivered;
    const worker = load('queue/email.queue.ts', {
      typeorm: { In },
      '../db': { isInitialized: true, getRepository: () => ({ find: async options => {
        const [sql, params] = source.getRepository(E.Ticket).createQueryBuilder('guest').where(options.where).getQueryAndParameters();
        const result = await db.query(sql, params);
        return result.rows.map(row => ({ id: row.guest_id, qrCode: 'qr-' + row.guest_id,
          ticketType: { id: 7, name: 'General', event } }));
      } }) },
      '../common/services/mailer': { __esModule: true, default: async (email, tickets) => {
        delivered = { email, tickets }; return true;
      } }
    });
    await worker.deliverEmailJob({ type: 'send-guest-invitation', payload: {
      email: 'guest@example.com', ticketIds: [1, 2], ticketTypeId: 7, eventId: 5
    } });
    assert.equal(delivered.email, 'guest@example.com');
    assert.deepEqual(Array.from(delivered.tickets, ticket => ticket.ticketId).sort(), [1, 2]);
  } finally { await db.close(); }
});

test('outbox drain waits for siblings if recording a retry fails', async () => {
  let releaseSibling;
  const sibling = new Promise(resolve => { releaseSibling = resolve; });
  let retryFailed;
  const retryFailure = new Promise(resolve => { retryFailed = resolve; });
  const jobs = [{ id: 'one', kind: 'refund', payload: { refundRequestId: 'one' }, attempts: 0 },
    { id: 'two', kind: 'refund', payload: { refundRequestId: 'two' }, attempts: 0 }];
  const worker = load('queue/outbox.service.ts', {
    '../db': { query: async (sql) => {
      if (sql.includes('RETURNING id')) return [jobs, 2];
      if (sql.includes('attempts=$3')) { retryFailed(); throw new Error('retry storage unavailable'); }
      return [[], 1];
    } },
    '../payment/refund.service': { executeRefund: async id => {
      if (id === 'one') throw new Error('provider unavailable');
      await sibling;
    } }
  });
  let settled = false;
  let failure;
  const drain = worker.drainOutbox().then(() => { settled = true; }, error => { settled = true; failure = error; });
  try {
    await retryFailure;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false, 'must keep the batch active until every job finishes');
  } finally { releaseSibling(); await drain; }
  assert.equal(settled, true);
  assert.equal(failure.message, 'retry storage unavailable');
});

test('logger accepts circular context and redacts nested secrets regardless of key casing', () => {
  const lines = [];
  const { logger } = load('common/services/logger.ts', {
    '../../config/env': { env: { LOG_LEVEL: 'debug' } }
  }, { console: { log: line => lines.push(line), warn: line => lines.push(line), error: line => lines.push(line) } });
  const context = { nested: { ACCESSTOKEN: 'private-access', api_key: 'private-key', Authorization: 'private-auth' } };
  context.self = context;
  context.items = [context];
  logger.error('failure', context);
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0], /private-access|private-key|private-auth/);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.self, '[Circular]');
  assert.equal(entry.nested.ACCESSTOKEN, '[REDACTED]');
  assert.equal(entry.nested.api_key, '[REDACTED]');
});

test('logger preserves ordinary context and leaves the caller data untouched', () => {
  const lines = [];
  const { logger } = load('common/services/logger.ts', {
    '../../config/env': { env: { LOG_LEVEL: 'warn' } }
  }, { console: { log: line => lines.push(line), warn: line => lines.push(line), error: line => lines.push(line) } });
  const context = { id: 4, at: new Date('2026-11-17T12:00:00Z'),
    details: [{ current_password: 'private-password', count: 3 }] };
  logger.info('filtered', context);
  logger.warn('retry', context);
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.id, 4);
  assert.equal(entry.at, '2026-11-17T12:00:00.000Z');
  assert.equal(entry.details[0].current_password, '[REDACTED]');
  assert.equal(entry.details[0].count, 3);
  assert.equal(context.details[0].current_password, 'private-password');
});
