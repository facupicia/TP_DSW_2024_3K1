const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const ts = require('typescript');
const { DataSource, MigrationExecutor } = require('typeorm');
const { PGlite } = require('@electric-sql/pglite');

function load(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, Object,
    require: id => id.startsWith('.')
      ? load(path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(filename), id)) + '.ts')
      : require(id) }, { filename });
  return module.exports;
}
const { OrderedMigrationExecutor } = load('database/ordered-migration-executor.ts');
const { OrderedDataSource } = load('database/ordered-data-source.ts');
function historicalMigrations() {
  return fs.readdirSync(path.resolve(__dirname, '../src/database/migrations'))
    .filter(name => /^\d.*\.ts$/.test(name))
    .flatMap(name => Object.values(load('database/migrations/' + name)))
    .filter(value => typeof value === 'function');
}
async function fixture(migrations) {
  const db = new PGlite();
  class Pool extends EventEmitter {
    connect(callback) {
      const client = new EventEmitter();
      client.query = async (sql, params = []) => {
        const result = await db.query(sql, params.map(value => require('pg/lib/utils').prepareValue(value)));
        return { ...result, rowCount: result.affectedRows ?? result.rows.length,
          command: sql.trim().split(/\s/)[0].toUpperCase() };
      };
      callback(null, client, () => {});
    }
    end(callback) { callback(); }
  }
  const source = new OrderedDataSource({ type: 'postgres', driver: { Pool }, entities: [], migrations,
    installExtensions: false, migrationsTransactionMode: 'each' });
  await source.initialize();
  return { source, db, async close() { await source.destroy(); await db.close(); } };
}

test('historical migrations use dependency order while retaining every original ledger identity', async () => {
  const source = new DataSource({ type: 'postgres' });
  source.migrations = historicalMigrations().map(Migration => new Migration());
  const original = await new MigrationExecutor(source).getAllMigrations();
  const ordered = await new OrderedMigrationExecutor(source).getAllMigrations();
  const index = name => ordered.findIndex(m => m.name.startsWith(name));
  assert.ok(index('AddTicketDeletedAt') < index('FixAudit'));
  assert.ok(index('FixAudit') < index('AddPaymentLogItems'));
  assert.ok(index('AddEventExtras') < index('FixProPlanExtras'));
  assert.ok(index('AddEventStartDateTime') < index('DurableCommerce'));
  for (const migration of ordered) {
    const old = original.find(other => other.name === migration.name);
    assert.equal(migration.timestamp, old.timestamp);
    assert.equal(migration.instance, old.instance);
  }
  assert.equal(original.find(m => m.name.startsWith('AddEventStartDateTime')).timestamp, 260529120000);
});

test('new calendar suffixes are rejected instead of silently interpreting them as 1978', async () => {
  const source = new DataSource({ type: 'postgres' });
  source.migrations = [{ name: 'NewSchema20261118123000', up() {}, down() {} }];
  await assert.rejects(new OrderedMigrationExecutor(source).getAllMigrations(), /13-digit Unix timestamp/);
});

test('run/show/revert execute historical SQL against a legacy schema without rewriting ledger timestamps', async () => {
  const migrations = historicalMigrations().filter(Migration =>
    /^(AddTicketDeletedAt|FixAudit|AddEventExtras|FixProPlanExtras)/.test(Migration.name));
  const f = await fixture(migrations);
  try {
    await f.db.exec(`CREATE TABLE "user"(id serial PRIMARY KEY,"mpUserId" varchar);
      CREATE TABLE payment_log(id serial PRIMARY KEY);
      CREATE TABLE ticket(id serial PRIMARY KEY);
      CREATE TABLE event(id serial PRIMARY KEY,title varchar);
      CREATE TABLE subscription_plan(id serial PRIMARY KEY,name varchar);
      INSERT INTO subscription_plan(name) VALUES('FREE'),('PRO');`);
    assert.equal(await f.source.showMigrations(), true);
    const executed = await f.source.runMigrations();
    assert.deepEqual(Array.from(executed, migration => migration.name), [
      'AddTicketDeletedAt20260507170000', 'FixAudit20261778783070689',
      'AddEventExtras20260521194600', 'FixProPlanExtras20260521150000'
    ]);
    const plans = (await f.db.query('SELECT name,"canSellExtras" FROM subscription_plan ORDER BY name')).rows;
    assert.deepEqual(plans, [{ name: 'FREE', canSellExtras: false }, { name: 'PRO', canSellExtras: true }]);
    const before = (await f.db.query('SELECT * FROM migrations ORDER BY id')).rows;
    assert.equal(Number(before[3].timestamp), 260521150000);
    assert.equal(await f.source.showMigrations(), false);
    assert.equal((await f.source.runMigrations()).length, 0);
    assert.deepEqual((await f.db.query('SELECT * FROM migrations ORDER BY id')).rows, before);

    await f.source.undoLastMigration({ transaction: 'each' });
    assert.deepEqual((await f.db.query('SELECT * FROM migrations ORDER BY id')).rows, before.slice(0, -1));
    assert.equal((await f.db.query(`SELECT "canSellExtras" FROM subscription_plan WHERE name='PRO'`)).rows[0].canSellExtras, false);
    assert.equal(await f.source.showMigrations(), true);
    const rerun = await f.source.runMigrations({ transaction: 'each' });
    assert.deepEqual(Array.from(rerun, migration => migration.name), ['FixProPlanExtras20260521150000']);
  } finally { await f.close(); }
});

