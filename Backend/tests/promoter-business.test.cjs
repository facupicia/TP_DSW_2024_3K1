const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { businessFixture, seedCommerce } = require('./business-fixture.cjs');
let f, data, group, Group, Assignment, controller, service;
const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
before(async () => {
  f = await businessFixture(); data = await seedCommerce(f);
  ({ PromoterGroup: Group, PromoterEventAssignment: Assignment } = f.load('promoter/promoter.entity.ts'));
  group = await f.source.getRepository(Group).save({ organizerId: data.owner.id, promoterId: data.scanner.id,
    commissionPercentage: 10, promoterCode: 'PROMOTER', isActive: true });
  service = f.load('promoter/promoter.service.ts'); controller = f.load('promoter/promoter.controller.ts');
});
after(async () => { if (f) await f.close(); });
beforeEach(async () => { await f.source.getRepository(Assignment).clear(); await f.source.getRepository(Group).update(group.id, { isActive: true }); });

test('an organizer cannot assign a different organizer\'s promoter to events', async () => {
  const res = response();
  await controller.assignPromoterToEvent({ user: { id: data.stranger.id, roles: ['organizer'] }, params: { id: String(group.id) },
    body: { eventId: data.event.id } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(await f.source.getRepository(Assignment).count(), 0);
});

test('an organizer cannot remove another organizer\'s promoter event assignment', async () => {
  const assignment = await f.source.getRepository(Assignment).save({ promoterGroupId: group.id, eventId: data.event.id, isActive: true });
  const res = response();
  await controller.removePromoterFromEvent({ user: { id: data.stranger.id, roles: ['organizer'] },
    params: { id: String(group.id), eventId: String(data.event.id) } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal((await f.source.getRepository(Assignment).findOneByOrFail({ id: assignment.id })).isActive, true);
});

test('the owning organizer can remove and reactivate a promoter event assignment', async () => {
  const created = await service.assignToEvent(group.id, data.event.id, 15);
  await service.removeFromEvent(group.id, data.event.id);
  const restored = await service.assignToEvent(group.id, data.event.id, 20);
  assert.equal(restored.id, created.id);
  const row = await f.source.getRepository(Assignment).findOneByOrFail({ id: restored.id });
  assert.equal(row.isActive, true);
  assert.equal(Number(row.customCommissionPercentage), 20);
});

test('inactive promoters cannot receive new active event assignments', async () => {
  await f.source.getRepository(Group).update(group.id, { isActive: false });
  await assert.rejects(service.assignToEvent(group.id, data.event.id), error => error.code === 'PROMOTER_INACTIVE');
});

test('malformed commission values are rejected instead of being partially parsed', async () => {
  for (const value of ['10garbage', '  ', null, {}, -1, 101, Infinity]) {
    await assert.rejects(service.updatePromoter(group.id, { commissionPercentage: value }), error => error.code === 'INVALID_COMMISSION');
  }
});

test('promoter codes cannot inject separators into checkout references', async () => {
  await assert.rejects(service.updatePromoter(group.id, { promoterCode: 'PROMO|OTHER|ACCOUNT' }), error => error.code === 'INVALID_PROMOTER_CODE');
});
