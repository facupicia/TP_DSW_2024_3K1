const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { businessFixture, seedCommerce } = require('./business-fixture.cjs');
let f, data, service;
before(async () => { f = await businessFixture(); data = await seedCommerce(f); service = f.load('ticket/ticket-validation.service.ts'); });
after(async () => { if (f) await f.close(); });

async function voucher(type = 'ticket', changes = {}) {
  const { Ticket } = f.load('ticket/ticket.entity.ts');
  const { ExtraItem } = f.load('extra/extraItem.entity.ts');
  const entity = type === 'ticket' ? Ticket : ExtraItem;
  return f.source.getRepository(entity).save({ codigo_unico: randomUUID(), qrCode: 'qr', userId: data.buyer.id,
    status: 'active', purchasePrice: 25,
    ...(type === 'ticket' ? { ticketTypeId: data.ticketType.id } : { eventProductId: data.eventProduct.id, quantity: 3 }), ...changes });
}

for (const type of ['ticket', 'extra']) {
  test(`${type}: owner can redeem once; a repeated QR cannot be reused`, async () => {
    const item = await voucher(type);
    const result = await service.validateTicket(item.codigo_unico, data.owner.id, ['organizer']);
    assert.equal(result.success, true);
    assert.equal(result.type, type);
    assert.equal((result.ticket || result.extra).scannedById, data.owner.id);
    if (type === 'extra') assert.equal(result.extra.quantity, 3, 'One voucher redeems the complete purchased quantity');
    const repeated = await service.validateTicket(item.codigo_unico, data.owner.id, ['organizer']);
    assert.equal(repeated.code, 'ALREADY_USED');
    assert.ok(repeated.usedAt);
  });
  test(`${type}: unassigned scanners cannot redeem another organizer's voucher`, async () => {
    const item = await voucher(type);
    assert.equal((await service.validateTicket(item.codigo_unico, data.scanner.id, ['scanner'])).code, 'FORBIDDEN');
  });
  test(`${type}: two concurrent scans produce exactly one redemption`, async () => {
    const item = await voucher(type);
    const results = await Promise.all([1, 2].map(() => service.validateTicket(item.codigo_unico, data.owner.id, ['organizer'])));
    assert.equal(results.filter(result => result.success).length, 1);
    assert.ok(['RACE_CONDITION', 'ALREADY_USED'].includes(results.find(result => !result.success).code));
  });
  test(`${type}: cancelled vouchers cannot be redeemed`, async () => {
    const item = await voucher(type, { status: 'cancelled' });
    assert.equal((await service.validateTicket(item.codigo_unico, data.owner.id, ['organizer'])).code, 'CANCELLED');
  });
}

test('assignment grants both voucher types; revocation takes effect immediately', async () => {
  const { ScannerOrganizerAssignment } = f.load('scanner/scanner-organizer-assignment.entity.ts');
  const assignment = await f.source.getRepository(ScannerOrganizerAssignment).save({ organizerId: data.owner.id,
    scannerId: data.scanner.id, isActive: true });
  for (const type of ['ticket', 'extra']) {
    const item = await voucher(type);
    assert.equal((await service.validateTicket(item.codigo_unico, data.scanner.id, ['scanner'])).success, true);
  }
  await f.source.getRepository(ScannerOrganizerAssignment).update(assignment.id, { isActive: false });
  const item = await voucher();
  assert.equal((await service.validateTicket(item.codigo_unico, data.scanner.id, ['scanner'])).code, 'FORBIDDEN');
});

test('malformed, non-UUID and oversized scan codes fail before any query', async () => {
  let queries = 0;
  const logQuery = f.source.logger.logQuery;
  f.source.logger.logQuery = () => { queries++; };
  try {
    for (const code of [null, {}, 42, '', '123', 'x'.repeat(10000), 'https://example.com/not-a-code']) {
      assert.equal((await service.validateTicket(code, data.owner.id, ['organizer'])).code, 'INVALID_CODE');
    }
    assert.equal(queries, 0);
  } finally { f.source.logger.logQuery = logQuery; }
});

test('URL QR codes retain their UUID when a query or fragment is present', async () => {
  const item = await voucher();
  const result = await service.validateTicket(`https://event-life.netlify.app/ticket/${item.codigo_unico}?source=qr#ticket`, data.owner.id, ['organizer']);
  assert.equal(result.success, true);
});

for (const type of ['ticket', 'extra']) {
  for (const [offsetHours, expected] of [[-25, 'EVENT_PAST'], [4, 'EVENT_NOT_STARTED'], [-1, undefined]]) {
    test(`${type}: scanning window at ${offsetHours} hours follows the event's instant`, async () => {
      const { Event } = f.load('event/event.entity.ts');
      await f.source.getRepository(Event).update(data.event.id, { startDateTime: new Date(Date.now() + offsetHours * 3600000) });
      try {
        const item = await voucher(type);
        const result = await service.validateTicket(item.codigo_unico, data.owner.id, ['organizer']);
        assert.equal(result.code, expected);
        assert.equal(result.success, !expected);
      } finally { await f.source.getRepository(Event).update(data.event.id, { startDateTime: data.event.startDateTime }); }
    });
  }
  test(`${type}: inactive events and soft deleted vouchers cannot be redeemed`, async () => {
    const { Event } = f.load('event/event.entity.ts');
    const entity = type === 'ticket' ? f.load('ticket/ticket.entity.ts').Ticket : f.load('extra/extraItem.entity.ts').ExtraItem;
    const item = await voucher(type);
    await f.source.getRepository(Event).update(data.event.id, { active: false });
    try { assert.equal((await service.validateTicket(item.codigo_unico, data.owner.id, ['organizer'])).code, 'INACTIVE_EVENT'); }
    finally { await f.source.getRepository(Event).update(data.event.id, { active: true }); }
    await f.source.getRepository(entity).softDelete(item.id);
    assert.equal((await service.validateTicket(item.codigo_unico, data.owner.id, ['organizer'])).code, 'NOT_FOUND');
  });
  test(`${type}: an administrator may redeem across organizers`, async () => {
    const item = await voucher(type);
    assert.equal((await service.validateTicket(item.codigo_unico, data.stranger.id, ['admin'])).success, true);
  });
}

test('scanner HTTP endpoint reports an inactive extra as a conflict with a stable error code', async () => {
  const { EventProduct } = f.load('extra/eventProduct.entity.ts');
  const item = await voucher('extra');
  await f.source.getRepository(EventProduct).update(data.eventProduct.id, { isActive: false });
  try {
    const response = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    await f.load('scanner/scanner.controller.ts').ScannerController.validateTicket({ user: { id: data.owner.id, roles: ['organizer'] }, body: { code: item.codigo_unico } }, response);
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.code, 'INACTIVE_EXTRA');
  } finally { await f.source.getRepository(EventProduct).update(data.eventProduct.id, { isActive: true }); }
});

test('legacy ticket validation endpoint redeems extras without consuming them and returning 500', async () => {
  const item = await voucher('extra');
  const response = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  await f.load('ticket/ticket.controller.ts').validateTicket({ user: { id: data.owner.id, roles: ['organizer'] }, body: { code: item.codigo_unico } }, response);
  assert.equal((await f.source.getRepository(f.load('extra/extraItem.entity.ts').ExtraItem).findOneByOrFail({ id: item.id })).status, 'used');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.valid, true);
  assert.equal(response.body.type, 'extra');
  assert.equal(response.body.extra.quantity, 3);
  assert.equal(response.body.extra.status, 'used');
});
