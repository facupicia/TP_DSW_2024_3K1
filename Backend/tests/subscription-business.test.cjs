const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { businessFixture, seedCommerce } = require('./business-fixture.cjs');
let f, data, core, model, plan, requests = [], unavailable = false, remote;
before(async () => {
  f = await businessFixture({
    'mercadopago': { MercadoPagoConfig: class {}, PreApproval: class {
      async create({ body }) { requests.push(body); return { id: 'provider-subscription', init_point: 'https://provider.example/checkout' }; }
      async get() { if (unavailable) throw Error('provider unavailable'); return remote; }
      async update() { if (unavailable) throw Error('provider unavailable'); return { status: 'cancelled' }; }
    } },
    'payment/mp.config.ts': { getMPConfig: () => ({ subscriptionAccessToken: 'fixture', subscriptionBackUrl: 'https://api.example', clientUrl: 'https://app.example' }), sanitizeUrl: value => value }
  });
  data = await seedCommerce(f); core = f.load('subscription/subscription.core.ts');
  model = f.load('subscription/user_subscription.entity.ts').UserSubscription;
  plan = await f.source.getRepository(f.load('subscription/subscription_plan.entity.ts').SubscriptionPlan).save({
    name: 'PRO', displayName: 'PRO', monthlyPrice: 100, yearlyPrice: 1000, commissionPercent: 8, canSellExtras: true });
});
after(async () => { if (f) await f.close(); });
beforeEach(async () => { await f.source.query('TRUNCATE user_subscription, outbox_job RESTART IDENTITY CASCADE'); requests = []; unavailable = false; });

test('annual subscriptions charge the annual price once every twelve months', async () => {
  await core.createSubscriptionCheckout({ userId: data.owner.id, planId: plan.id, billingType: 'yearly' });
  assert.equal(requests[0].auto_recurring.frequency, 12);
  assert.equal(requests[0].auto_recurring.frequency_type, 'months');
  assert.equal(requests[0].auto_recurring.transaction_amount, 1000);
});

test('monthly subscriptions retain their monthly amount and frequency', async () => {
  await core.createSubscriptionCheckout({ userId: data.owner.id, planId: plan.id, billingType: 'monthly' });
  assert.equal(requests[0].auto_recurring.frequency, 1);
  assert.equal(requests[0].auto_recurring.transaction_amount, 100);
});

test('an annual checkout is rejected when the plan does not offer an annual price', async () => {
  const { SubscriptionPlan } = f.load('subscription/subscription_plan.entity.ts');
  await f.source.getRepository(SubscriptionPlan).update(plan.id, { yearlyPrice: null });
  try { await assert.rejects(core.createSubscriptionCheckout({ userId: data.owner.id, planId: plan.id, billingType: 'yearly' })); }
  finally { await f.source.getRepository(SubscriptionPlan).update(plan.id, { yearlyPrice: 1000 }); }
  assert.equal(requests.length, 0);
});

test('duplicate activation preserves the paid period and billing cycle instead of extending it', async () => {
  const end = new Date(Date.now() + 10 * 86400000);
  const first = await core.activateSubscription(data.owner.id, plan.id, 'annual-1', 'yearly', end);
  const repeated = await core.activateSubscription(data.owner.id, plan.id, 'annual-1', 'yearly');
  assert.equal(repeated.currentPeriodEnd.toISOString(), end.toISOString());
  assert.equal(repeated.currentPeriodStart.toISOString(), first.currentPeriodStart.toISOString());
  assert.equal(repeated.billingCycle, 'yearly');
  assert.equal(await f.source.getRepository(model).countBy({ userId: data.owner.id, status: 'active' }), 1);
});

test('one external subscription cannot be rebound to another account', async () => {
  await core.activateSubscription(data.owner.id, plan.id, 'bound-subscription', 'monthly');
  await assert.rejects(core.activateSubscription(data.stranger.id, plan.id, 'bound-subscription', 'monthly'), /SUBSCRIPTION_OWNER_MISMATCH/);
  assert.equal((await f.source.getRepository(model).findOneByOrFail({ externalSubscriptionId: 'bound-subscription' })).userId, data.owner.id);
});

test('failed provider cancellation must not report the subscription as cancelled locally', async () => {
  await core.activateSubscription(data.owner.id, plan.id, 'cancel-failure', 'monthly');
  unavailable = true;
  await assert.rejects(core.cancelUserSubscription(data.owner.id), /cancel|provider/i);
  const row = await f.source.getRepository(model).findOneByOrFail({ externalSubscriptionId: 'cancel-failure' });
  assert.equal(row.status, 'active');
  assert.equal(row.cancelledAt, null);
});

test('successful cancellation stops renewal while preserving access until the paid period ends', async () => {
  const end = new Date(Date.now() + 10 * 86400000);
  await core.activateSubscription(data.owner.id, plan.id, 'cancel-success', 'monthly', end);
  await core.cancelUserSubscription(data.owner.id);
  const current = await f.load('subscription/subscription.service.ts').getActiveSubscription(data.owner.id);
  assert.equal(current.planId, plan.id);
  assert.ok(current.cancelledAt);
  assert.equal(current.currentPeriodEnd.toISOString(), end.toISOString());
});

