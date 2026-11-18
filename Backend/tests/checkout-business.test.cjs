const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { businessFixture, seedCommerce } = require('./business-fixture.cjs');
let f, data, pref, core, controller, models, providerBodies = [], providerFails = false, pro;
before(async () => {
  f = await businessFixture({ mercadopago: { MercadoPagoConfig: class {}, Preference: class {
    async create({ body }) { providerBodies.push(body); if (providerFails) throw Error('provider timeout');
      return { id: 'preference-' + providerBodies.length, init_point: 'https://provider.example/pay' }; }
  } } });
  data = await seedCommerce(f); pref = f.load('payment/preference.service.ts'); core = f.load('payment/payment.core.ts'); controller = f.load('payment/payment.controller.ts');
  models = Object.assign({}, ...['payment/checkout-order.entity.ts', 'payment/payment.entity.ts', 'ticket/ticket.entity.ts',
    'ticketType/ticketType.entity.ts', 'extra/eventProduct.entity.ts', 'extra/extraItem.entity.ts', 'subscription/user_subscription.entity.ts',
    'subscription/subscription_plan.entity.ts', 'user/user.entity.ts'].map(f.load));
  pro = await f.source.getRepository(models.SubscriptionPlan).save({ name: 'PRO', monthlyPrice: 100, commissionPercent: 8,
    serviceFeePercent: 12, canSellExtras: true, maxTicketTypesPerEvent: 10 });
});
after(async () => { if (f) await f.close(); });
beforeEach(async () => {
  providerBodies = []; providerFails = false;
  await f.source.query('TRUNCATE ticket, extra_item, payment_log, checkout_order, refund_request, outbox_job, user_subscription RESTART IDENTITY CASCADE');
  await f.source.getRepository(models.UserSubscription).save({ userId: data.owner.id, planId: pro.id, status: 'active' });
  await f.source.getRepository(models.TicketType).update(data.ticketType.id, { capacity: 10, soldCount: 0 });
  await f.source.getRepository(models.EventProduct).update(data.eventProduct.id, { stock: 10, soldCount: 0, maxPerOrder: 5 });
});
const input = () => ({ userId: data.buyer.id, items: [{ ticketTypeId: data.ticketType.id, quantity: 1 }], extraItems: [{ eventProductId: data.eventProduct.id, quantity: 3 }] });
const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });

test('mixed checkout completes preference → approved payment → vouchers → single redemption', async () => {
  const result = await pref.createMercadoPagoPreference(input());
  const body = providerBodies[0];
  assert.equal(Math.round(body.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) * 100), Math.round(result.pricing.buyerTotalAmount * 100));
  const paid = await core.processApprovedPayment('fixture-payment', { id: 'fixture-payment', status: 'approved', currency_id: 'ARS',
    transaction_amount: result.pricing.buyerTotalAmount, external_reference: result.externalReference, metadata: body.metadata });
  assert.equal(paid.success, true);
  assert.equal((await f.load('ticket/ticket-validation.service.ts').validateTicket(paid.extras[0].codigo_unico, data.owner.id, ['organizer'])).success, true);
  assert.equal((await f.load('ticket/ticket-validation.service.ts').validateTicket(paid.extras[0].codigo_unico, data.owner.id, ['organizer'])).code, 'ALREADY_USED');
});

test('provider failure releases both ticket and extra reservations for a retry', async () => {
  providerFails = true;
  await assert.rejects(pref.createMercadoPagoPreference(input()), /provider timeout/);
  assert.equal(await pref.reservedQuantity(f.source.manager, 'ticket', data.ticketType.id), 0);
  assert.equal(await pref.reservedQuantity(f.source.manager, 'extra', data.eventProduct.id), 0);
  providerFails = false;
  assert.ok((await pref.createMercadoPagoPreference(input())).id);
});

test('concurrent checkout requests cannot reserve the same last stock twice', async () => {
  await f.source.getRepository(models.TicketType).update(data.ticketType.id, { capacity: 1 });
  const results = await Promise.allSettled([1, 2].map(() => pref.createMercadoPagoPreference(input())));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(providerBodies.length, 1);
  assert.equal(await pref.reservedQuantity(f.source.manager, 'ticket', data.ticketType.id), 1);
});

test('status queries require ownership or the checkout secret, and reject expired guest secrets', async () => {
  const checkout = await pref.createMercadoPagoPreference(input());
  const request = (id, token = '') => ({ user: id ? { id } : undefined,
    query: { external_reference: checkout.externalReference }, header: () => token });
  for (const [userId, token, status] of [[data.stranger.id, '', 403], [null, 'wrong-token', 403], [data.buyer.id, '', 200], [null, checkout.statusToken, 200]]) {
    const res = response(); await controller.getPaymentStatus(request(userId, token), res); assert.equal(res.statusCode, status);
  }
  await f.source.getRepository(models.CheckoutOrder).update(checkout.externalReference, { expiresAt: new Date(Date.now() - 1) });
  const res = response(); await controller.getPaymentStatus(request(null, checkout.statusToken), res); assert.equal(res.statusCode, 403);
});

