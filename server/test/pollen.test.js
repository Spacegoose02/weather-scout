import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGooglePollen, upiLevel, pollenUrl } from '../src/providers/pollen.js';
import { mockFetch, testApp } from './helpers.js';

const google = {
  regionCode: 'US',
  dailyInfo: [{
    date: { year: 2026, month: 4, day: 10 },
    pollenTypeInfo: [
      { code: 'GRASS', displayName: 'Grass', inSeason: true, indexInfo: { code: 'UPI', value: 2, category: 'Low' } },
      { code: 'TREE', displayName: 'Tree', inSeason: true, indexInfo: { code: 'UPI', value: 4, category: 'High' } },
      { code: 'WEED', displayName: 'Weed', inSeason: false }, // Google leaves indexInfo out off-season
    ],
  }],
};

test('Google pollen becomes tree/grass/weed in the same shape as the Europe counts', () => {
  const p = normalizeGooglePollen(google);
  assert.deepEqual(p.tree, { value: 4, level: 'High', inSeason: true });
  assert.deepEqual(p.grass, { value: 2, level: 'Low', inSeason: true });
  assert.deepEqual(p.weed, { value: 0, level: 'None', inSeason: false });
  assert.equal(p.unit, 'index');
  assert.equal(normalizeGooglePollen({}), null);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(upiLevel), ['None', 'Low', 'Low', 'Moderate', 'High', 'Very high']);
  assert.ok(!pollenUrl({ lat: 37.27, lon: -79.94 }).includes('key='), 'the key goes in a header, not the URL');
});

test('/api/air says a key is needed for US pollen, and uses Google once one is set', async () => {
  let { app } = await testApp();
  let air = (await app.inject({ url: '/api/air?lat=37.27&lon=-79.94' })).json();
  assert.equal(air.pollen, null);
  assert.equal(air.pollenMissing, 'needs-key');
  await app.close();

  const fetchImpl = mockFetch({ 'pollen.googleapis.com': () => Response.json(google) });
  ({ app } = await testApp({ env: { GOOGLE_POLLEN_API_KEY: 'test-key-1234' }, fetchImpl }));
  air = (await app.inject({ url: '/api/air?lat=37.27&lon=-79.94' })).json();
  assert.equal(air.pollen.tree.level, 'High');
  assert.equal(air.pollen.source, 'Google Pollen API');
  assert.equal(air.aqi, 42, 'air quality still comes from Open-Meteo');
  const call = fetchImpl.calls.find((c) => c.url.includes('pollen.googleapis.com'));
  assert.equal(call.opts.headers['x-goog-api-key'], 'test-key-1234');
  await app.close();
});

test('/api/air keeps working when Google pollen fails', async () => {
  const fetchImpl = mockFetch({ 'pollen.googleapis.com': () => new Response('{}', { status: 403 }) });
  const { app } = await testApp({ env: { GOOGLE_POLLEN_API_KEY: 'bad' }, fetchImpl });
  const air = (await app.inject({ url: '/api/air?lat=37.27&lon=-79.94' })).json();
  assert.equal(air.aqi, 42);
  assert.equal(air.pollen, null);
  assert.equal(air.pollenMissing, 'failed');
  await app.close();
});
