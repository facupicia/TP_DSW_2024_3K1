// Explicit production check. Creates and removes only its own synthetic user.
// Run inside the deployed container with EVENTLIFE_SMOKE_ALLOW_TEMP_USER=true.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

if (process.env.EVENTLIFE_SMOKE_ALLOW_TEMP_USER !== 'true') {
  throw new Error('Set EVENTLIFE_SMOKE_ALLOW_TEMP_USER=true to authorize the temporary smoke user');
}
process.env.DB_SYNC = 'false';
const db = require('../dist/config/database').default;
const base = process.env.SMOKE_BASE_URL || 'https://api.vidaeventofiesta.site';
const origin = process.env.CLIENT_URL;
const email = `release-smoke-${crypto.randomUUID()}@example.invalid`;
const password = crypto.randomBytes(24).toString('base64url');
const nextPassword = crypto.randomBytes(24).toString('base64url');
let created = false;

async function request(path, { method = 'GET', body, token, cookie } = {}) {
  return fetch(base + path, {
    method, signal: AbortSignal.timeout(20000),
    headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

function refreshCookie(response) {
  const value = response.headers.getSetCookie().find(cookie => cookie.startsWith('eventlife_refresh='));
  assert.ok(value, 'refresh cookie missing');
  assert.match(value, /HttpOnly/i);
  assert.match(value, /Secure/i);
  assert.match(value, /SameSite=None/i);
  return value.split(';')[0];
}

(async () => {
  try {
    await db.initialize();
    const signup = await request('/api/user/register', { method: 'POST', body: {
      firstname: 'Release', lastname: 'Smoke', email, password, phone: '1111111111',
      pais: 'Argentina', provincia: 'Santa Fe', ciudad: 'Rosario', address: 'Temporary release verification', birth: '1990-01-01'
    } });
    assert.equal(signup.status, 201, 'registration failed');
    created = true;
    const denied = await request('/api/user/login', { method: 'POST', body: { email, password: password + '-wrong' } });
    assert.equal(denied.status, 401, 'invalid credentials accepted');
    const login = await request('/api/user/login', { method: 'POST', body: { email, password } });
    assert.equal(login.status, 200, 'login failed');
    const cookie = refreshCookie(login);
    const { token } = await login.json();
    assert.ok(token);
    const profile = await request('/api/user/profile', { token });
    assert.equal(profile.status, 200, 'profile failed');
    const user = await profile.json();
    assert.equal(user.email, email);
    assert.equal((await request('/api/admin/operations', { token })).status, 403, 'regular user reached admin operations');
    const refresh = await request('/api/user/refresh', { method: 'POST', cookie });
    assert.equal(refresh.status, 200, 'refresh failed');
    const rotatedCookie = refreshCookie(refresh);
    const rotated = await refresh.json();
    const changed = await request('/api/user/profile/' + user.id, {
      method: 'PUT', token: rotated.token, body: { currentPassword: password, password: nextPassword }
    });
    assert.equal(changed.status, 200, 'password change failed');
    assert.equal((await request('/api/user/profile', { token: rotated.token })).status, 401, 'old access token survived password change');
    assert.equal((await request('/api/user/refresh', { method: 'POST', cookie: rotatedCookie })).status, 401, 'old refresh survived password change');
    const newLogin = await request('/api/user/login', { method: 'POST', body: { email, password: nextPassword } });
    assert.equal(newLogin.status, 200, 'login after credentials change failed');
    const newCookie = refreshCookie(newLogin);
    const next = await newLogin.json();
    assert.equal((await request('/api/user/logout', { method: 'POST', token: next.token, cookie: newCookie })).status, 204, 'logout failed');
    assert.equal((await request('/api/user/refresh', { method: 'POST', cookie: newCookie })).status, 401, 'logged-out refresh remained active');
    console.log('PASS: HTTPS registration, login, secure cookies, profile, RBAC, refresh, credentials revocation and logout.');
  } catch (error) {
    console.error('Production smoke failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (created && db.isInitialized) {
      await db.transaction(async manager => {
        const [user] = await manager.query('SELECT id FROM "user" WHERE email=$1 FOR UPDATE', [email]);
        if (!user) throw new Error('Synthetic user missing during cleanup');
        assert.match(email, /^release-smoke-[0-9a-f-]+@example\.invalid$/);
        await manager.query('DELETE FROM refresh_token WHERE "userId"=$1', [user.id]);
        await manager.query('DELETE FROM user_roles WHERE "userId"=$1', [user.id]);
        await manager.query('DELETE FROM "user" WHERE id=$1 AND email=$2', [user.id, email]);
      });
      console.log('PASS: temporary smoke user and sessions removed.');
    }
    if (db.isInitialized) await db.destroy();
  }
})();
