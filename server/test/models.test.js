import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEnsemble, normalizeModel, agreement, percentile, confidenceWord, MODELS, ENSEMBLES } from '../src/providers/models.js';
import { testApp, mockFetch, fakeForecast } from './helpers.js';

// 11 members whose temperatures are spread 0..10 degrees above a base, and where
// members 0-5 get rain and 6-10 stay dry.
function fakeEnsemble({ members = 11, base = 60 } = {}) {
  const f = fakeForecast({ temp: base });
  const hourly = { time: f.hourly.time };
  for (let m = 0; m < members; m++) {
    const k = m === 0 ? '' : `_member${String(m).padStart(2, '0')}`;
    hourly[`temperature_2m${k}`] = f.hourly.time.map(() => base + m);
    hourly[`precipitation${k}`] = f.hourly.time.map(() => (m <= 5 ? 0.02 : 0));
  }
  return { utc_offset_seconds: f.utc_offset_seconds, timezone: f.timezone, hourly };
}

test('percentile interpolates', () => {
  assert.equal(percentile([0, 10], 0.5), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 0.1), 2);
  assert.equal(percentile([], 0.5), null);
});

test('ensemble gives 10/50/90 bands and rain chance from members', () => {
  const e = normalizeEnsemble(fakeEnsemble(), ENSEMBLES[0], 'imperial');
  assert.equal(e.members, 11);
  const d = e.daily[1];
  assert.deepEqual(d.high, { p10: 61, p50: 65, p90: 69 });
  assert.equal(d.rainChance, 55); // 6 of 11
  assert.equal(d.confidence, 'Medium'); // 8 °F range
  assert.ok(e.hourly.length > 0 && e.hourly.length <= 72);
  assert.equal(e.hourly[0].p50, 65);
});

test('confidence words', () => {
  assert.equal(confidenceWord(3, 'imperial'), 'High');
  assert.equal(confidenceWord(6, 'metric'), 'Low');
  assert.equal(confidenceWord(null, 'imperial'), null);
});

test('model agreement by day', () => {
  const a = agreement([
    { daily: [{ date: '2026-11-03', high: 60 }, { date: '2026-11-04', high: 50 }] },
    { daily: [{ date: '2026-11-03', high: 62 }, { date: '2026-11-04', high: 61 }] },
  ], 'imperial');
  assert.equal(a[0].label, 'Models agree');
  assert.equal(a[1].label, 'Models disagree');
});

test('normalizeModel drops past hours and empty days', () => {
  const raw = fakeForecast({ temp: 55 });
  raw.daily.temperature_2m_max[3] = null;
  const m = normalizeModel(raw, MODELS[0]);
  assert.ok(m.hourly.length <= 72 && m.hourly.length > 60);
  assert.ok(m.daily.every((d) => d.high != null));
});

test('/api/models compares models and reports missing ones; /api/ensemble works', async () => {
  const fetchImpl = mockFetch({
    'models=gfs_hrrr': () => new Response('{"error":true,"reason":"No data"}', { status: 400 }),
    'ensemble-api': () => Response.json(fakeEnsemble()),
  });
  const { app } = await testApp({ fetchImpl });
  const r = (await app.inject({ url: '/api/models?lat=37.55&lon=-77.46' })).json();
  assert.equal(r.models.length, MODELS.length - 1);
  assert.equal(r.missing[0].id, 'gfs_hrrr');
  assert.ok(r.models.find((m) => m.id === 'ncep_aigfs025').ai);
  assert.equal(r.agreement[1].label, 'Models agree');
  const e = await app.inject({ url: '/api/ensemble?lat=37.55&lon=-77.46&model=gfs_seamless' });
  assert.equal(e.statusCode, 200);
  assert.equal(e.json().name, 'GFS ensemble');
  assert.equal((await app.inject({ url: '/api/ensemble?lat=37.55&lon=-77.46&model=nope' })).statusCode, 400);
  await app.close();
});
