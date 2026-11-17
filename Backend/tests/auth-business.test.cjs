const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { businessFixture, seedCommerce } = require('./business-fixture.cjs');
let f, data, models, reset, profile;
before(async () => {
  f = await businessFixture(); data = await seedCommerce(f);
  reset = f.load('user/passwordReset.service.ts'); profile = f.load('user/user.service.ts');
  models = Object.assign({}, ...['user/user.entity.ts', 'user/refreshToken.entity.ts', 'user/accountClaimToken.entity.ts', 'queue/outbox.entity.ts'].map(f.load));
});
after(async () => { if (f) await f.close(); });
beforeEach(async () => {
  await f.source.query('TRUNCATE refresh_token, account_claim_token, outbox_job RESTART IDENTITY CASCADE');
  await f.source.getRepository(models.User).update(data.buyer.id, { password: await bcrypt.hash('InitialPassword1!', 4), credentialsVersion: 0, isGuestAccount: false });
});
async function resetToken() {
  await reset.requestPasswordReset(data.buyer.email);
  const job = await f.source.getRepository(models.OutboxJob).findOne({ where: { kind: 'email' }, select: ['payload'], order: { createdAt: 'DESC' } });
  return new URL(job.payload.payload.claimUrl).searchParams.get('token');
}

test('password reset keeps the email intent and token durable in the same transaction', async () => {
  const token = await resetToken();
  assert.ok(token.length >= 48);
  const link = await f.source.getRepository(models.AccountClaimToken).findOneByOrFail({ userId: data.buyer.id });
  assert.equal(link.purpose, 'reset');
  assert.equal(link.credentialsVersion, 0);
  assert.equal(link.usedAt, null);
});

test('concurrent password reset attempts consume the link exactly once and revoke existing sessions', async () => {
  await f.source.getRepository(models.RefreshToken).save({ userId: data.buyer.id, tokenHash: 'fixture-refresh-hash', expiresAt: new Date(Date.now() + 86400000) });
  const token = await resetToken();
  const result = await Promise.all([1, 2].map(() => reset.completePasswordReset(token, 'UpdatedPassword2!')));
  assert.equal(result.filter(Boolean).length, 1);
  const user = await f.source.getRepository(models.User).createQueryBuilder('u').addSelect('u.password').where('u.id=:id', { id: data.buyer.id }).getOne();
  assert.equal(user.credentialsVersion, 1);
  assert.equal(await bcrypt.compare('UpdatedPassword2!', user.password), true);
  assert.equal(await f.source.getRepository(models.RefreshToken).countBy({ userId: data.buyer.id, revokedAt: require('typeorm').IsNull() }), 0);
});

test('a new password reset request invalidates the previous unused link', async () => {
  const first = await resetToken();
  const second = await resetToken();
  assert.notEqual(first, second);
  assert.equal(await reset.completePasswordReset(first, 'UpdatedPassword2!'), false);
  assert.equal(await reset.completePasswordReset(second, 'UpdatedPassword2!'), true);
});

test('unknown accounts produce no reset token or outbound email', async () => {
  assert.equal(await reset.requestPasswordReset('missing@example.com'), undefined);
  assert.equal(await f.source.getRepository(models.AccountClaimToken).count(), 0);
  assert.equal(await f.source.getRepository(models.OutboxJob).count(), 0);
});

test('email and password changes require the current password and revoke all prior sessions', async () => {
  await f.source.getRepository(models.RefreshToken).save({ userId: data.buyer.id, tokenHash: 'fixture-profile-refresh', expiresAt: new Date(Date.now() + 86400000) });
  await assert.rejects(profile.update(data.buyer.id, { password: 'NewPassword3!', currentPassword: 'wrong-password' }), error => error.code === 'REAUTHENTICATION_REQUIRED');
  await profile.update(data.buyer.id, { password: 'NewPassword3!', currentPassword: 'InitialPassword1!' });
  const user = await f.source.getRepository(models.User).findOneByOrFail({ id: data.buyer.id });
  assert.equal(user.credentialsVersion, 1);
  assert.equal(await f.source.getRepository(models.RefreshToken).countBy({ userId: data.buyer.id, revokedAt: require('typeorm').IsNull() }), 0);
});
