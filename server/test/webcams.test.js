import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, mockFetch, cookieFrom } from './helpers.js';
import { normalizeWebcam } from '../src/webcams.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const cam = (id, lat, lon, extra = {}) => ({
  webcamId: id,
  title: `Cam ${id}`,
  status: 'active',
  lastUpdatedOn: '2026-11-03T01:50:00.000Z',
  location: { latitude: lat, longitude: lon, city: 'Richmond', region: 'Virginia', country: 'United States' },
  images: { current: { thumbnail: `https://images-webcams.windy.com/${id}/t.jpg?token=abc`, preview: `https://images-webcams.windy.com/${id}/p.jpg?token=abc` }, daylight: { preview: `https://images-webcams.windy.com/${id}/d.jpg?token=abc` } },
  player: { day: `https://webcams.windy.com/webcams/public/embed/player/${id}/day` },
  urls: { detail: `https://www.windy.com/webcams/${id}` },
  ...extra,
});
const windy = (handler) => mockFetch({ 'api.windy.com/webcams': handler });

test('without a Webcams key the layer is off, and the map key does not turn it on', async () => {
  const { app, fetchImpl } = await testApp({ env: { WINDY_MAP_KEY: 'map-key' } });
  assert.equal((await app.inject('/api/webcams/info')).json().enabled, false);
  assert.equal((await app.inject('/api/webcams?south=37&west=-78&north=38&east=-77')).statusCode, 404);
  assert.equal((await app.inject('/api/webcams/near?lat=37.5&lon=-77.4')).statusCode, 404);
  assert.ok(!fetchImpl.calls.some((c) => c.url.includes('/webcams/')));
  await app.close();
});

