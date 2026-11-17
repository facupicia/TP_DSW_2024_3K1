const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { businessFixture, seedCommerce } = require('./business-fixture.cjs');
let f, data, core, models;
before(async () => {
  f = await businessFixture({ fetch: async () => ({ ok: true, json: async () => ({ id: 'fixture-refund', amount: 175, status: 'approved' }) }) }); data = await seedCommerce(f);
  core = f.load('payment/payment.core.ts');
  models = Object.assign({}, ...['payment/payment.entity.ts', 'payment/checkout-order.entity.ts', 'extra/extraItem.entity.ts',
    'ticket/ticket.entity.ts', 'extra/eventProduct.entity.ts', 'ticketType/ticketType.entity.ts',
    'queue/outbox.entity.ts', 'payment/refund-request.entity.ts', 'event/event.entity.ts'].map(f.load));
});
after(async () => { if (f) await f.close(); });
beforeEach(async () => {
  await f.source.query('TRUNCATE ticket, extra_item, payment_log, checkout_order, refund_request, outbox_job RESTART IDENTITY CASCADE');
  await f.source.getRepository(models.Event).update(data.event.id, { active: true, deletedAt: null });
  await f.source.getRepository(models.TicketType).update(data.ticketType.id, { soldCount: 0, capacity: 10, price: 100, status: 'active' });
  await f.source.getRepository(models.EventProduct).update(data.eventProduct.id, { soldCount: 0, stock: 10, hasStock: true, eventPrice: 25, isActive: true });
});

async function checkout(options = {}) {
  const items = [
    { type: 'ticket', referenceId: data.ticketType.id, quantity: 1, unitPrice: 100 },
    { type: 'extra', referenceId: data.eventProduct.id, quantity: 3, unitPrice: 25 }
  ];
  const externalReference = randomUUID();
  const pricing = { baseAmount: 175, totalAmount: 175, discountAmount: 0, serviceFeePercent: 0, serviceFeeAmount: 0, buyerTotalAmount: 175 };
  await f.source.getRepository(models.CheckoutOrder).save({ externalReference, userId: data.buyer.id,
    organizerId: data.owner.id, eventId: data.event.id, statusTokenHash: 'fixture-only',
    snapshot: { items, pricing, commissionPercent: 8, ...options.snapshot }, status: 'pending',
    expiresAt: new Date(Date.now() + 7 * 86400000), reservationExpiresAt: new Date(Date.now() + 600000) });
  const payment = { id: randomUUID(), status: 'approved', currency_id: 'ARS', transaction_amount: 175, external_reference: externalReference,
    metadata: { user_id: data.buyer.id, organizer_id: data.owner.id, items: items.map(({ unitPrice, ...item }) => item) }, ...options.payment };
  return payment;
}
const count = entity => f.source.getRepository(entity).count();

test('mixed purchase creates linked vouchers, tracks quantities, and persists both email intents', async () => {
  const payment = await checkout();
  const result = await core.processApprovedPayment(payment.id, payment);
  assert.equal(result.success, true);
  assert.equal(result.tickets.length, 1);
  assert.equal(result.extras.length, 1);
  assert.equal(result.extras[0].quantity, 3);
  assert.equal(Number(result.extras[0].purchasePrice), 25);
  assert.equal(result.extras[0].paymentLogId, result.logId);
  assert.equal((await f.source.getRepository(models.EventProduct).findOneByOrFail({ id: data.eventProduct.id })).soldCount, 3);
  const jobs = await f.source.getRepository(models.OutboxJob).find({ select: ['id', 'kind', 'payload'] });
  assert.deepEqual(jobs.map(job => job.payload.type).sort(), ['send-extra-email', 'send-ticket-email']);
  assert.equal((await f.source.getRepository(models.CheckoutOrder).findOneByOrFail({ externalReference: payment.external_reference })).status, 'approved');
  const response = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  await f.load('payment/payment.controller.ts').getPaymentStatus({ user: { id: data.buyer.id }, query: { external_reference: payment.external_reference }, header: () => '' }, response);
  assert.equal(response.body.status, 'approved', 'Compensation for a duplicate charge must not hide the fulfilled purchase');
});

test('extras without a stock cap still track sold units and refund restores them', async () => {
  await f.source.getRepository(models.EventProduct).update(data.eventProduct.id, { hasStock: false, stock: 0 });
  const payment = await checkout();
  const result = await core.processApprovedPayment(payment.id, payment);
  assert.equal(result.success, true);
  assert.equal((await f.source.getRepository(models.EventProduct).findOneByOrFail({ id: data.eventProduct.id })).soldCount, 3);
  const refund = await f.load('payment/refund.service.ts').processRefund(payment.id, { requestedBy: data.owner.id });
  assert.equal(refund.pending, true);
  assert.equal((await f.source.getRepository(models.EventProduct).findOneByOrFail({ id: data.eventProduct.id })).soldCount, 0);
});

test('duplicate payment notification returns existing vouchers without charging stock or emails twice', async () => {
  const payment = await checkout();
  const first = await core.processApprovedPayment(payment.id, payment);
  const duplicate = await core.processApprovedPayment(payment.id, payment);
  assert.equal(first.logId, duplicate.logId);
  assert.equal(duplicate.success, true);
  assert.equal(await count(models.Ticket), 1);
  assert.equal(await count(models.ExtraItem), 1);
  assert.equal(await count(models.OutboxJob), 2);
});