test('guest checkout cannot attach a purchase to an existing registered account', async () => {
  const payload = input(); delete payload.userId;
  payload.guestBuyer = { firstname: 'Guest', lastname: 'Buyer', email: data.buyer.email, phone: '1234567890' };
  await assert.rejects(pref.createMercadoPagoPreference(payload), /GUEST_EMAIL_ALREADY_REGISTERED/);
  assert.equal(providerBodies.length, 0);
});

test('a downgraded plan cannot start new purchases containing extras', async () => {
  await f.source.getRepository(models.SubscriptionPlan).update(pro.id, { canSellExtras: false });
  try {
    const validation = await pref.validatePurchaseEligibility(input());
    assert.equal(validation.valid, false);
    assert.equal(validation.code, 'PLAN_LIMIT_EXTRAS');
  } finally { await f.source.getRepository(models.SubscriptionPlan).update(pro.id, { canSellExtras: true }); }
});

test('approved purchases return all tickets from a multi-type cart, including more than ten tickets', async () => {
  const secondType = await f.source.getRepository(models.TicketType).save({ eventId: data.event.id, name: 'VIP', price: 100,
    capacity: 10, soldCount: 0, status: 'active' });
  const checkout = await pref.createMercadoPagoPreference({ userId: data.buyer.id,
    items: [{ ticketTypeId: data.ticketType.id, quantity: 10 }, { ticketTypeId: secondType.id, quantity: 10 }] });
  const body = providerBodies[0];
  await core.processApprovedPayment('large-purchase', { id: 'large-purchase', status: 'approved', currency_id: 'ARS',
    transaction_amount: checkout.pricing.buyerTotalAmount, external_reference: checkout.externalReference, metadata: body.metadata });
  const result = await f.load('ticket/ticket.service.ts').findLastPurchase(data.buyer.id, checkout.externalReference);
  assert.equal(result.status, 'approved');
  assert.equal(result.tickets.length, 20);
});

test('parallel purchase eligibility checks do not exhaust the PostgreSQL pool', { skip: !process.env.EVENTLIFE_TEST_POSTGRES_URL, timeout: 15000 }, async () => {
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => pref.validatePurchaseEligibility(input())));
  assert.equal(results.filter(result => result.status === 'fulfilled' && result.value.valid).length, 20);
});

test('concurrent paid checkouts cannot exceed the last coupon use; losing payment is refunded durably', async () => {
  const { Coupon } = f.load('coupon/coupon.entity.ts');
  const coupon = await f.source.getRepository(Coupon).save({ eventId: data.event.id, code: 'LAST-USE', discountPercent: 10, maxUses: 1 });
  try {
    const checkouts = await Promise.all([1, 2].map(() => pref.createMercadoPagoPreference({ ...input(), couponId: coupon.id })));
    const payments = await Promise.all(checkouts.map((checkout, index) => core.processApprovedPayment('coupon-' + index, {
      id: 'coupon-' + index, status: 'approved', currency_id: 'ARS', transaction_amount: checkout.pricing.buyerTotalAmount,
      external_reference: checkout.externalReference, metadata: providerBodies[index].metadata
    })));
    assert.equal(payments.filter(payment => payment.success).length, 1);
    assert.equal((await f.source.getRepository(Coupon).findOneByOrFail({ id: coupon.id })).usedCount, 1);
    assert.equal(await f.source.getRepository(models.Ticket).count(), 1);
    assert.equal((await f.source.getRepository(models.TicketType).findOneByOrFail({ id: data.ticketType.id })).soldCount, 1);
    assert.equal((await f.source.query('SELECT count(*)::int AS n FROM refund_request WHERE status=\'pending\''))[0].n, 1);
    const retry = await core.processApprovedPayment('coupon-0', { id: 'coupon-0', status: 'approved', currency_id: 'ARS',
      transaction_amount: checkouts[0].pricing.buyerTotalAmount, external_reference: checkouts[0].externalReference,
      metadata: providerBodies[0].metadata });
    assert.equal(retry.success, payments[0].success);
    assert.equal((await f.source.getRepository(Coupon).findOneByOrFail({ id: coupon.id })).usedCount, 1);
  } finally { await f.source.getRepository(Coupon).delete(coupon.id); }
});