test('webcams in view come from Windy with the key in a header, are cached, and keep Windy links', async () => {
  const fetchImpl = windy(() => json({ total: 2, webcams: [cam(1, 37.55, -77.44), cam(2, 40.7, -74.0), { webcamId: 3, location: {} }] }));
  const { app } = await testApp({ env: { WINDY_WEBCAMS_KEY: 'webcam-secret' }, fetchImpl });
  assert.equal((await app.inject('/api/webcams/info')).json().enabled, true);
  assert.ok(!(await app.inject('/api/config')).body.includes('webcam-secret'));

  const res = await app.inject('/api/webcams?south=37.2&west=-77.9&north=37.9&east=-77.1');
  assert.equal(res.statusCode, 200, res.body);
  assert.ok(!res.body.includes('webcam-secret'));
  const body = res.json();
  assert.deepEqual(body.webcams.map((c) => c.id), ['1'], 'only cams inside the view');
  assert.equal(body.webcams[0].link, 'https://www.windy.com/webcams/1');
  assert.match(body.webcams[0].preview, /^https:\/\/images-webcams\.windy\.com\//, 'pictures load straight from Windy');
  assert.equal(body.attribution.text, 'Webcams provided by Windy.com');
  assert.match(res.headers['cache-control'], /max-age=60/);

  const calls = fetchImpl.calls.filter((c) => c.url.includes('api.windy.com/webcams'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.headers['x-windy-api-key'], 'webcam-secret');
  assert.ok(!calls[0].url.includes('webcam-secret'), 'key is never in the URL');
  const u = new URL(calls[0].url);
  const [n, e, s, w] = u.searchParams.get('bbox').split(',').map(Number);
  assert.ok(n >= 37.9 && s <= 37.2 && e >= -77.1 && w <= -77.9, u.searchParams.get('bbox'));
  assert.match(u.searchParams.get('include'), /images/);

  await app.inject('/api/webcams?south=37.21&west=-77.91&north=37.89&east=-77.11');
  assert.equal(fetchImpl.calls.filter((c) => c.url.includes('api.windy.com/webcams')).length, 1, 'nearby views share the cache');

  const far = (await app.inject('/api/webcams?south=25&west=-100&north=45&east=-70')).json();
  assert.equal(far.zoomIn, true);
  assert.equal(fetchImpl.calls.filter((c) => c.url.includes('api.windy.com/webcams')).length, 1, 'zoomed far out costs nothing');
  await app.close();
});

test('near me lists the closest webcams first, with distances', async () => {
  const fetchImpl = windy(() => json({ total: 2, webcams: [cam(9, 37.9, -77.4), cam(8, 37.56, -77.45)] }));
  const { app } = await testApp({ env: { WINDY_WEBCAMS_KEY: 'k' }, fetchImpl });
  const r = (await app.inject('/api/webcams/near?lat=37.55&lon=-77.44&radius=50')).json();
  assert.deepEqual(r.webcams.map((c) => c.id), ['8', '9']);
  assert.ok(r.webcams[0].km < 2);
  assert.equal(r.radiusKm, 50);
  const u = new URL(fetchImpl.calls.find((c) => c.url.includes('api.windy.com/webcams')).url);
  assert.equal(u.searchParams.get('nearby'), '37.55,-77.44,50');
  await app.close();
});

test('Windy errors become a friendly 502', async () => {
  const { app } = await testApp({ env: { WINDY_WEBCAMS_KEY: 'k' }, fetchImpl: windy(() => json({ message: 'nope' }, 500)) });
  const res = await app.inject('/api/webcams/near?lat=37.55&lon=-77.44');
  assert.equal(res.statusCode, 502);
  assert.match(res.json().error, /unavailable/);
  await app.close();
});

test('the key is saved in App settings (write-only) and Test checks it', async () => {
  const fetchImpl = windy((u, opts) => (opts.headers['x-windy-api-key'] === 'good-key' ? json({ total: 37, webcams: [cam(1, 37.55, -77.44)] }) : json({ message: 'Unauthorized' }, 401)));
  const { app } = await testApp({ env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123', AUTH_REQUIRED: 'true' }, fetchImpl });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } });
  const headers = { cookie: cookieFrom(login) };
  const call = (method, url, payload) => app.inject({ method, url, headers, payload });

  const row = (await call('GET', '/api/admin/settings')).json().settings.find((s) => s.key === 'WINDY_WEBCAMS_KEY');
  assert.equal(row.group, 'maps');
  assert.equal(row.secret, true);
  assert.equal(row.test, 'webcams');

  let t = (await call('POST', '/api/admin/settings/test', { target: 'webcams', values: {} })).json();
  assert.equal(t.ok, false);
  assert.match(t.message, /Add the Windy Webcams key/);
  t = (await call('POST', '/api/admin/settings/test', { target: 'webcams', values: { WINDY_WEBCAMS_KEY: 'bad' } })).json();
  assert.equal(t.ok, false);
  assert.match(t.message, /turned that key down/);
  t = (await call('POST', '/api/admin/settings/test', { target: 'webcams', values: { WINDY_WEBCAMS_KEY: 'good-key' } })).json();
  assert.equal(t.ok, true, t.message);
  assert.match(t.message, /37 webcams/);

  assert.equal((await call('GET', '/api/webcams/info')).json().enabled, false);
  assert.equal((await call('PUT', '/api/admin/settings', { values: { WINDY_WEBCAMS_KEY: 'good-key' } })).statusCode, 200);
  const view = await call('GET', '/api/admin/settings');
  assert.ok(!view.body.includes('good-key'));
  assert.equal((await call('GET', '/api/webcams/info')).json().enabled, true, 'turns on without a restart');
  assert.equal((await call('GET', '/api/webcams?south=37.2&west=-77.9&north=37.9&east=-77.1')).json().webcams.length, 1);

  await call('PUT', '/api/admin/settings', { values: { WINDY_WEBCAMS_KEY: '' } });
  assert.equal((await call('GET', '/api/webcams/info')).json().enabled, false);
  assert.equal((await app.inject('/api/webcams/info')).statusCode, 401, 'needs sign-in when the app does');
  await app.close();
});

test('normalizeWebcam drops non-https images and falls back to a windy.com link', () => {
  const c = normalizeWebcam(cam(5, 1, 2, { images: { current: { preview: 'http://insecure/p.jpg' } }, urls: {}, player: {} }));
  assert.equal(c.preview, null);
  assert.equal(c.player, null);
  assert.equal(c.link, 'https://www.windy.com/webcams/5');
  assert.equal(normalizeWebcam({ webcamId: 1 }), null);
});
