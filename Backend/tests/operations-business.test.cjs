const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { businessFixture, seedCommerce } = require('./business-fixture.cjs');
let f, data, models, tickets, events;
before(async () => {
  f = await businessFixture(); data = await seedCommerce(f);
  tickets = f.load('ticket/ticket.service.ts'); events = f.load('event/event.service.ts');
  models = Object.assign({}, ...['ticket/ticket.entity.ts', 'ticketType/ticketType.entity.ts', 'extra/extraItem.entity.ts',
    'extra/eventProduct.entity.ts', 'event/event.entity.ts', 'payment/checkout-order.entity.ts', 'user/user.entity.ts'].map(f.load));
});
after(async () => { if (f) await f.close(); });
beforeEach(async () => {
  await f.source.query('TRUNCATE ticket, extra_item, payment_log, checkout_order, refund_request, outbox_job, scanner_organizer_assignment RESTART IDENTITY CASCADE');
  await f.source.getRepository(models.Event).update(data.event.id, { active: true, deletedAt: null });
  await f.source.getRepository(models.TicketType).update(data.ticketType.id, { price: 0, status: 'active', capacity: 10, soldCount: 0 });
  await f.source.getRepository(models.EventProduct).update(data.eventProduct.id, { isActive: true, soldCount: 0 });
});

async function reserveTickets(quantity) {
  return f.source.getRepository(models.CheckoutOrder).save({ externalReference: randomUUID(), userId: data.buyer.id,
    organizerId: data.owner.id, eventId: data.event.id, statusTokenHash: 'test', snapshot: {
      items: [{ type: 'ticket', referenceId: data.ticketType.id, quantity }] },
    expiresAt: new Date(Date.now() + 86400000), reservationExpiresAt: new Date(Date.now() + 600000) });
}

test('guest invitations execute valid PostgreSQL locks and persist their email before commit', async () => {
  const result = await tickets.inviteGuests(data.owner.id, data.ticketType.id, ['guest@example.com'], 2, false);
  assert.equal(result.totalTickets, 2);
  assert.equal(await f.source.getRepository(models.Ticket).count(), 2);
  const jobs = await f.source.getRepository(f.load('queue/outbox.entity.ts').OutboxJob).find({ select: ['payload'] });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].payload.payload.ticketIds.length, 2);
});

test('guest invitations cannot consume stock reserved by another checkout', async () => {
  await f.source.getRepository(models.TicketType).update(data.ticketType.id, { capacity: 2 });
  await reserveTickets(2);
  await assert.rejects(tickets.inviteGuests(data.owner.id, data.ticketType.id, ['guest@example.com'], 1, false), error => error.code === 'NO_STOCK');
  assert.equal(await f.source.getRepository(models.Ticket).count(), 0);
});

test('editing ticket capacity preserves units committed to pending checkouts', async () => {
  await reserveTickets(3);
  await assert.rejects(events.update(data.owner.id, false, data.event.id, { ticketTypes: [{ id: data.ticketType.id, capacity: 2 }] }), error => error.code === 'CAPACITY_BELOW_COMMITTED');
  assert.equal((await f.source.getRepository(models.TicketType).findOneByOrFail({ id: data.ticketType.id })).capacity, 10);
});

test('removing an event cancels its active extra vouchers and restores their complete quantity', async () => {
  await f.source.getRepository(models.EventProduct).update(data.eventProduct.id, { soldCount: 3 });
  const item = await f.source.getRepository(models.ExtraItem).save({ codigo_unico: randomUUID(), qrCode: 'qr',
    userId: data.buyer.id, eventProductId: data.eventProduct.id, quantity: 3, purchasePrice: 0, status: 'active' });
  await events.remove(data.owner.id, false, data.event.id);
  assert.equal((await f.source.getRepository(models.ExtraItem).findOneByOrFail({ id: item.id })).status, 'cancelled');
  assert.equal((await f.source.getRepository(models.EventProduct).findOneByOrFail({ id: data.eventProduct.id })).soldCount, 0);
});

test('paid active purchases require the refund flow before an event can be deleted', async () => {
  await f.source.getRepository(models.Ticket).save({ codigo_unico: randomUUID(), qrCode: 'qr', userId: data.buyer.id,
    ticketTypeId: data.ticketType.id, purchasePrice: 100, status: 'active' });
  await assert.rejects(events.remove(data.owner.id, false, data.event.id), error => error.code === 'PAID_EVENT_REFUND_REQUIRED');
  assert.equal((await f.source.getRepository(models.Event).findOneByOrFail({ id: data.event.id })).active, true);
});

test('a person who is also an organizer can be assigned as another organizer\'s scanner', async () => {
  const { Role, getRoleNames } = f.load('user/role.entity.ts');
  const organizerRole = await f.source.getRepository(Role).save({ name: 'organizer' });
  const user = await f.source.getRepository(models.User).findOneByOrFail({ id: data.scanner.id });
  user.roles = [organizerRole]; await f.source.getRepository(models.User).save(user);
  const scanners = f.load('scanner/scanner.service.ts');
  assert.equal((await scanners.assignScanner(data.owner.id, { userId: user.id }, data.owner.id)).success, true);
  const fresh = await f.source.getRepository(models.User).findOne({ where: { id: user.id }, relations: ['roles'] });
  assert.equal(await f.load('scanner/scanner-permissions.ts').canValidateEvent(user.id, getRoleNames(fresh), data.event.id, data.owner.id), true);
});

test('scanner assignment removal and reactivation are scoped to the owning organizer', async () => {
  const scanners = f.load('scanner/scanner.service.ts');
  const result = await scanners.assignScanner(data.owner.id, { userId: data.buyer.id }, data.owner.id);
  assert.equal((await scanners.removeScanner(data.stranger.id, result.assignment.id)).success, false);
  assert.equal((await scanners.removeScanner(data.owner.id, result.assignment.id)).success, true);
  const again = await scanners.assignScanner(data.owner.id, { userId: data.buyer.id }, data.owner.id);
  assert.equal(again.assignment.id, result.assignment.id);
  assert.equal((await scanners.listAssignments(data.owner.id)).length, 1);
  assert.equal((await scanners.listAssignments(data.stranger.id)).length, 0);
});

test('coupon validation uses the same timezone-aware event instant as checkout', async () => {
  const { DateTime } = require('luxon');
  const timezone = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const future = new Date(Date.now() + 3600000);
    const wall = DateTime.fromJSDate(future, { zone: 'America/Argentina/Buenos_Aires' });
    await f.source.getRepository(models.Event).update(data.event.id, { date: wall.toISODate(), time: wall.toFormat('HH:mm:ss'), startDateTime: future });
    const coupon = await f.source.getRepository(f.load('coupon/coupon.entity.ts').Coupon).save({ code: 'TIMEZONE', eventId: data.event.id, discountPercent: 10, maxUses: 0, isActive: true });
    const response = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    await f.load('coupon/coupon.controller.ts').validateCoupon({ body: { eventId: data.event.id, code: coupon.code } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.valid, true);
  } finally { if (timezone === undefined) delete process.env.TZ; else process.env.TZ = timezone; }
});