for (const state of ['expired', 'inactive', 'deleted']) test(`a frozen discount cannot bypass a ${state} coupon`, async () => {
  const { Coupon } = f.load('coupon/coupon.entity.ts');
  const repo = f.source.getRepository(Coupon);
  const coupon = await repo.save({ eventId: data.event.id, code: state.toUpperCase(), discountPercent: 10, maxUses: 1 });
  try {
    const checkout = await pref.createMercadoPagoPreference({ ...input(), couponId: coupon.id });
    if (state === 'deleted') await repo.delete(coupon.id);
    else await repo.update(coupon.id, state === 'expired' ? { expiresAt: new Date(Date.now() - 1000) } : { isActive: false });
    // Even missing provider coupon metadata cannot bypass the frozen coupon ID.
    const metadata = { ...providerBodies[0].metadata, coupon_id: null };
    const result = await core.processApprovedPayment('invalid-coupon', { id: 'invalid-coupon', status: 'approved', currency_id: 'ARS',
      transaction_amount: checkout.pricing.buyerTotalAmount, external_reference: checkout.externalReference, metadata });
    assert.equal(result.success, false);
    assert.equal(await f.source.getRepository(models.Ticket).count(), 0);
    assert.equal((await f.source.getRepository(models.TicketType).findOneByOrFail({ id: data.ticketType.id })).soldCount, 0);
    assert.equal((await f.source.query('SELECT count(*)::int AS n FROM refund_request WHERE status=\'pending\''))[0].n, 1);
  } finally { await repo.delete(coupon.id); }
});

for (const [discountPercent, generalPrice, vipPrice] of [[17, 100.01, 300.03], [100, 100.01, 300.03], [100, 100, 300]]) test(`promoter commission excludes extras and service fees with ${discountPercent}% discount and ${generalPrice} base price`, async () => {
  const { PromoterGroup, PromoterEventAssignment } = f.load('promoter/promoter.entity.ts');
  const { Coupon } = f.load('coupon/coupon.entity.ts');
  const group = await f.source.getRepository(PromoterGroup).save({ organizerId: data.owner.id, promoterId: data.scanner.id,
    commissionPercentage: 10, promoterCode: 'NET-TICKETS', isActive: true });
  const assignment = await f.source.getRepository(PromoterEventAssignment).save({ promoterGroupId: group.id, eventId: data.event.id, isActive: true });
  const coupon = await f.source.getRepository(Coupon).save({ code: 'NET-DISCOUNT', eventId: data.event.id, discountPercent });
  const second = await f.source.getRepository(models.TicketType).save({ eventId: data.event.id, name: 'Commission VIP', price: vipPrice, capacity: 10 });
  await f.source.getRepository(models.TicketType).update(data.ticketType.id, { price: generalPrice });
  try {
    const checkout = await pref.createMercadoPagoPreference({ ...input(), promoterCode: group.promoterCode, couponId: coupon.id,
      items: [{ ticketTypeId: data.ticketType.id, quantity: 2 }, { ticketTypeId: second.id, quantity: 1 }] });
    const payment = await core.processApprovedPayment('commission-net', { id: 'commission-net', status: 'approved', currency_id: 'ARS',
      transaction_amount: checkout.pricing.buyerTotalAmount, external_reference: checkout.externalReference, metadata: providerBodies[0].metadata });
    assert.equal(payment.success, true);
    const tickets = await f.source.getRepository(models.Ticket).find({ order: { id: 'ASC' } });
    const netCents = tickets.reduce((sum, ticket) => sum + Math.round(ticket.purchasePrice * 100), 0);
    const expectedCents = Math.round(netCents * 0.1);
    assert.equal(Math.round(payment.promoterCommission * 100), expectedCents);
    assert.equal(tickets.reduce((sum, ticket) => sum + Math.round(ticket.promoterCommissionAmount * 100), 0), expectedCents);
    for (const ticket of tickets) {
      assert.equal(typeof ticket.purchasePrice, 'number');
      assert.equal(typeof ticket.promoterCommissionAmount, 'number');
      assert.ok(Math.abs(Math.round(ticket.promoterCommissionAmount * 100) - ticket.purchasePrice * 10) <= 1);
    }
    if (netCents > 0) assert.ok(tickets.find(ticket => ticket.ticketTypeId === second.id).promoterCommissionAmount > tickets.find(ticket => ticket.ticketTypeId === data.ticketType.id).promoterCommissionAmount * 2);
    assert.equal((await f.source.getRepository(models.TicketType).findOneByOrFail({ id: second.id })).price, vipPrice);
  } finally {
    await f.source.getRepository(PromoterEventAssignment).delete(assignment.id);
    await f.source.getRepository(PromoterGroup).delete(group.id);
    await f.source.getRepository(Coupon).delete(coupon.id);
    await f.source.getRepository(models.TicketType).softDelete(second.id);
    await f.source.getRepository(models.TicketType).update(data.ticketType.id, { price: 100 });
  }
});
