const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const service = load('payment/preference.service.ts', { './mp.config': {
  getMPConfig: () => ({ clientUrl: 'https://app.example', notificationUrl: 'https://api.example/webhook' }), sanitizeUrl: value => value
} });

for (const scenario of [
  { prices: [101, 102, 103], quantities: [1, 1, 1], discount: 10 },
  { prices: [1, 1], quantities: [1, 1], discount: 50 },
  { prices: [100.01, 200.03], quantities: [3, 2], discount: 17 },
  { prices: [100], quantities: [3], discount: 33 }
]) {
  test(`provider items exactly match the frozen buyer total: ${JSON.stringify(scenario)}`, () => {
    const event = { id: 1, user_id: 7, title: 'Event' };
    const types = scenario.prices.map((price, index) => ({ id: index + 1, price, name: 'General', event }));
    const items = types.map((type, index) => ({ ticketTypeId: type.id, quantity: scenario.quantities[index] }));
    const body = service.buildPreferenceBody({ email: 'buyer@example.com', firstname: 'Buyer', lastname: 'Test' }, 3, types, items,
      [{ id: 5, event, product: { name: 'Extra' }, eventPrice: '25.50' }], [{ eventProductId: 5, quantity: 2 }],
      { commissionPercent: 8, serviceFeePercent: 12, minimumServiceFee: 0, planName: 'PRO' }, undefined,
      { id: 1, discountPercent: scenario.discount });
    const providerCents = body.items.reduce((sum, item) => sum + Math.round(item.unit_price * 100) * item.quantity, 0);
    assert.equal(providerCents, Math.round(body.metadata.buyer_total_amount * 100));
    assert.ok(body.items.every(item => Number.isFinite(item.unit_price) && item.unit_price >= 0));
  });
}
