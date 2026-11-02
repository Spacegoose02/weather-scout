import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, cookieFrom, mockFetch } from './helpers.js';

const camEnv = {
  CAMERA_FEEDS_JSON: JSON.stringify({ feeds: [{ id: 'va', name: 'Test 511', type: 'ibi511', baseUrl: 'https://511.example', keyEnv: 'TEST_511_KEY' }] }),
  TEST_511_KEY: 'sekret',
};

test('GET /api/weather bundles forecast, alerts, air and kid mode', async () => {
  const { app } = await testApp();
  const res = await app.inject('/api/weather?lat=37.54&lon=-77.43');
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.forecast.daily.length, 10);
  assert.equal(body.alerts[0].event, 'Tornado Warning');
  assert.equal(body.air.aqi, 42);
  assert.equal(body.kid.playground.rating, 'red');
  await app.close();
});

test('NWS gets a User-Agent and results are cached', async () => {
  const { app, fetchImpl } = await testApp({ env: { NWS_USER_AGENT: 'TestScout (me@example.com)' } });
  await app.inject('/api/weather?lat=37.54&lon=-77.43');
  await app.inject('/api/weather?lat=37.541&lon=-77.431');
  const nwsCalls = fetchImpl.calls.filter((c) => c.url.includes('api.weather.gov'));
  assert.equal(nwsCalls.length, 1);
  assert.equal(nwsCalls[0].opts.headers['User-Agent'], 'TestScout (me@example.com)');
  await app.close();
});

test('weather still works when NWS is down', async () => {
  const fetchImpl = mockFetch({ 'api.weather.gov': () => new Response('down', { status: 503 }) });
  const { app } = await testApp({ fetchImpl });
  const res = await app.inject('/api/weather?lat=37.54&lon=-77.43');
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().alertsAvailable, false);
  await app.close();
});

test('forecast failure is a friendly 502', async () => {
  const fetchImpl = mockFetch({ 'api.open-meteo.com': () => new Response('x', { status: 500 }) });
  const { app } = await testApp({ fetchImpl });
  const res = await app.inject('/api/weather?lat=37.54&lon=-77.43');
  assert.equal(res.statusCode, 502);
  await app.close();
});

test('bad coordinates are rejected', async () => {
  const { app } = await testApp();
  assert.equal((await app.inject('/api/weather?lat=200&lon=0')).statusCode, 400);
  await app.close();
});

test('cameras are filtered to the map view and keys stay server side', async () => {
  const { app, fetchImpl } = await testApp({ env: camEnv });
  const res = await app.inject('/api/cameras?south=37&west=-78&north=38&east=-77');
  const body = res.json();
  assert.equal(body.cameras.length, 1);
  assert.equal(body.cameras[0].id, 'va:1');
  assert.equal(body.cameras[0].imageUrl, '/api/cameras/image/va%3A1');
  assert.ok(!JSON.stringify(body).includes('sekret'));
  assert.ok(!JSON.stringify(body).includes('cams.example'));
  assert.ok(fetchImpl.calls.some((c) => c.url.includes('key=sekret')));
  const img = await app.inject(body.cameras[0].imageUrl);
  assert.equal(img.statusCode, 200);
  assert.equal(img.headers['content-type'], 'image/jpeg');
  assert.equal((await app.inject('/api/cameras/image/nope')).statusCode, 404);
  await app.close();
});

test('first-run setup creates an admin, then local login works', async () => {
  const { app } = await testApp();
  let cfg = (await app.inject('/api/config')).json();
  assert.equal(cfg.auth.needsSetup, true);
  const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'mom', password: 'password123' } });
  assert.equal(setup.statusCode, 200);
  assert.equal(setup.json().user.isAdmin, true);
  const again = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'x', password: 'password123' } });
  assert.equal(again.statusCode, 409);
  const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'mom', password: 'nope-nope' } });
  assert.equal(bad.statusCode, 401);
  const good = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'mom', password: 'password123' } });
  const cookie = cookieFrom(good);
  const me = (await app.inject({ url: '/api/auth/me', headers: { cookie } })).json();
  assert.equal(me.user.username, 'mom');
  await app.close();
});

test('preferences are saved per user', async () => {
  const { app } = await testApp({ env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } });
  const cookie = cookieFrom(login);
  const put = await app.inject({ method: 'PUT', url: '/api/me/preferences', headers: { cookie }, payload: { kidMode: true, locations: [{ name: 'Home', lat: 1, lon: 2 }] } });
  assert.equal(put.statusCode, 200);
  const get = (await app.inject({ url: '/api/me/preferences', headers: { cookie } })).json();
  assert.equal(get.kidMode, true);
  assert.equal((await app.inject('/api/me/preferences')).statusCode, 401);
  await app.close();
});

