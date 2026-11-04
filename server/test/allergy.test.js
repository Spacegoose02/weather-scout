import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAir, normalizeForecast } from '../src/providers/openmeteo.js';
import { pollenReport, particleReport, breathingOutlook, allergyReport } from '../src/allergy.js';
import { fakeForecast } from './helpers.js';

const now = Date.parse('2026-06-01T16:20:00Z');
const times = Array.from({ length: 72 }, (_, i) => new Date(Date.parse('2026-06-01T00:00:00Z') + i * 3600e3).toISOString().slice(0, 16));
const col = (v) => times.map((t, i) => (typeof v === 'function' ? v(t, i) : v));
const raw = ({ pollen = false, ozone = 72 } = {}) => ({
  utc_offset_seconds: -4 * 3600,
  current: {
    us_aqi: 72, pm2_5: 18, pm10: 22, ozone: 120, nitrogen_dioxide: 9, uv_index: 7,
    ...(pollen ? { birch_pollen: 120, alder_pollen: 3, olive_pollen: 0, grass_pollen: 60, mugwort_pollen: 1, ragweed_pollen: 2 } : {}),
  },
  hourly: {
    time: times,
    us_aqi: col((t, i) => 40 + i),
    us_aqi_pm2_5: col(55), us_aqi_pm10: col(20),
    // Ozone peaks mid-afternoon each day.
    us_aqi_ozone: col((t) => (Number(t.slice(11, 13)) === 15 ? ozone : 30)), us_aqi_nitrogen_dioxide: col(8),
    pm2_5: col(18), pm10: col(22), ozone: col(120),
    ...(pollen ? { birch_pollen: col((t, i) => 50 + i * 5), grass_pollen: col(30), ragweed_pollen: col(1), alder_pollen: col(0), olive_pollen: col(0), mugwort_pollen: col(0) } : {}),
  },
});

test('normalizeAir adds pollen by species, by day and by hour when the source has it', () => {
  const a = normalizeAir(raw({ pollen: true }), now);
  assert.equal(a.pollen.tree.level, 'High');
  assert.equal(a.pollen.species[0].group, 'tree');
  assert.ok(a.pollen.species.some((s) => s.id === 'ragweed' && s.group === 'weed'));
  assert.equal(a.pollenDaily.length, 3);
  assert.equal(a.pollenDaily[0].date, '2026-06-01');
  assert.ok(a.pollenDaily[1].tree.value > a.pollenDaily[0].tree.value);
  assert.ok(a.hourly[0].pollen.grass === 30);
  assert.equal(a.hourly[0].pm25, 18);
  assert.equal(a.hourly[0].sub.pm25, 55);
});

test('without pollen the hourly rows stay lean and the report says so', () => {
  const a = normalizeAir(raw(), now);
  assert.equal(a.hourly[0].pollen, undefined);
  assert.deepEqual(a.pollenDaily, []);
  const p = pollenReport(a);
  assert.equal(p.available, false);
});

test('pollen report ranks plants and names the worst group', () => {
  const p = pollenReport(normalizeAir(raw({ pollen: true }), now));
  assert.equal(p.available, true);
  assert.equal(p.groups.length, 3);
  assert.equal(p.species[0].id, 'birch');
  assert.ok(['tree', 'grass'].includes(p.top.id));
  assert.ok(p.peak.time);
});

test('pollen from another source with only levels still works', () => {
  const p = pollenReport({ pollen: { tree: { value: null, level: 'Moderate' }, grass: { value: 2, level: 'Low' }, weed: { value: null, level: null } } });
  assert.equal(p.groups.length, 2);
  assert.equal(p.top.id, 'tree');
  assert.deepEqual(p.species, []);
});

test('particle report: concentrations, sub-AQI levels and the peak hour', () => {
  const parts = particleReport(normalizeAir(raw({ ozone: 120 }), now));
  assert.deepEqual(parts.map((x) => x.id), ['pm25', 'pm10', 'ozone', 'no2']);
  const pm = parts.find((x) => x.id === 'pm25');
  assert.equal(pm.value, 18);
  assert.equal(pm.level, 'Moderate');
  const oz = parts.find((x) => x.id === 'ozone');
  assert.equal(oz.peak.time, '2026-06-01T15:00');
  assert.equal(oz.peak.level, 'Unhealthy for sensitive groups');
  assert.deepEqual(particleReport(null), []);
});

test('breathing outlook explains ozone and thunderstorm asthma', () => {
  const air = normalizeAir(raw({ pollen: true, ozone: 120 }), now);
  const fc = normalizeForecast(fakeForecast({ code: 95 }), 'imperial');
  const b = breathingOutlook(air, fc);
  assert.equal(b.level, 'Bad');
  assert.ok(b.reasons.some((r) => /thunderstorm asthma/.test(r.text)));
  const calm = breathingOutlook(normalizeAir({ ...raw(), current: { us_aqi: 20 } }, now), normalizeForecast(fakeForecast({}), 'imperial'));
  assert.equal(calm.level, 'Good');
});

test('allergyReport copes with no air data at all', () => {
  const r = allergyReport(null, normalizeForecast(fakeForecast({ temp: 20 }), 'imperial'));
  assert.equal(r.pollen.available, false);
  assert.deepEqual(r.particles, []);
  assert.equal(r.breathing.level, 'Fair');
  assert.ok(r.breathing.reasons.some((x) => /Cold air/.test(x.text)));
});

test('Google Pollen API shape (US): index values, None level and missing-key note', () => {
  const p = pollenReport({ pollen: { tree: { value: 0, level: 'None', inSeason: false }, grass: { value: 3, level: 'High', inSeason: true }, weed: { value: 1, level: 'Low', inSeason: true }, unit: 'index', scaleMax: 5, source: 'Google Pollen API' } });
  assert.equal(p.top.id, 'grass');
  assert.equal(p.unit, 'index');
  assert.equal(p.scaleMax, 5);
  assert.equal(p.source, 'Google Pollen API');
  assert.equal(p.groups[0].inSeason, false);
  assert.match(pollenReport({ pollen: null, pollenMissing: 'needs-key' }).note, /Google Pollen API key/);
});
