import test from 'node:test';
import assert from 'node:assert/strict';
import { testApp, mockFetch } from './helpers.js';

const hit = { city: 'Richmond', region_code: 'VA', country_code: 'US', latitude: 37.5538, longitude: -77.4603 };

test('approximate location uses the server IP for LAN visitors and the visitor IP otherwise', async () => {
  const fetchImpl = mockFetch({ 'ipapi.co': () => Response.json(hit) });
  const { app } = await testApp({ fetchImpl });
  const lan = await app.inject({ url: '/api/ip-location', remoteAddress: '192.168.1.20' });
  assert.equal(lan.statusCode, 200);
  assert.deepEqual(lan.json(), { name: 'Richmond, VA', lat: 37.55, lon: -77.46, approximate: true });
  assert.ok(fetchImpl.calls.some((c) => c.url === 'https://ipapi.co/json/'));
  await app.inject({ url: '/api/ip-location', remoteAddress: '8.8.8.8' });
  assert.ok(fetchImpl.calls.some((c) => c.url === 'https://ipapi.co/8.8.8.8/json/'));
  await app.close();
});

test('approximate location errors and can be turned off', async () => {
  const fetchImpl = mockFetch({ 'ipapi.co': () => Response.json({ error: true, reason: 'RateLimited' }) });
  const { app } = await testApp({ fetchImpl });
  assert.equal((await app.inject({ url: '/api/ip-location' })).statusCode, 502);
  await app.close();
  const off = await testApp({ env: { IP_LOCATION: 'false' } });
  assert.equal((await off.app.inject({ url: '/api/ip-location' })).statusCode, 404);
  await off.app.close();
});
