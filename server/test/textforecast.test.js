import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, mockFetch } from './helpers.js';
import { normalizeTextForecast } from '../src/providers/nws.js';

const FORECAST_URL = 'https://api.weather.gov/gridpoints/RNK/120,80/forecast';

const periods = [
  { number: 1, name: 'Today', startTime: '2026-11-04T09:00:00-05:00', endTime: '2026-11-04T18:00:00-05:00', isDaytime: true, temperature: 73, temperatureUnit: 'F', probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: null }, windSpeed: '5 to 7 mph', windDirection: 'SE', shortForecast: 'Mostly Cloudy', detailedForecast: 'Mostly cloudy, with a high near 73. Calm wind becoming southeast 5 to 7 mph in the afternoon.' },
  { number: 2, name: 'Tonight', startTime: '2026-11-04T18:00:00-05:00', endTime: '2026-11-05T06:00:00-05:00', isDaytime: false, temperature: 62, temperatureUnit: 'F', probabilityOfPrecipitation: { value: 70 }, windSpeed: '6 mph', windDirection: 'SE', shortForecast: 'Showers Likely', detailedForecast: 'Showers likely, mainly between 10pm and 2am. Chance of precipitation is 70%.' },
  { number: 3, name: 'Thursday', isDaytime: true, temperature: 78, shortForecast: 'Patchy Fog', detailedForecast: '' },
  { number: 4, name: '', detailedForecast: 'No name, dropped' },
];

const points = { properties: { cwa: 'RNK', forecast: FORECAST_URL, relativeLocation: { properties: { city: 'Salem', state: 'VA' } } } };

test('normalizes NWS forecast periods', () => {
  const f = normalizeTextForecast({ properties: { updateTime: '2026-11-04T08:42:00+00:00', periods } });
  assert.equal(f.available, true);
  assert.equal(f.periods.length, 3);
  assert.equal(f.periods[0].name, 'Today');
  assert.equal(f.periods[0].precipChance, null);
  assert.equal(f.periods[0].wind, 'SE 5 to 7 mph');
  assert.equal(f.periods[1].precipChance, 70);
  assert.equal(f.periods[1].isDaytime, false);
  assert.equal(f.periods[2].detailed, 'Patchy Fog'); // falls back to the short text
  assert.equal(f.updatedAt, '2026-11-04T08:42:00+00:00');
  assert.deepEqual(normalizeTextForecast(null), { available: false, periods: [], updatedAt: null });
});

test('GET /api/forecast/text follows the points link and caches', async () => {
  const fetchImpl = mockFetch({
    'api.weather.gov/points': (u) => new Response(JSON.stringify(points), { status: 200 }),
    'api.weather.gov/gridpoints': (u) => new Response(JSON.stringify({ properties: { periods } }), { status: 200 }),
  });
  const { app } = await testApp({ fetchImpl });
  const res = await app.inject('/api/forecast/text?lat=37.29&lon=-80.05');
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.available, true);
  assert.equal(body.periods[1].name, 'Tonight');
  assert.equal(body.office, 'RNK');
  assert.equal(body.place, 'Salem, VA');
  await app.inject('/api/forecast/text?lat=37.291&lon=-80.051');
  assert.equal(fetchImpl.calls.filter((c) => c.url.includes('/gridpoints/')).length, 1);
  assert.ok(!fetchImpl.calls.find((c) => c.url.includes('/gridpoints/')).url.includes('units=si'));

  await app.inject('/api/forecast/text?lat=37.29&lon=-80.05&units=metric');
  assert.ok(fetchImpl.calls.some((c) => c.url === `${FORECAST_URL}?units=si`));
  await app.close();
});

test('GET /api/forecast/text says unavailable outside the US', async () => {
  const fetchImpl = mockFetch({ 'api.weather.gov/points': () => new Response('{}', { status: 404 }) });
  const { app } = await testApp({ fetchImpl });
  const res = await app.inject('/api/forecast/text?lat=51.5&lon=-0.12');
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().available, false);
  await app.close();
});

test('GET /api/forecast/text reports an NWS outage as an error', async () => {
  const fetchImpl = mockFetch({
    'api.weather.gov/points': () => new Response(JSON.stringify(points), { status: 200 }),
    'api.weather.gov/gridpoints': () => new Response('busy', { status: 503 }),
  });
  const { app } = await testApp({ fetchImpl });
  const res = await app.inject('/api/forecast/text?lat=37.29&lon=-80.05');
  assert.ok(res.statusCode >= 500);
  await app.close();
});
