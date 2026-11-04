import test from 'node:test';
import assert from 'node:assert/strict';
import { magneticLatitude, kpNeeded, parseKp, parseOvation, ovationAt, auroraOutlook, gScale, nightWindow } from '../src/aurora.js';
import { byDay, nwsDays, scoreModels, previousRunUrl } from '../src/scorecard.js';
import { testApp, mockFetch } from './helpers.js';

const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

test('geomagnetic latitude and the Kp a place needs', () => {
  // Fairbanks is deep in the auroral zone, Minneapolis on the edge, Miami far away.
  assert.ok(magneticLatitude(64.8, -147.7) > 63);
  const mpls = magneticLatitude(44.98, -93.27);
  assert.ok(mpls > 52 && mpls < 57, `Minneapolis ${mpls}`);
  assert.ok(kpNeeded(mpls) >= 4 && kpNeeded(mpls) <= 6.5);
  assert.ok(kpNeeded(magneticLatitude(25.8, -80.2)) > 9);
  assert.equal(gScale(7.3), 'G3');
  assert.equal(gScale(4), null);
});

test('parses both shapes of the Kp forecast', () => {
  const rows = parseKp([
    ['time_tag', 'kp', 'observed', 'noaa_scale'],
    ['2026-11-04 00:00:00', '2.33', 'observed', null],
    ['2026-11-04 21:00:00', '6.67', 'predicted', 'G2'],
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].kp, 6.67);
  assert.equal(rows[1].t, Date.parse('2026-11-04T21:00:00Z'));
  const objs = parseKp([{ time_tag: '2026-11-04T03:00:00', kp: 3, observed: 'estimated' }]);
  assert.equal(objs[0].kp, 3);
  assert.deepEqual(parseKp({ nope: 1 }), []);
});

test('OVATION grid lookups, overhead and toward the pole', () => {
  const ov = parseOvation({ 'Forecast Time': '2026-11-04T22:00:00Z', coordinates: [[267, 45, 3], [267, 50, 25], [267, 60, 80]] });
  assert.deepEqual(ovationAt(ov, 45.2, -93.3), { overhead: 3, horizon: 25 });
  assert.equal(ovationAt(null, 1, 1), null);
});

test('tonight runs from 6 PM to 6 AM local', () => {
  const now = Date.parse('2026-11-04T15:00:00Z'); // 10 AM in Minneapolis (UTC-5)
  const w = nightWindow(now, -5 * 3600);
  assert.equal(new Date(w.from).toISOString(), '2026-11-04T23:00:00.000Z');
  assert.equal(new Date(w.to).toISOString(), '2026-11-05T11:00:00.000Z');
});

test('aurora outlook: likely in a storm, unlikely when quiet, clouds noted', () => {
  const now = Date.parse('2026-11-04T15:00:00Z');
  const fc = { utcOffsetSeconds: -5 * 3600, hourly: Array.from({ length: 24 }, (_, i) => ({ epoch: now + i * 3600_000, cloudCover: 90 })) };
  const storm = [{ t: Date.parse('2026-11-05T03:00:00Z'), kp: 7.33, kind: 'predicted' }];
  const mpls = { lat: 44.98, lon: -93.27 };
  const a = auroraOutlook(mpls, storm, null, { now, fc });
  assert.equal(a.chance, 'likely');
  assert.equal(a.storm, 'G3');
  assert.equal(a.look, 'north');
  assert.match(a.text, /Clouds may hide it/);
  assert.equal(a.cloudsTonight, 90);
  const calm = auroraOutlook(mpls, [{ t: Date.parse('2026-11-05T03:00:00Z'), kp: 2, kind: 'predicted' }], null, { now });
  assert.equal(calm.chance, 'unlikely');
  const south = auroraOutlook({ lat: -43.5, lon: 172.6 }, storm, null, { now });
  assert.equal(south.look, 'south');
  assert.equal(south.name, 'southern lights');
});

test('aurora route uses the SWPC feeds', async () => {
  const fetchImpl = mockFetch({
    'noaa-planetary-k-index-forecast': () => json([['time_tag', 'kp', 'observed', 'noaa_scale'], [new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 19).replace('T', ' '), '8.0', 'predicted', 'G4']]),
    ovation_aurora_latest: () => json({ coordinates: [] }),
  });
  const { app } = await testApp({ fetchImpl });
  const r = await app.inject({ url: '/api/sky/aurora?lat=44.98&lon=-93.27' });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().source, 'NOAA Space Weather Prediction Center');
  assert.ok(r.json().needed > 0);
  await app.close();
});

