import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, cookieFrom } from './helpers.js';

test('widget summary gives the Windows widget short strings and absolute image links', async () => {
  const { app } = await testApp();
  const res = await app.inject({ url: '/api/widget/summary', headers: { host: 'weather.example', 'x-forwarded-proto': 'https' } });
  assert.equal(res.statusCode, 200);
  const w = res.json();
  assert.equal(w.place, 'Richmond, VA');
  assert.match(w.temp, /^-?\d+°$/);
  assert.match(w.hiLo, /^High -?\d+° · Low -?\d+°$/);
  assert.equal(w.hasAlert, true);
  assert.match(w.alert, /^⚠️ (Tornado Warning|Wind Advisory) \(\+1 more\)$/);
  assert.equal(w.rockyUrl, 'https://weather.example/rocky/rocky-face.png');
  assert.equal(w.appUrl, 'https://weather.example/');
  assert.match(w.updatedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  await app.close();
});

test('widget summary follows the sign-in rule', async () => {
  const { app } = await testApp({ env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123', AUTH_REQUIRED: 'true' } });
  assert.equal((await app.inject('/api/widget/summary')).statusCode, 401);
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } });
  assert.equal((await app.inject({ url: '/api/widget/summary', headers: { cookie: cookieFrom(login) } })).statusCode, 200);
  await app.close();
});

test('assetlinks.json links the Android app only once a fingerprint is set', async () => {
  const off = await testApp();
  assert.equal((await off.app.inject('/.well-known/assetlinks.json')).statusCode, 404);
  await off.app.close();

  const fp = 'ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89';
  const { app } = await testApp({ env: { ANDROID_CERT_SHA256: `${fp}, 11:22`, AUTH_REQUIRED: 'true' } });
  const res = await app.inject('/.well-known/assetlinks.json');
  assert.equal(res.statusCode, 200);
  const [link] = res.json();
  assert.deepEqual(link.relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(link.target.package_name, 'app.weatherscout.android');
  assert.deepEqual(link.target.sha256_cert_fingerprints, [fp.toUpperCase(), '11:22']);
  await app.close();
});
