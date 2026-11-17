// Isolated PostgreSQL engine with the real TypeORM driver, entities and services.
// Provider modules and the application's configured DataSource never initialize.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const ts = require('typescript');
require('reflect-metadata');
const { DataSource } = require('typeorm');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../src');

async function businessFixture(overrides = {}) {
  // pg sends text parameters; preserve that encoding for booleans and JSON.
  const engine = new PGlite({ serializers: { 16: String, 114: String, 3802: String } });
  const cache = new Map();
  let source;
  const logger = { info() {}, warn() {}, error() {} };
  const bindings = {
    'common/services/logger.ts': { logger },
    'config/env.ts': { env: { NODE_ENV: 'test', MP_MODE: 'production', CLIENT_URL: 'https://app.example',
      CLIENT_URLS: 'https://app.example', APP_URL: 'https://api.example', JWT_REFRESH_DAYS: 30,
      ACCOUNT_CLAIM_TOKEN_HOURS: 24, SECRET_KEY: 'test-only-secret'.repeat(4) } },
    'common/utils/qr.ts': { generarQRUrl: async code => 'data:image/png;base64,' + Buffer.from(code).toString('base64') },
    'common/services/redis.ts': { getRedis: async () => null },
    'payment/mp-oauth.controller.ts': { refreshOrganizerToken: async () => 'fixture-organizer-token' },
    'payment/mp.config.ts': { getMPConfig: () => ({ accessToken: 'fixture-platform-token',
      notificationUrl: 'https://api.example/api/payment/webhook', appUrl: 'https://api.example' }),
      assertSandboxSeller: async () => {}, sanitizeUrl: value => value },
    'common/services/mailer.ts': { __esModule: true, default: async () => true },
    ...overrides
  };
  function load(relative) {
    const normalized = relative.replaceAll('\\', '/');
    if (normalized === 'db.ts' || normalized === 'config/database.ts') return { __esModule: true, get default() { return source; } };
    if (Object.hasOwn(bindings, normalized)) return bindings[normalized];
    const filename = path.resolve(root, normalized);
    if (!filename.startsWith(root + path.sep)) throw Error('Source outside fixture root');
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
      experimentalDecorators: true, emitDecoratorMetadata: true
    } }).outputText;
    const localRequire = id => id.startsWith('.')
      ? load(path.relative(root, path.resolve(path.dirname(filename), id)) + '.ts')
      : Object.hasOwn(overrides, id) ? overrides[id] : require(id);
    vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, Reflect,
      Buffer, URL, URLSearchParams, AbortSignal, Date, Boolean, Number, String, Object, Array,
      console, setInterval, clearInterval, setTimeout, clearTimeout,
      fetch: async () => { throw Error('External network disabled in business fixture'); } }, { filename });
    return module.exports;
  }
  // A single embedded connection. Pool leases serialize transactions, while all
  // query generation, hydration, constraints, rollback and writes are TypeORM's.
  let available = Promise.resolve();
  async function acquire() {
    const previous = available;
    let release;
    available = new Promise(resolve => { release = resolve; });
    await previous;
    return release;
  }
  class Pool extends EventEmitter {
    connect(callback) {
      const client = new EventEmitter();
      let transactionRelease;
      client.query = async (sql, params = []) => {
        const begins = /^\s*(BEGIN|START TRANSACTION)\b/i.test(sql);
        const ends = /^\s*(COMMIT|ROLLBACK)\s*;?\s*$/i.test(sql);
        const release = transactionRelease || await acquire();
        if (begins) transactionRelease = release;
        try {
          const result = await engine.query(sql, params.map(value => require('pg/lib/utils').prepareValue(value)));
          return { ...result, rowCount: result.affectedRows ?? result.rows.length,
            command: sql.trim().split(/\s/)[0].toUpperCase() };
        } finally {
          if (ends) { transactionRelease = undefined; release(); }
          else if (!transactionRelease) release();
        }
      };
      callback(null, client, () => { if (transactionRelease) { transactionRelease(); transactionRelease = undefined; } });
    }
    end(callback) { callback(); }
  }
  const entityFiles = fs.readdirSync(root, { recursive: true }).filter(file => file.endsWith('.entity.ts'));
  const entities = entityFiles.flatMap(file => Object.values(load(file))).filter(value =>
    typeof value === 'function' && require('typeorm').getMetadataArgsStorage().tables.some(table => table.target === value));
  source = new DataSource({ type: 'postgres', driver: { Pool }, entities: [...new Set(entities)],
    synchronize: true, installExtensions: false, uuidExtension: 'pgcrypto' });
  try { await source.initialize(); }
  catch (error) { await engine.close(); throw error; }
  return { source, engine, load, async close() { await source.destroy(); await engine.close(); } };
}

async function seedCommerce(fixture) {
  const { source, load } = fixture;
  const { User } = load('user/user.entity.ts');
  const { Event } = load('event/event.entity.ts');
  const { Category } = load('category/category.entity.ts');
  const { TicketType } = load('ticketType/ticketType.entity.ts');
  const { Product } = load('product/product.entity.ts');
  const { EventProduct } = load('extra/eventProduct.entity.ts');
  const userRepo = source.getRepository(User);
  const makeUser = (id, extra = {}) => userRepo.save(userRepo.create({ id, firstname: 'Test', lastname: 'User',
    phone: '1234567890', birth: '1990-01-01', email: `user${id}@example.com`, password: 'test-hash', active: true, ...extra }));
  const owner = await makeUser(7);
  const buyer = await makeUser(3);
  const scanner = await makeUser(9);
  const stranger = await makeUser(11);
  const category = await source.getRepository(Category).save({ name: 'Fixture', description: 'Test' });
  const instant = new Date(Date.now() + 60 * 60 * 1000);
  const event = await source.getRepository(Event).save({ title: 'Fixture event', description: 'Test',
    date: instant.toISOString().slice(0, 10), time: '22:00', startDateTime: instant,
    timeZone: 'America/Argentina/Buenos_Aires', user_id: owner.id, category,
    organizer: 'Fixture organizer', image: 'https://example.com/image.jpg',
    active: true, direccion: 'Test address' });
  const ticketType = await source.getRepository(TicketType).save({ event, name: 'General', price: 100,
    capacity: 10, soldCount: 0, status: 'active' });
  const product = await source.getRepository(Product).save({ organizerId: owner.id, name: 'Water', category: 'drink', basePrice: 20 });
  const eventProduct = await source.getRepository(EventProduct).save({ eventId: event.id, productId: product.id,
    eventPrice: 25, isActive: true, hasStock: true, stock: 10, soldCount: 0, maxPerOrder: 5 });
  return { owner, buyer, scanner, stranger, category, event, ticketType, product, eventProduct };
}

module.exports = { businessFixture, seedCommerce };