test('scorecard: per-day highs and lows, and models ranked by error', () => {
  const times = [];
  const temps = [];
  for (const d of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']) {
    for (let h = 0; h < 24; h++) {
      times.push(`${d}T${String(h).padStart(2, '0')}:00`);
      temps.push(50 + 10 * Math.sin((h - 9) / 24 * 2 * Math.PI));
    }
  }
  const days = byDay(times, temps, times.map(() => 0), { today: '2026-11-04' });
  assert.deepEqual(Object.keys(days), ['2026-11-01', '2026-11-02', '2026-11-03'], 'today is left out');
  assert.equal(Math.round(days['2026-11-01'].high), 60);

  const truth = { '2026-11-01': { high: 60, low: 40, precip: 0 }, '2026-11-02': { high: 62, low: 41, precip: 0.3 }, '2026-11-03': { high: 58, low: 39, precip: 0 } };
  const models = [
    { id: 'a', name: 'Far off', days: { '2026-11-01': { high: 66, low: 45, precip: 0 }, '2026-11-02': { high: 70, low: 48, precip: 0 }, '2026-11-03': { high: 64, low: 44, precip: 0 } } },
    { id: 'b', name: 'Close', ai: true, days: { '2026-11-01': { high: 61, low: 40, precip: 0 }, '2026-11-02': { high: 61, low: 42, precip: 0.2 }, '2026-11-03': { high: 58, low: 38, precip: 0 } } },
    { id: 'c', name: 'Too few days', days: { '2026-11-01': { high: 60, low: 40, precip: 0 } } },
  ];
  const s = scoreModels(truth, models, 'imperial');
  assert.deepEqual(s.ranking.map((m) => m.id), ['b', 'a']);
  assert.equal(s.best.name, 'Close');
  assert.equal(s.ranking[0].rainRight, 3);
  assert.equal(s.ranking[1].rainRight, 2);
  assert.equal(s.ranking[0].perDay['2026-11-02'].rainOk, true);
});

test('NWS observations become per-day highs and lows in local time', () => {
  const feats = [];
  for (let h = 0; h < 24; h++) feats.push({ properties: { timestamp: `2026-11-02T${String(h).padStart(2, '0')}:00:00Z`, temperature: { value: h === 20 ? 20 : 10 } } });
  const d = nwsDays(feats, 0, 'imperial', '2026-11-04');
  assert.equal(d['2026-11-02'].high, 68);
  assert.equal(d['2026-11-02'].low, 50);
  assert.deepEqual(nwsDays(feats.slice(0, 5), 0, 'imperial', '2026-11-04'), {}, 'too few hours');
});

test('scorecard route: previous runs vs the NWS station', async () => {
  const now = Date.now();
  const hours = [];
  const start = Math.floor(now / 86400_000) * 86400_000 - 8 * 86400_000;
  for (let t = start; t < now + 86400_000; t += 3600_000) hours.push(t);
  const local = (t) => new Date(t).toISOString().slice(0, 16);
  const series = (fn) => hours.map((t) => fn(new Date(t).getUTCHours()));
  const fetchImpl = mockFetch({
    'previous-runs-api': (u) => {
      const bias = u.includes('ecmwf_ifs025') ? 1 : u.includes('gfs_seamless') ? 4 : null;
      if (bias == null) return json({ error: true, reason: 'no data' }, 400);
      return json({ utc_offset_seconds: 0, hourly: { time: hours.map(local), temperature_2m_previous_day1: series((h) => 50 + bias + (h > 12 ? 10 : 0)), precipitation_previous_day1: series(() => 0) } });
    },
    'api.open-meteo.com/v1/forecast': () => json({ utc_offset_seconds: 0, hourly: { time: hours.map(local), temperature_2m: series((h) => 50 + (h > 12 ? 10 : 0)), precipitation: series(() => 0) } }),
    'api.weather.gov/points': () => json({ properties: { observationStations: 'https://api.weather.gov/gridpoints/AKQ/1,1/stations' } }),
    '/stations?': () => json({}),
    'gridpoints/AKQ/1,1/stations': () => json({ features: [{ properties: { stationIdentifier: 'KRIC', name: 'Richmond International Airport' } }] }),
    'stations/KRIC/observations': () => json({ features: hours.filter((t) => t < now).map((t) => ({ properties: { timestamp: new Date(t).toISOString(), temperature: { value: (50 + (new Date(t).getUTCHours() > 12 ? 10 : 0) - 32) * 5 / 9 } } })) }),
  });
  const { app } = await testApp({ fetchImpl });
  const r = await app.inject({ url: '/api/models/scorecard?lat=37.5&lon=-77.4&units=imperial' });
  assert.equal(r.statusCode, 200, r.body);
  const s = r.json();
  assert.equal(s.truthSource.kind, 'station');
  assert.match(s.truthSource.name, /KRIC/);
  assert.deepEqual(s.ranking.map((m) => m.name), ['ECMWF', 'GFS']);
  assert.equal(s.ranking[0].avgError, 1);
  assert.equal(s.dates.length, 7);
  await app.close();
});

test('previous runs URL asks for the day-before forecast', () => {
  const u = previousRunUrl({ id: 'gfs_seamless' }, { lat: 37.5, lon: -77.4, units: 'imperial' });
  assert.match(u, /previous-runs-api\.open-meteo\.com/);
  assert.match(u, /temperature_2m_previous_day1/);
  assert.match(u, /models=gfs_seamless/);
  assert.match(u, /temperature_unit=fahrenheit/);
});
