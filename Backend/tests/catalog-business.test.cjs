const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { businessFixture, seedCommerce } = require('./business-fixture.cjs');
let f, data, extras, products;
let plan = { name: 'PRO', displayName: 'PRO', canSellExtras: true, maxProductsInCatalog: 100 };
before(async () => {
  f = await businessFixture({ 'subscription/subscription.service.ts': { getActiveSubscription: async () => ({ plan }) } });
  data = await seedCommerce(f); extras = f.load('extra/extra.service.ts'); products = f.load('product/product.service.ts');
});
after(async () => { if (f) await f.close(); });

test('a catalog product cannot be attached to an event owned by another organizer', async () => {
  const { Product } = f.load('product/product.entity.ts');
  const foreignProduct = await f.source.getRepository(Product).save({ organizerId: data.stranger.id, name: 'Foreign', category: 'drink', basePrice: 20 });
  await assert.rejects(extras.createEventProduct(data.stranger.id, data.event.id, {
    productId: foreignProduct.id, eventPrice: 20
  }), error => error.code === 'FORBIDDEN');
});

test('stock cannot be reduced below sold units and active reservations', async () => {
  const { EventProduct } = f.load('extra/eventProduct.entity.ts');
  const { CheckoutOrder } = f.load('payment/checkout-order.entity.ts');
  await f.source.getRepository(EventProduct).update(data.eventProduct.id, { soldCount: 2 });
  const order = await f.source.getRepository(CheckoutOrder).save({ externalReference: 'reserved-extras', userId: data.buyer.id,
    organizerId: data.owner.id, eventId: data.event.id, statusTokenHash: 'test', snapshot: {
      items: [{ type: 'extra', referenceId: data.eventProduct.id, quantity: 3 }] },
    expiresAt: new Date(Date.now() + 86400000), reservationExpiresAt: new Date(Date.now() + 600000) });
  try {
    await assert.rejects(extras.updateEventProduct(data.eventProduct.id, data.owner.id, { stock: 4 }), error => error.code === 'STOCK_BELOW_COMMITTED');
    assert.equal((await f.source.getRepository(EventProduct).findOneByOrFail({ id: data.eventProduct.id })).stock, 10);
    assert.equal((await extras.updateEventProduct(data.eventProduct.id, data.owner.id, { stock: 5 })).stock, 5);
  } finally {
    await f.source.getRepository(CheckoutOrder).delete(order.externalReference);
    await f.source.getRepository(EventProduct).update(data.eventProduct.id, { stock: 10, soldCount: 0 });
  }
});

test('reactivating extras requires a plan that permits selling them', async () => {
  const { EventProduct } = f.load('extra/eventProduct.entity.ts');
  await f.source.getRepository(EventProduct).update(data.eventProduct.id, { isActive: false });
  plan = { ...plan, canSellExtras: false };
  try {
    await assert.rejects(extras.updateEventProduct(data.eventProduct.id, data.owner.id, { isActive: true }), error => error.code === 'PLAN_LIMIT_EXTRAS');
  } finally {
    plan = { ...plan, canSellExtras: true };
    await f.source.getRepository(EventProduct).update(data.eventProduct.id, { isActive: true });
  }
});

test('catalog input rejects negative, non-finite and malformed prices before persistence', async () => {
  for (const basePrice of [-1, 'not-a-number', Infinity, null, true, '']) {
    await assert.rejects(products.createProduct(data.owner.id, { name: 'Invalid price', category: 'drink', basePrice }), error => error.name === 'ZodError');
  }
});

test('product names, categories and image protocols are validated on updates too', async () => {
  for (const input of [{ name: '   ' }, { category: 'not-a-category' }, { imageUrl: 'javascript:alert(1)' }, { name: 123 }]) {
    await assert.rejects(products.updateProduct(data.product.id, data.owner.id, input), error => error.name === 'ZodError');
  }
});

test('extra config rejects string booleans, fractional stock and invalid limits', async () => {
  for (const input of [{ hasStock: 'false' }, { isActive: 'false' }, { stock: 1.5 }, { stock: -1 }, { maxPerOrder: 0 }, { eventPrice: 'NaN' }]) {
    await assert.rejects(extras.updateEventProduct(data.eventProduct.id, data.owner.id, input), error => error.name === 'ZodError');
  }
});

test('an organizer cannot modify or remove another organizer\'s product or event extra', async () => {
  await assert.rejects(products.updateProduct(data.product.id, data.stranger.id, { name: 'Stolen' }), error => error.code === 'NOT_FOUND');
  await assert.rejects(products.softDeleteProduct(data.product.id, data.stranger.id), error => error.code === 'NOT_FOUND');
  await assert.rejects(extras.updateEventProduct(data.eventProduct.id, data.stranger.id, { stock: 10 }), error => error.code === 'FORBIDDEN');
  await assert.rejects(extras.deactivateEventProduct(data.eventProduct.id, data.stranger.id), error => error.code === 'FORBIDDEN');
});
