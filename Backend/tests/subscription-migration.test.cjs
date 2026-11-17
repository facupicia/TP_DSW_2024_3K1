const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { load, queryAdapter } = require('./helpers.cjs');
const { SubscriptionInvariants1794943380000 } = load('database/migrations/1794943380000-subscription-invariants.ts');

test('subscription migration refuses duplicates without deleting or modifying financial history', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE user_subscription(id integer PRIMARY KEY,"userId" integer,status text,"externalSubscriptionId" text);
      INSERT INTO user_subscription VALUES(1,3,'active','one'),(2,3,'active','two');`);
    await assert.rejects(new SubscriptionInvariants1794943380000().up({ query: queryAdapter(db) }), /SUBSCRIPTION_DUPLICATES_REQUIRE_REVIEW/);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM user_subscription')).rows[0].n, 2);
    assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM user_subscription WHERE status='active'`)).rows[0].n, 2);
  } finally { await db.close(); }
});

test('subscription migration is repeatable and enforces active ownership and external ID uniqueness', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE user_subscription(id integer PRIMARY KEY,"userId" integer,status text,"externalSubscriptionId" text);
      INSERT INTO user_subscription VALUES(1,3,'active','one');`);
    const migration = new SubscriptionInvariants1794943380000();
    const runner = { query: queryAdapter(db) };
    await migration.up(runner); await migration.up(runner);
    await assert.rejects(db.exec(`INSERT INTO user_subscription VALUES(2,3,'active','two')`), error => error.code === '23505');
    await assert.rejects(db.exec(`INSERT INTO user_subscription VALUES(3,4,'active','one')`), error => error.code === '23505');
    await db.exec(`INSERT INTO user_subscription VALUES(4,3,'expired',NULL),(5,3,'cancelled',NULL)`);
    await migration.down(runner);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM user_subscription')).rows[0].n, 3);
  } finally { await db.close(); }
});

test('native business fixture refuses a URL that names the application database', async () => {
  const previous = process.env.EVENTLIFE_TEST_POSTGRES_URL;
  process.env.EVENTLIFE_TEST_POSTGRES_URL = 'postgres://fixture:unused@127.0.0.1/eventlife';
  try { await assert.rejects(require('./business-fixture.cjs').businessFixture(), /explicitly named eventlife_business_test/); }
  finally { if (previous === undefined) delete process.env.EVENTLIFE_TEST_POSTGRES_URL; else process.env.EVENTLIFE_TEST_POSTGRES_URL = previous; }
});

test('chargeback migration adds its financial status without rewriting existing payments', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TYPE payment_log_status_enum AS ENUM ('processing','completed','failed','refunded');
      CREATE TABLE payment_log(id integer PRIMARY KEY,status payment_log_status_enum);
      INSERT INTO payment_log VALUES(1,'completed');`);
    const { PaymentChargebackStatus1794945300000 } = load('database/migrations/1794945300000-payment-chargeback-status.ts');
    const migration = new PaymentChargebackStatus1794945300000();
    await migration.up({ query: queryAdapter(db) }); await migration.up({ query: queryAdapter(db) });
    await db.exec(`INSERT INTO payment_log VALUES(2,'charged_back')`);
    assert.equal((await db.query('SELECT status FROM payment_log WHERE id=1')).rows[0].status, 'completed');
    await assert.rejects(migration.down(), /preserve financial history/);
  } finally { await db.close(); }
});
