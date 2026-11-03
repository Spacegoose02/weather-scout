import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { testApp, mockFetch, cookieFrom } from './helpers.js';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ADMIN = { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123', AUTH_REQUIRED: 'true' };

async function admin(env = {}, fetchImpl = mockFetch(), extra = {}) {
  const { app, dataDir } = await testApp({ env: { ...ADMIN, ...env }, fetchImpl, ...extra });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } });
  const headers = { cookie: cookieFrom(login) };
  const call = (method, url, payload) => app.inject({ method, url, headers, payload });
  return { app, call, dataDir, headers };
}
const row = (res, key) => res.json().settings.find((s) => s.key === key);
const put = (call, values) => call('PUT', '/api/admin/settings', { values });

class FakeMqtt extends EventEmitter {
  constructor() { super(); this.connected = false; this.published = []; }
  publish(topic, payload) { this.published.push({ topic, payload }); }
  subscribe() {}
  end(force, opts, cb) { this.connected = false; (typeof opts === 'function' ? opts : cb)?.(); }
}

test('app settings list every group, mask secrets, and leave start-up settings alone', async () => {
  const { app, call } = await admin({ NY511_API_KEY: 'ny-secret-abcd', DEFAULT_LOCATION_NAME: 'Home' });
  const res = await call('GET', '/api/admin/settings');
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(res.body, /ny-secret/);
  assert.deepEqual([...new Set(res.json().settings.map((s) => s.group))], ['home', 'cameras', 'maps', 'stations', 'homeassistant', 'apps']);
  assert.equal(row(res, 'NY511_API_KEY').hint, 'abcd');
  assert.equal(row(res, 'DEFAULT_LOCATION_NAME').source, 'env');
  assert.ok(!res.json().settings.some((s) => s.group === 'ai'), 'AI has its own panel');
  for (const key of ['ADMIN_PASSWORD', 'AUTH_REQUIRED', 'AUTH_TRUST_PROXY_HEADERS', 'PORT', 'DATA_DIR', 'ANTHROPIC_API_KEY']) {
    assert.equal((await put(call, { [key]: 'x' })).statusCode, 400, key);
  }
  await app.close();
});

test('home place, units and sign-out link apply right away and survive a restart', async () => {
  const fetchImpl = mockFetch();
  const { app, call, dataDir } = await admin({}, fetchImpl);
  const res = await put(call, { DEFAULT_LOCATION_NAME: 'Asheville, NC', DEFAULT_LAT: '35.5951', DEFAULT_LON: '-82.5515', DEFAULT_UNITS: 'metric', SSO_LOGOUT_URL: 'https://auth.example.com/logout' });
  assert.equal(res.statusCode, 200, res.body);
  const cfg = (await app.inject('/api/config')).json();
  assert.deepEqual(cfg.defaultLocation, { name: 'Asheville, NC', lat: 35.5951, lon: -82.5515 });
  assert.equal(cfg.units, 'metric');
  assert.equal(cfg.auth.ssoLogoutUrl, 'https://auth.example.com/logout');
  assert.equal(app.homeAssistant.home.name, 'Asheville, NC');
  await app.close();

  const again = await buildApp({ config: loadConfig({ DATA_DIR: dataDir, WEB_DIST: `${dataDir}/no-web`, ...ADMIN }), fetchImpl, logger: false });
  assert.equal((await again.inject('/api/config')).json().units, 'metric');
  await again.close();
});

test('bad values are refused', async () => {
  const { app, call } = await admin();
  for (const values of [{ DEFAULT_LAT: '123' }, { DEFAULT_UNITS: 'kelvin' }, { MQTT_URL: 'http://broker' }, { HA_URL: 'ftp://ha' }, { STATION_POLL_SECONDS: '10' }, { TEMPEST_UDP_PORT: '1.5' }, { STATION_PUSH_TOKEN: 'has spaces' }]) {
    const res = await put(call, values);
    assert.equal(res.statusCode, 400, JSON.stringify(values));
  }
  await app.close();
});

