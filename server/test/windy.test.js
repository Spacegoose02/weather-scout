import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { windyEmbedUrl, windyView } from '../../shared/windy.js';

test('without a key, Windy uses the free embed and the map page is off', async () => {
  const { app } = await testApp();
  const info = (await app.inject('/api/windy')).json();
  assert.equal(info.mode, 'embed');
  assert.ok(info.overlays.some((o) => o.id === 'wind' && o.kid));
  assert.ok(info.models.some((m) => m.id === 'ecmwf'));
  assert.equal((await app.inject('/api/windy/map?lat=37.5&lon=-77.4')).statusCode, 404);
  await app.close();
});

test('with WINDY_MAP_KEY, the Map Forecast API page is served with the key, but /api/config never has it', async () => {
  const { app } = await testApp({ env: { WINDY_MAP_KEY: 'windy-test-key' } });
  assert.equal((await app.inject('/api/windy')).json().mode, 'api');
  assert.ok(!(await app.inject('/api/config')).body.includes('windy-test-key'));
  const res = await app.inject('/api/windy/map?lat=37.5&lon=-77.4&zoom=7&overlay=gust&product=gfs&level=850h');
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.headers['content-security-policy'], /frame-ancestors 'self'/);
  assert.equal(res.headers['cache-control'], 'private, no-store');
  assert.match(res.body, /api\.windy\.com\/assets\/map-forecast\/libBoot\.js/);
  assert.match(res.body, /"key":"windy-test-key"/);
  assert.match(res.body, /"overlay":"gust","product":"gfs","level":"850h"/);
  await app.close();
});

test('Windy map page ignores unknown layers and rejects bad coordinates', async () => {
  const { app } = await testApp({ env: { WINDY_MAP_KEY: 'k' } });
  const res = await app.inject('/api/windy/map?lat=37.5&lon=-77.4&overlay=%3Cscript%3E');
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /"overlay":"wind"/);
  assert.ok(!res.body.includes('<script>"'));
  assert.equal((await app.inject('/api/windy/map?lat=200&lon=0')).statusCode, 400);
  await app.close();
});

test('Windy map page needs sign-in when the app does', async () => {
  const { app } = await testApp({ env: { WINDY_MAP_KEY: 'k', AUTH_REQUIRED: 'true' } });
  assert.equal((await app.inject('/api/windy/map?lat=37.5&lon=-77.4')).statusCode, 401);
  await app.close();
});

test('windyView clamps and defaults; embed URL carries units and the view', () => {
  assert.deepEqual(windyView({ lat: 99, lon: -500, zoom: 40, overlay: 'nope' }), { lat: 85, lon: -180, zoom: 11, overlay: 'wind', product: 'ecmwf', level: 'surface' });
  const u = new URL(windyEmbedUrl({ lat: 37.54, lon: -77.43, zoom: 7, overlay: 'rain', product: 'icon' }, 'imperial'));
  assert.equal(u.host, 'embed.windy.com');
  assert.equal(u.searchParams.get('overlay'), 'rain');
  assert.equal(u.searchParams.get('product'), 'icon');
  assert.equal(u.searchParams.get('metricWind'), 'mph');
  assert.equal(u.searchParams.get('metricTemp'), '°F');
  assert.equal(u.searchParams.get('lat'), '37.54');
  assert.equal(new URL(windyEmbedUrl({}, 'metric')).searchParams.get('metricWind'), 'km/h');
});
