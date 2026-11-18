const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { businessFixture, seedCommerce } = require('./business-fixture.cjs');
let f, data;
before(async () => { f = await businessFixture(); data = await seedCommerce(f); });
after(async () => { if (f) await f.close(); });

test('all numeric and decimal entities hydrate numbers and preserve nullable fields', async () => {
  const numericColumns = f.source.entityMetadatas.flatMap(entity => entity.columns.filter(column => ['numeric', 'decimal'].includes(column.type)));
  assert.ok(numericColumns.length >= 20);
  assert.ok(numericColumns.every(column => column.transformer), 'every decimal has a transformer');
  const { PromoterGroup } = f.load('promoter/promoter.entity.ts');
  const { SubscriptionPlan } = f.load('subscription/subscription_plan.entity.ts');
  const { TicketType } = f.load('ticketType/ticketType.entity.ts');
  const group = await f.source.getRepository(PromoterGroup).save({ organizerId: data.owner.id, promoterId: data.scanner.id, commissionPercentage: 12.35 });
  assert.equal((await f.source.getRepository(PromoterGroup).findOneByOrFail({ id: group.id })).commissionPercentage, 12.35);
  await f.load('subscription/subscription.service.ts').getActiveSubscription(data.owner.id);
  const free = await f.source.getRepository(SubscriptionPlan).findOneByOrFail({ name: 'FREE' });
  assert.equal(typeof free.monthlyPrice, 'number'); assert.equal(free.yearlyPrice, null);
  assert.equal(typeof (await f.source.getRepository(TicketType).findOneByOrFail({ id: data.ticketType.id })).price, 'number');
});

test('soft-delete migration preserves history, permits key reuse and retains global financial/QR idempotency', async () => {
  const specs = [
    ['user', 'uq_user_email_live', ['email']], ['user', 'uq_user_mp_user_live', ['mpUserId']],
    ['category', 'uq_category_name_live', ['name']], ['ticket_type', 'uq_ticket_type_event_name_live', ['eventId', 'name']]
  ];
  // Production currently has global constraints; emulate that starting schema.
  for (const [table, index, columns] of specs) {
    await f.source.query(`DROP INDEX "${index}"`);
    await f.source.query(`ALTER TABLE "${table}" ADD CONSTRAINT "${index}_legacy" UNIQUE (${columns.map(column => `"${column}"`).join(',')})`);
  }
  const runner = f.source.createQueryRunner();
  // The embedded engine cannot perform a concurrent index build. Native tests
  // execute the real concurrent DDL; embedded tests exercise constraints/data.
  if (f.engine) {
    const query = runner.query.bind(runner);
    runner.query = (sql, ...args) => query(sql.replace(/\bCONCURRENTLY\b/g, ''), ...args);
  }
  const { LiveUniqueKeys1794958200000 } = f.load('database/migrations/1794958200000-live-unique-keys.ts');
  const migration = new LiveUniqueKeys1794958200000();
  try {
    await migration.up(runner); await migration.up(runner);
    const { User } = f.load('user/user.entity.ts'); const { Category } = f.load('category/category.entity.ts');
    const { TicketType } = f.load('ticketType/ticketType.entity.ts');
    const deleted = await f.source.getRepository(User).save({ ...data.buyer, id: undefined, email: 'reusable@example.com', mpUserId: 'reusable-collector' });
    await f.source.getRepository(User).softDelete(deleted.id);
    const reused = await f.source.getRepository(User).save({ ...data.buyer, id: undefined, email: deleted.email, mpUserId: deleted.mpUserId });
    assert.notEqual(reused.id, deleted.id);
    await assert.rejects(f.source.getRepository(User).save({ ...data.buyer, id: undefined, email: deleted.email }), error => error.code === '23505');
    await assert.rejects(f.source.getRepository(User).restore(deleted.id), error => error.code === '23505');
    const category = await f.source.getRepository(Category).save({ name: 'Reusable name' });
    await f.source.getRepository(Category).softDelete(category.id);
    await f.source.getRepository(Category).save({ name: category.name });
    const type = await f.source.getRepository(TicketType).save({ eventId: data.event.id, name: 'Reusable ticket', price: 10, capacity: 2 });
    await f.source.getRepository(TicketType).softDelete(type.id);
    await f.source.getRepository(TicketType).save({ eventId: data.event.id, name: type.name, price: 20, capacity: 3 });
    const { PaymentLog } = f.load('payment/payment.entity.ts');
    assert.ok(f.source.getMetadata(PaymentLog).uniques.some(unique => unique.columns.some(column => column.propertyName === 'mpPaymentId')));
    const { Ticket } = f.load('ticket/ticket.entity.ts');
    assert.ok(f.source.getMetadata(Ticket).uniques.some(unique => unique.columns.some(column => column.propertyName === 'codigo_unico')));
    await assert.rejects(migration.down(runner), /ROLLBACK_REQUIRES_REVIEW/);
    assert.equal(await f.source.getRepository(User).count({ where: { email: deleted.email }, withDeleted: true }), 2);
  } finally { await runner.release(); }
});
