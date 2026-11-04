import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForecast } from '../src/providers/openmeteo.js';
import { pressureWatch, pressureEffects, wbgtShade, wbgtSun, sunBoost, heatCategory, heatStress, dewComfort, dewWatch } from '../src/health.js';
import { moonPhase } from '../src/sky.js';
import { fakeForecast } from './helpers.js';

const fc = (opts, units = 'imperial') => normalizeForecast(fakeForecast(opts), units);

test('steady pressure is calm', () => {
  const p = pressureWatch(fc({}));
  assert.equal(p.level, 'calm');
});

test('a fast pressure drop ahead is a warning', () => {
  const f = fc({});
  const now = Date.now();
  f.hourly = f.hourly.map((h) => ({ ...h, pressure: h.epoch > now ? 1015 - Math.min(8, (h.epoch - now) / 3600_000 * 2) : 1015 }));
  const p = pressureWatch(f, now);
  assert.equal(p.level, 'warning');
  assert.ok(p.change <= -6);
  assert.match(p.message, /drop/);
});

test('WBGT shade estimate matches the BoM formula', () => {
  // 35 °C, 50% RH: e = 28.1 hPa, WBGT = 0.567*35 + 0.393*28.1 + 3.94 ≈ 34.8 °C
  assert.ok(Math.abs(wbgtShade(35, 50, true) - 34.8) < 0.2);
  // Same in °F
  assert.ok(Math.abs(wbgtShade(95, 50, false) - 94.6) < 0.4);
  assert.equal(wbgtShade(null, 50, true), null);
});

test('heat categories follow the flag bands', () => {
  assert.equal(heatCategory(75, false).label, 'Low');
  assert.equal(heatCategory(86, false).label, 'High');
  assert.equal(heatCategory(92, false).label, 'Extreme');
  assert.equal(heatCategory(30, true).label, 'High'); // 30 °C = 86 °F
});

test('heatStress reports now and the 24-hour peak', () => {
  const h = heatStress(fc({ temp: 90 }));
  assert.ok(h.now.wbgt > 75);
  assert.ok(h.peak.wbgt >= h.now.wbgt - 0.1);
  assert.ok(h.peak.category.label);
});

test('moon phase on known dates', () => {
  assert.equal(moonPhase(Date.UTC(2000, 0, 6, 20)).name, 'New moon');
  // Full moon 2024-01-25 17:54 UTC
  const full = moonPhase(Date.UTC(2024, 0, 25, 18));
  assert.equal(full.name, 'Full moon');
  assert.ok(full.illumination >= 98);
  // New moon 2024-04-08 (the total solar eclipse)
  assert.equal(moonPhase(Date.UTC(2024, 3, 8, 18)).name, 'New moon');
  const m = moonPhase(Date.UTC(2024, 0, 20));
  assert.ok(m.waxing);
  assert.ok(Date.parse(m.nextFull) > Date.UTC(2024, 0, 24) && Date.parse(m.nextFull) < Date.UTC(2024, 0, 27));
});

test('a slow but deep drop over the day is still flagged, with migraine and sinus notes', () => {
  const f = fc({});
  const now = Date.now();
  // 0.4 hPa an hour: never 4 hPa in 6 hours, but about 9.6 hPa over the day.
  f.hourly = f.hourly.map((h) => ({ ...h, pressure: 1015 - Math.max(0, (h.epoch - now) / 3600_000) * 0.4 }));
  const p = pressureWatch(f, now);
  assert.equal(p.level, 'watch');
  assert.ok(p.dayChange < -6);
  const ids = p.effects.map((e) => e.id);
  assert.deepEqual(ids, ['migraine', 'sinus', 'joints']);
  assert.equal(p.effects.find((e) => e.id === 'sinus').level, 'watch');
  assert.match(p.message, /over the next day/);
});

test('pressure series runs from yesterday into the forecast, and the outlook goes by day', () => {
  const f = fc({});
  const p = pressureWatch(f);
  assert.ok(p.series.length > 48);
  assert.ok(p.series[0].epoch < Date.now() - 12 * 3600_000);
  assert.ok(p.outlook.length >= 1 && p.outlook.length <= 3);
  assert.ok(p.outlook.every((d) => d.level === 'calm'));
});

test('rising pressure is easier on sinuses and joints', () => {
  const e = pressureEffects('warning', 7);
  assert.equal(e.find((x) => x.id === 'sinus').level, 'calm');
  assert.equal(e.find((x) => x.id === 'migraine').level, 'warning');
});

test('dew point comfort bands', () => {
  assert.equal(dewComfort(30, false).label, 'Very dry');
  assert.equal(dewComfort(54, false).label, 'Comfortable');
  assert.equal(dewComfort(68, false).label, 'Muggy');
  assert.equal(dewComfort(24, true).label, 'Oppressive'); // 24 °C = 75 °F
  assert.equal(dewComfort(null, false), null);
});

test('dewWatch spots muggier air on the way', () => {
  const f = fc({ dew: 55 });
  const now = Date.now();
  f.hourly = f.hourly.map((h) => ({ ...h, dewPoint: h.epoch > now + 6 * 3600_000 ? 68 : 55 }));
  const d = dewWatch(f, now);
  assert.equal(d.comfort.label, 'Comfortable');
  assert.equal(d.trend, 'rising');
  assert.equal(d.peak.comfort.label, 'Muggy');
});

test('sun adds to WBGT, less when it is windy, none at night', () => {
  assert.equal(sunBoost(0, 5), 0);
  const calm = sunBoost(900, 2, { metric: false });
  const breezy = sunBoost(900, 20, { metric: false });
  assert.ok(calm > breezy && breezy > 0);
  assert.ok(calm > 3 && calm < 7.3); // °F
  const h = { temp: 90, humidity: 50, solar: 900, windSpeed: 3 };
  assert.ok(wbgtSun(h, false) > wbgtShade(90, 50, false));
});

test('heatStress gives a sun reading and the coolest daylight hour when it is hot', () => {
  const f = fc({ temp: 92 });
  f.current.solar = 800;
  f.hourly = f.hourly.map((h, i) => ({ ...h, solar: 800, temp: 80 + (i % 12), humidity: 60 }));
  const h = heatStress(f);
  assert.ok(h.sun.wbgt > h.now.wbgt);
  assert.ok(h.best);
  assert.ok(h.best.wbgt <= h.peak.wbgt);
  assert.ok(h.riskyHours > 0);
  assert.ok(h.hourly.length > 20);
});