test('tinyauth headers are ignored unless trusted', async () => {
  const { app } = await testApp();
  const me = (await app.inject({ url: '/api/auth/me', headers: { 'remote-user': 'kid@example.com' } })).json();
  assert.equal(me.user, null);
  await app.close();
});

test('tinyauth SSO auto-creates users, and admin can link SSO to an existing username', async () => {
  const { app } = await testApp({ env: { AUTH_TRUST_PROXY_HEADERS: 'true', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } });
  const admin = { cookie: cookieFrom(login) };

  const created = await app.inject({ method: 'POST', url: '/api/admin/users', headers: admin, payload: { username: 'sam', password: 'password123', displayName: 'Sam' } });
  assert.equal(created.statusCode, 200);
  const samId = created.json().user.id;
  const link = await app.inject({ method: 'PATCH', url: `/api/admin/users/${samId}`, headers: admin, payload: { ssoSubject: 'sam@family.example' } });
  assert.equal(link.json().user.ssoSubject, 'sam@family.example');

  const viaSso = (await app.inject({ url: '/api/auth/me', headers: { 'remote-user': 'sam@family.example' } })).json();
  assert.equal(viaSso.user.username, 'sam');

  const newbie = (await app.inject({ url: '/api/auth/me', headers: { 'remote-user': 'grandpa@family.example', 'remote-name': 'Grandpa' } })).json();
  assert.equal(newbie.user.username, 'grandpa');
  assert.equal(newbie.user.displayName, 'Grandpa');
  assert.equal(newbie.user.isAdmin, false);

  const forbidden = await app.inject({ url: '/api/admin/users', headers: { 'remote-user': 'grandpa@family.example' } });
  assert.equal(forbidden.statusCode, 403);
  await app.close();
});

test('AUTH_REQUIRED blocks weather for guests', async () => {
  const { app } = await testApp({ env: { AUTH_REQUIRED: 'true' } });
  assert.equal((await app.inject('/api/weather?lat=37.54&lon=-77.43')).statusCode, 401);
  assert.equal((await app.inject('/api/config')).statusCode, 200);
  await app.close();
});

test('cannot remove the last admin', async () => {
  const { app } = await testApp({ env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } });
  const headers = { cookie: cookieFrom(login) };
  const users = (await app.inject({ url: '/api/admin/users', headers })).json().users;
  const res = await app.inject({ method: 'DELETE', url: `/api/admin/users/${users[0].id}`, headers });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test('app keys: admin makes one, Den-Duty reads the summary with it, revoke stops it', async () => {
  const { app } = await testApp({ env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123', AUTH_REQUIRED: 'true' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } });
  const headers = { cookie: cookieFrom(login) };
  const made = (await app.inject({ method: 'POST', url: '/api/admin/app-keys', headers, payload: { name: 'Den-Duty' } })).json();
  assert.match(made.key, /^wsk_/);
  const listed = (await app.inject({ url: '/api/admin/app-keys', headers })).json().keys;
  assert.equal(listed[0].name, 'Den-Duty');
  assert.ok(!JSON.stringify(listed).includes(made.key));

  assert.equal((await app.inject('/api/connect/summary')).statusCode, 401);
  assert.equal((await app.inject({ url: '/api/connect/summary', headers: { authorization: 'Bearer wsk_wrongwrongwrongwrongwrong' } })).statusCode, 401);
  const res = await app.inject({ url: '/api/connect/summary', headers: { authorization: `Bearer ${made.key}` } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.location.name, 'Richmond, VA');
  assert.equal(body.playground.rating, 'red');
  assert.equal(body.alerts[0].event, 'Tornado Warning');
  assert.ok(Array.isArray(body.checklist));
  assert.ok(!('description' in body.alerts[0]));
  assert.ok((await app.inject({ url: '/api/admin/app-keys', headers })).json().keys[0].lastUsedAt);

  await app.inject({ method: 'DELETE', url: `/api/admin/app-keys/${made.id}`, headers });
  assert.equal((await app.inject({ url: '/api/connect/summary', headers: { authorization: `Bearer ${made.key}` } })).statusCode, 401);
  await app.close();
});

test('app keys are admin only', async () => {
  const { app } = await testApp();
  assert.equal((await app.inject({ method: 'POST', url: '/api/admin/app-keys', payload: { name: 'x' } })).statusCode, 401);
  await app.close();
});
