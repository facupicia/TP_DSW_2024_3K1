const { test } = require('node:test');
const assert = require('node:assert/strict');
const { businessFixture, seedCommerce } = require('./business-fixture.cjs');

test('phase one migration replaces global coupon uniqueness, creates indexes, repeats safely and preserves rows', async () => {
  const f = await businessFixture();
  try {
    const data = await seedCommerce(f);
    const { Coupon } = f.load('coupon/coupon.entity.ts');
    const { Event } = f.load('event/event.entity.ts');
    const other = await f.source.getRepository(Event).save({ ...data.event, id: undefined, title: 'Other event' });
    // Emulate the existing production schema, including its generated name.
    await f.source.query('ALTER TABLE coupon DROP CONSTRAINT uq_coupon_event_code');
    await f.source.query('ALTER TABLE coupon ADD CONSTRAINT old_global_code UNIQUE (code)');
    await f.source.query('ALTER TABLE outbox_job DROP COLUMN "failedAt"');
    const coupon = await f.source.getRepository(Coupon).save({ code: 'SHARED', eventId: data.event.id, discountPercent: 10, maxUses: 3, usedCount: 2 });
    const { PhaseOneHardening1794956400000 } = f.load('database/migrations/1794956400000-phase-one-hardening.ts');
    const migration = new PhaseOneHardening1794956400000();
    const runner = f.source.createQueryRunner();
    try {
      await migration.up(runner); await migration.up(runner);
      await assert.rejects(f.source.getRepository(Coupon).save({ code: 'SHARED', eventId: data.event.id, discountPercent: 10 }), error => error.code === '23505');
      const second = await f.source.getRepository(Coupon).save({ code: 'SHARED', eventId: other.id, discountPercent: 20 });
      assert.equal((await f.source.getRepository(Coupon).findOneByOrFail({ id: coupon.id })).usedCount, 2);
      const indexes = await f.source.query(`SELECT indexname FROM pg_indexes WHERE schemaname=current_schema()`);
      for (const name of ['idx_ticket_payment_log', 'idx_event_product_product', 'idx_user_subscription_plan', 'idx_checkout_pending_event']) {
        assert.ok(indexes.some(index => index.indexname === name), name);
      }
      await assert.rejects(migration.down(runner), /ROLLBACK_REQUIRES_REVIEW/);
      assert.equal(await f.source.getRepository(Coupon).count(), 2);
      await f.source.getRepository(Coupon).delete(second.id);
      await migration.down(runner);
      assert.equal(await f.source.getRepository(Coupon).count(), 1);
    } finally { await runner.release(); }
  } finally { await f.close(); }
});

test('active subscription reads proceed while another transaction holds the organizer row lock', { skip: !process.env.EVENTLIFE_TEST_POSTGRES_URL }, async () => {
  const f = await businessFixture();
  let lock;
  try {
    const data = await seedCommerce(f);
    const { getActiveSubscription } = f.load('subscription/subscription.service.ts');
    await getActiveSubscription(data.owner.id);
    lock = f.source.createQueryRunner(); await lock.connect(); await lock.startTransaction();
    await lock.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [data.owner.id]);
    await f.source.transaction(async manager => {
      await manager.query("SET LOCAL lock_timeout='500ms'");
      assert.equal((await getActiveSubscription(data.owner.id, manager)).userId, data.owner.id);
    });
  } finally {
    if (lock) { if (lock.isTransactionActive) await lock.rollbackTransaction(); await lock.release(); }
    await f.close();
  }
});