test('a camera key saved in the app turns that state on, and Test checks it', async () => {
  const fetchImpl = mockFetch({
    'drivenc.gov/api/v2/get/cameras': (u) => (u.includes('key=good')
      ? json([{ Id: 7, Location: 'I-40 at Exit 50', Latitude: 35.6, Longitude: -82.5, Views: [{ Url: 'http://cams.example/7.jpg', Status: 'Enabled' }] }])
      : json({ error: 'bad key' }, 401)),
  });
  const { app, call } = await admin({ CAMERAS_DEFAULT_FEEDS: 'nc' }, fetchImpl);
  assert.deepEqual((await call('GET', '/api/admin/cameras')).json().needsKey.map((f) => f.id), ['nc']);

  let t = await call('POST', '/api/admin/settings/test', { target: 'camera:nc', values: { NC_DRIVENC_API_KEY: 'nope' } });
  assert.equal(t.json().ok, false);
  assert.match(t.json().message, /turned that key down/);
  t = await call('POST', '/api/admin/settings/test', { target: 'camera:nc', values: { NC_DRIVENC_API_KEY: 'good' } });
  assert.equal(t.json().ok, true, t.body);

  await put(call, { NC_DRIVENC_API_KEY: 'good' });
  const cams = (await call('GET', '/api/admin/cameras')).json();
  assert.deepEqual(cams.needsKey, []);
  assert.equal(cams.feeds[0].id, 'nc');
  await app.close();
});

test('Windy key and push alerts switch on and off without a restart', async () => {
  const { app, call } = await admin();
  assert.equal((await call('GET', '/api/windy')).json().mode, 'embed');
  await put(call, { WINDY_MAP_KEY: 'windy-key-1234' });
  assert.equal((await call('GET', '/api/windy')).json().mode, 'api');

  assert.equal((await call('GET', '/api/push/key')).statusCode, 200);
  await put(call, { PUSH_ENABLED: 'false' });
  assert.equal((await call('GET', '/api/push/key')).statusCode, 404);
  assert.equal(app.push, null);
  await put(call, { PUSH_ENABLED: 'true' });
  assert.equal((await call('GET', '/api/push/key')).statusCode, 200);
  await app.close();
});

test('saving MQTT settings reconnects Home Assistant when it is running', async () => {
  const clients = [];
  const mqttConnect = (url, opts) => {
    const c = new FakeMqtt();
    clients.push({ url, opts, c });
    return c;
  };
  const { app, call } = await admin({ PUSH_ENABLED: 'false' }, mockFetch(), { mqttConnect });
  app.startBackground();
  assert.equal(clients.length, 0);
  await put(call, { MQTT_URL: 'mqtt://broker.lan:1883', MQTT_USERNAME: 'ha', MQTT_PASSWORD: 'pw' });
  await new Promise((r) => setTimeout(r, 20));
  const main = clients.find((x) => !x.opts.clientId.includes('test'));
  assert.equal(main.url, 'mqtt://broker.lan:1883');
  assert.equal(main.opts.username, 'ha');
  assert.equal(app.homeAssistant.status().mqtt.enabled, true);
  await app.close();
});

test('Test buttons: MQTT, Home Assistant, Ambient and Tempest', async () => {
  const mqttConnect = (url, opts) => {
    const c = new FakeMqtt();
    setTimeout(() => (opts.password === 'right' ? c.emit('connect') : c.emit('error', new Error('Connection refused: Not authorized'))), 5);
    return c;
  };
  const fetchImpl = mockFetch({
    'ha.lan:8123/api/': (u, opts) => (opts.headers.authorization === 'Bearer good' ? json({ message: 'API running.' }) : json({}, 401)),
    'rt.ambientweather.net/v1/devices': () => json([{ macAddress: 'AA' }]),
    'swd.weatherflow.com/swd/rest/stations': () => json({ stations: [{ station_id: 42, name: 'Backyard' }] }),
  });
  const { app, call } = await admin({}, fetchImpl, { mqttConnect });
  const test = (target, values) => call('POST', '/api/admin/settings/test', { target, values }).then((r) => r.json());

  assert.equal((await test('mqtt', { MQTT_URL: 'mqtt://b.lan', MQTT_PASSWORD: 'right' })).ok, true);
  assert.match((await test('mqtt', { MQTT_URL: 'mqtt://b.lan', MQTT_PASSWORD: 'wrong' })).message, /username or password/);
  assert.equal((await test('homeassistant', { HA_URL: 'http://ha.lan:8123', HA_TOKEN: 'good' })).ok, true);
  assert.match((await test('homeassistant', { HA_URL: 'http://ha.lan:8123', HA_TOKEN: 'bad' })).message, /long-lived token/);
  assert.match((await test('ambient', { AMBIENT_API_KEY: 'a' })).message, /both/);
  assert.match((await test('ambient', { AMBIENT_API_KEY: 'a', AMBIENT_APPLICATION_KEY: 'b' })).message, /Found 1 station/);
  assert.match((await test('tempest', { TEMPEST_TOKEN: 't' })).message, /Backyard \(42\)/);
  // Testing never saves.
  assert.equal(row(await call('GET', '/api/admin/settings'), 'HA_URL').source, 'default');
  await app.close();
});