test('a second approved payment for the same checkout stages compensation without fulfilling it twice', async () => {
  const payment = await checkout();
  assert.equal((await core.processApprovedPayment(payment.id, payment)).success, true);
  const second = { ...payment, id: randomUUID() };
  const result = await core.processApprovedPayment(second.id, second);
  assert.equal(result.success, false);
  assert.equal(await count(models.Ticket), 1);
  assert.equal(await count(models.ExtraItem), 1);
  const request = await f.source.getRepository(models.RefundRequest).findOneByOrFail({ paymentLogId: result.logId });
  assert.equal(request.status, 'pending');
  assert.equal((await f.source.getRepository(models.CheckoutOrder).findOneByOrFail({ externalReference: payment.external_reference })).status, 'approved');
  const response = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  await f.load('payment/payment.controller.ts').getPaymentStatus({ user: { id: data.buyer.id }, query: { external_reference: payment.external_reference }, header: () => '' }, response);
  assert.equal(response.body.status, 'approved', 'Compensation for a duplicate charge must not hide the fulfilled purchase');
});

test('changing current catalog prices does not alter the price frozen in an existing checkout', async () => {
  const payment = await checkout();
  await f.source.getRepository(models.EventProduct).update(data.eventProduct.id, { eventPrice: 200 });
  await f.source.getRepository(models.TicketType).update(data.ticketType.id, { price: 900 });
  const result = await core.processApprovedPayment(payment.id, payment);
  assert.equal(result.success, true);
  assert.equal(Number(result.extras[0].purchasePrice), 25);
  assert.equal(Number(result.tickets[0].purchasePrice), 100);
});

test('insufficient extra stock rolls back ticket stock and durably requests the full refund', async () => {
  const payment = await checkout();
  await f.source.getRepository(models.EventProduct).update(data.eventProduct.id, { stock: 2 });
  const result = await core.processApprovedPayment(payment.id, payment);
  assert.equal(result.success, false);
  assert.equal(await count(models.Ticket), 0);
  assert.equal(await count(models.ExtraItem), 0);
  assert.equal((await f.source.getRepository(models.TicketType).findOneByOrFail({ id: data.ticketType.id })).soldCount, 0);
  assert.equal(await count(models.RefundRequest), 1);
  const jobs = await f.source.getRepository(models.OutboxJob).find();
  assert.deepEqual(jobs.map(job => job.kind), ['refund']);
});

test('redeemed extras prevent refund of the associated purchase', async () => {
  const payment = await checkout();
  const result = await core.processApprovedPayment(payment.id, payment);
  assert.equal((await f.load('ticket/ticket-validation.service.ts').validateTicket(result.extras[0].codigo_unico, data.owner.id, ['organizer'])).success, true);
  const refund = await f.load('payment/refund.service.ts').processRefund(payment.id, { requestedBy: data.owner.id });
  assert.equal(refund.success, false);
  assert.equal(await count(models.RefundRequest), 0);
  assert.equal((await f.source.getRepository(models.EventProduct).findOneByOrFail({ id: data.eventProduct.id })).soldCount, 3);
});

test('repeated refund requests cancel all linked quantities and restore stock exactly once', async () => {
  const payment = await checkout();
  await core.processApprovedPayment(payment.id, payment);
  const refunds = f.load('payment/refund.service.ts');
  const first = await refunds.processRefund(payment.id, { requestedBy: data.owner.id });
  const second = await refunds.processRefund(payment.id, { requestedBy: data.owner.id });
  assert.equal(first.pending, true);
  assert.equal(second.pending, true);
  assert.equal(await count(models.RefundRequest), 1);
  assert.equal((await f.source.getRepository(models.EventProduct).findOneByOrFail({ id: data.eventProduct.id })).soldCount, 0);
  assert.equal((await f.source.getRepository(models.TicketType).findOneByOrFail({ id: data.ticketType.id })).soldCount, 0);
  assert.equal(await f.source.getRepository(models.ExtraItem).countBy({ status: 'cancelled' }), 1);
});

test('an approved payment arriving after event removal is durably compensated, not lost in retries', async () => {
  const payment = await checkout();
  await f.source.getRepository(models.Event).update(data.event.id, { active: false, deletedAt: new Date() });
  const result = await core.processApprovedPayment(payment.id, payment);
  assert.equal(result.success, false);
  assert.equal(await count(models.Ticket), 0);
  assert.equal(await count(models.ExtraItem), 0);
  assert.equal(await count(models.RefundRequest), 1);
});

test('refund confirmation updates the fulfilled checkout, while compensation for duplicate charges does not', async () => {
  const payment = await checkout();
  await core.processApprovedPayment(payment.id, payment);
  const duplicate = await core.processApprovedPayment('duplicate-charge', { ...payment, id: 'duplicate-charge' });
  const refunds = f.load('payment/refund.service.ts');
  const compensation = await f.source.getRepository(models.RefundRequest).findOneByOrFail({ paymentLogId: duplicate.logId });
  await refunds.executeRefund(compensation.id);
  assert.equal((await f.source.getRepository(models.CheckoutOrder).findOneByOrFail({ externalReference: payment.external_reference })).status, 'approved');
  await refunds.processRefund(payment.id, { requestedBy: data.owner.id });
  const log = await f.source.getRepository(models.PaymentLog).findOneByOrFail({ mpPaymentId: payment.id });
  const request = await f.source.getRepository(models.RefundRequest).findOneByOrFail({ paymentLogId: log.id });
  await refunds.executeRefund(request.id);
  assert.equal((await f.source.getRepository(models.CheckoutOrder).findOneByOrFail({ externalReference: payment.external_reference })).status, 'refunded');
});