test('cancellation webhook retains a paid entitlement until its existing expiry', async () => {
  await core.activateSubscription(data.owner.id, plan.id, 'cancel-webhook', 'monthly', new Date(Date.now() + 86400000));
  await core.cancelSubscriptionByExternalId('cancel-webhook', 'subscription_cancelled');
  assert.equal((await f.load('subscription/subscription.service.ts').getActiveSubscription(data.owner.id)).planId, plan.id);
});

test('subscription provider failure is retriable instead of silently acknowledging lost state', async () => {
  unavailable = true;
  await assert.rejects(core.processSubscriptionWebhook('subscription_preapproval', 'remote-1'), /unavailable|retry/i);
});

test('subscription webhook persists a unique intent before acknowledging without calling the provider', async () => {
  unavailable = true;
  const response = { statusCode: 200, sendStatus(value) { this.statusCode = value; return this; } };
  const request = { query: {}, body: { type: 'subscription_preapproval', data: { id: 'remote-intent' } } };
  const controller = f.load('subscription/subscription.controller.ts');
  await controller.subscriptionWebhook(request, response);
  await controller.subscriptionWebhook(request, response);
  assert.equal(response.statusCode, 200);
  const jobs = await f.source.getRepository(f.load('queue/outbox.entity.ts').OutboxJob).find({ select: ['id', 'kind', 'payload'] });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].kind, 'subscription');
  assert.equal(jobs[0].payload.dataId, 'remote-intent');
});

test('subscription references reject fractional, negative, infinite and trailing identifiers', () => {
  for (const ref of ['SUB|-1|2|monthly', 'SUB|1.5|2|monthly', 'SUB|Infinity|2|monthly', 'SUB|1|2|monthly|extra']) {
    assert.equal(core.parseSubscriptionExternalRef(ref), null);
  }
});

test('concurrent first access creates exactly one default subscription', async () => {
  const service = f.load('subscription/subscription.service.ts');
  const result = await Promise.all([1, 2, 3].map(() => service.getActiveSubscription(data.owner.id)));
  assert.equal(new Set(result.map(row => row.id)).size, 1);
  assert.equal(await f.source.getRepository(model).countBy({ userId: data.owner.id, status: 'active' }), 1);
});

test('database forbids binding one external subscription to multiple accounts', async () => {
  const repo = f.source.getRepository(model);
  await repo.save({ userId: data.owner.id, planId: plan.id, externalSubscriptionId: 'unique-remote', status: 'active' });
  await assert.rejects(repo.save({ userId: data.stranger.id, planId: plan.id, externalSubscriptionId: 'unique-remote', status: 'active' }), error => error.code === '23505');
});

test('database forbids multiple active plans for a single account', async () => {
  const repo = f.source.getRepository(model);
  await repo.save({ userId: data.owner.id, planId: plan.id, status: 'active' });
  await assert.rejects(repo.save({ userId: data.owner.id, planId: plan.id, status: 'active' }), error => error.code === '23505');
});

test('replacing a paid subscription durably schedules cancellation of the previous renewal', async () => {
  await core.activateSubscription(data.owner.id, plan.id, 'previous-renewal', 'monthly');
  await core.activateSubscription(data.owner.id, plan.id, 'replacement-renewal', 'monthly');
  const previous = await f.source.getRepository(model).findOneByOrFail({ externalSubscriptionId: 'previous-renewal' });
  assert.equal(previous.status, 'expired');
  assert.ok(previous.cancelledAt);
  const jobs = await f.source.getRepository(f.load('queue/outbox.entity.ts').OutboxJob).find({ select: ['kind', 'payload'] });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].kind, 'subscription-cancel');
  assert.equal(jobs[0].payload.externalSubscriptionId, 'previous-renewal');
});

test('a superseded authorization cannot reactivate the old subscription and replace the current plan', async () => {
  await core.activateSubscription(data.owner.id, plan.id, 'previous-renewal', 'monthly');
  await core.activateSubscription(data.owner.id, plan.id, 'replacement-renewal', 'monthly');
  remote = { status: 'authorized', external_reference: `SUB|${data.owner.id}|${plan.id}|monthly` };
  await core.processSubscriptionWebhook('subscription_preapproval', 'previous-renewal');
  assert.equal((await f.source.getRepository(model).findOneByOrFail({ userId: data.owner.id, status: 'active' })).externalSubscriptionId, 'replacement-renewal');
});

test('superseded renewal cancellation retries provider errors and requires confirmation', async () => {
  unavailable = true;
  await assert.rejects(core.cancelSupersededRenewal('previous-renewal'), /provider|cancel/i);
  unavailable = false;
  await core.cancelSupersededRenewal('previous-renewal');
});