test('an existing historical ledger is recognized without changing schema or replaying migrations', async () => {
  const f = await fixture(historicalMigrations());
  try {
    await f.source.showMigrations();
    const ledger = await new MigrationExecutor(f.source).getAllMigrations();
    for (const migration of ledger) {
      await f.source.query('INSERT INTO migrations(timestamp,name) VALUES($1,$2)', [migration.timestamp, migration.name]);
    }
    const before = (await f.db.query('SELECT * FROM migrations ORDER BY id')).rows;
    assert.equal(await f.source.showMigrations(), false);
    assert.equal((await f.source.runMigrations()).length, 0);
    assert.deepEqual((await f.db.query('SELECT * FROM migrations ORDER BY id')).rows, before);
  } finally { await f.close(); }
});

test('a partially migrated legacy database keeps old rows and runs only its missing dependencies', async () => {
  const migrations = historicalMigrations().filter(Migration =>
    /^(FixAudit|AddEventExtras|FixProPlanExtras)/.test(Migration.name));
  const f = await fixture(migrations);
  try {
    // FixAudit is already applied. Replaying its non-idempotent ALTERs would fail.
    await f.db.exec(`CREATE TABLE "user"(id serial PRIMARY KEY,"mpUserId" varchar UNIQUE);
      CREATE TABLE payment_log(id serial PRIMARY KEY,"deletedAt" timestamptz);
      CREATE TABLE ticket(id serial PRIMARY KEY,"paymentLogId" integer REFERENCES payment_log(id));
      CREATE TABLE event(id serial PRIMARY KEY,title varchar);
      CREATE INDEX idx_event_title ON event(title);
      CREATE TABLE subscription_plan(id serial PRIMARY KEY,name varchar);
      INSERT INTO subscription_plan(name) VALUES('PRO');`);
    await f.source.showMigrations();
    await f.source.query('INSERT INTO migrations(timestamp,name) VALUES($1,$2)',
      [1778783070689, 'FixAudit20261778783070689']);
    const old = (await f.db.query('SELECT * FROM migrations')).rows[0];
    const executed = await f.source.runMigrations();
    assert.deepEqual(Array.from(executed, migration => migration.name),
      ['AddEventExtras20260521194600', 'FixProPlanExtras20260521150000']);
    assert.deepEqual((await f.db.query('SELECT * FROM migrations WHERE id=$1', [old.id])).rows[0], old);
    assert.equal((await f.db.query('SELECT "canSellExtras" FROM subscription_plan')).rows[0].canSellExtras, true);
    assert.equal(await f.source.showMigrations(), false);
  } finally { await f.close(); }
});

test('fake and transaction options remain compatible with TypeORM CLI semantics', async () => {
  class Probe1795000000000 {
    transaction = false;
    async up(queryRunner) { await queryRunner.query('CREATE TABLE probe(id integer)'); }
    async down(queryRunner) { await queryRunner.query('DROP TABLE probe'); }
  }
  const f = await fixture([Probe1795000000000]);
  try {
    await assert.rejects(f.source.runMigrations({ transaction: 'all' }), /transaction mode is "all"/);
    await f.source.runMigrations({ transaction: 'none', fake: true });
    assert.equal((await f.db.query(`SELECT to_regclass('probe') AS name`)).rows[0].name, null);
    assert.equal(await f.source.showMigrations(), false);
    await f.source.undoLastMigration({ transaction: 'none', fake: true });
    assert.equal((await f.db.query('SELECT * FROM migrations')).rows.length, 0);
    await f.source.runMigrations({ transaction: 'each' });
    assert.equal((await f.db.query(`SELECT to_regclass('probe') AS name`)).rows[0].name, 'probe');
    await f.source.undoLastMigration();
    assert.equal((await f.db.query(`SELECT to_regclass('probe') AS name`)).rows[0].name, null);
    await f.source.runMigrations({ transaction: 'each' });
    assert.equal((await f.db.query(`SELECT to_regclass('probe') AS name`)).rows[0].name, 'probe');
    await f.source.undoLastMigration({ transaction: 'each' });
    assert.equal((await f.db.query(`SELECT to_regclass('probe') AS name`)).rows[0].name, null);
  } finally { await f.close(); }
});

test('DataSource migration methods reject a disconnected instance', async () => {
  const source = new OrderedDataSource({ type: 'postgres' });
  for (const operation of ['showMigrations', 'runMigrations', 'undoLastMigration']) {
    await assert.rejects(source[operation](), /not yet established/);
  }
});
