const { test } = require('node:test');
const assert = require('node:assert/strict');
const zod = require('zod');
const { load } = require('./helpers.cjs');

test('oversized invitation batches fail before validating each email', () => {
  const { inviteGuestsSchema } = load('schemas/schema.ticket.ts', { zod });
  const result = inviteGuestsSchema.safeParse({ body: {
    ticketTypeId: 1, emails: Array(51).fill('invalid'), quantity: 1
  } });
  assert.equal(result.success, false);
  assert.equal(result.error.issues.length, 1);
  assert.equal(result.error.issues[0].code, 'too_big');
});

test('role lists and event ticket type lists have explicit collection limits', () => {
  const { RolesArray } = load('schemas/schema.user.ts', { zod });
  assert.equal(RolesArray.safeParse(Array(6).fill('user')).success, false);
  assert.deepEqual(Array.from(RolesArray.parse(undefined)), ['user']);
  const { updateEventSchema } = load('schemas/schema.event.ts', { zod });
  const result = updateEventSchema.safeParse({ params: { id: '1' }, body: {
    ticketTypes: Array(1001).fill({ price: 'invalid' })
  } });
  assert.equal(result.success, false);
  assert.equal(result.error.issues.length, 1);
  assert.equal(result.error.issues[0].code, 'too_big');
});

test('request validation preserves coercion and defaults and returns safe field errors', () => {
  const { inviteGuestsSchema } = load('schemas/schema.ticket.ts', { zod });
  const { schemaValidation } = load('common/middleware/schemaValidacion.ts', { zod });
  const validate = schemaValidation(inviteGuestsSchema);
  const req = { body: { ticketTypeId: '3', emails: ['guest@example.com'], extra: 'stripped' }, params: {}, query: {} };
  let passed = 0;
  validate(req, {}, () => { passed++; });
  assert.equal(passed, 1);
  assert.equal(req.body.ticketTypeId, 3);
  assert.equal(req.body.quantity, 1);
  assert.equal(req.body.extra, undefined);
  let status, errors;
  validate({ body: { ticketTypeId: 3, emails: ['invalid'] } }, {
    status(value) { status = value; return this; }, json(value) { errors = value; }
  }, () => { throw new Error('invalid input accepted'); });
  assert.equal(status, 400);
  assert.equal(errors[0].path.join('.'), 'body.emails.0');
  assert.equal(Object.hasOwn(errors[0], 'input'), false);
});
